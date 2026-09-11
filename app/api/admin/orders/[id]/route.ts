import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/catalog";
import {
  adminOrder,
  enqueueOrderJob,
  getOrder,
  orderEvent,
  updateOrder,
} from "@/lib/orders";
import {
  prepareOrderShipment,
  syncOrderPayment,
  syncOrderShipment,
} from "@/lib/order-processing";
import { syncShipment } from "@/lib/shipping/melhor-envio";
import {
  failure,
  json,
  HttpError,
  sameOrigin,
  readJson,
  rateLimit,
} from "@/lib/http";
const schema = z
  .object({
    action: z.enum([
      "sync",
      "prepare",
      "save",
      "confirm_manual_payment",
      "mark_local_posted",
      "mark_local_delivered",
      "cancel",
      "attach_shipment",
      "retry_shipping",
    ]),
    notes: z.string().trim().max(3000).optional(),
    fiscal_document: z
      .discriminatedUnion("type", [
        z
          .object({
            type: z.literal("invoice"),
            key: z.string().regex(/^\d{44}$/),
          })
          .strict(),
        z
          .object({
            type: z.literal("declaration"),
            key: z
              .string()
              .regex(/^\d{44}$/)
              .optional(),
          })
          .strict(),
      ])
      .optional(),
    shipment_id: z.uuid().optional(),
  })
  .strict();
export const maxDuration = 120;
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const order = await getOrder((await context.params).id);
    const { data, error } = await db()
      .from("order_events")
      .select("*")
      .eq("order_id", order.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error)
      throw new HttpError(503, "Não foi possível carregar o histórico.");
    return json({
      order: adminOrder(order),
      events: data,
      fiscal_document: order.fiscal_document,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    const { user } = await requireAdmin();
    await rateLimit(request, "admin_order", 60);
    const data = schema.parse(await readJson(request));
    let order = await getOrder((await context.params).id);
    const actor = `Admin ${user.id}`;
    if (data.action === "save") {
      const missingDocument =
        order.last_error ===
        "Informe a nota fiscal ou confirme o uso de declaração de conteúdo neste pedido.";
      await updateOrder(order.id, {
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.fiscal_document
          ? {
              fiscal_document: data.fiscal_document,
              ...(!order.shipping_started_at && missingDocument
                ? { needs_review: false, last_error: null }
                : {}),
            }
          : {}),
      });
      await orderEvent(
        order.id,
        "admin",
        `${actor}: atualizou observações/documentação.`,
      );
      if (
        order.payment_status === "paid" &&
        data.fiscal_document &&
        !order.shipping_provider_id &&
        !order.shipping_started_at
      )
        await enqueueOrderJob(order.id, "shipping_prepare");
    }
    if (data.action === "confirm_manual_payment") {
      if (order.payment_method === "pix")
        throw new HttpError(409, "O Pix só é confirmado pela VeloraPay.");
      if (order.fulfillment_status === "cancelled")
        throw new HttpError(409, "Este pedido está cancelado.");
      if (order.payment_status !== "paid") {
        const { error } = await db()
          .from("orders")
          .update({
            payment_status: "paid",
            paid_at: new Date().toISOString(),
            fulfillment_status: order.local ? "local_contact" : "preparing",
          })
          .eq("id", order.id)
          .neq("payment_status", "paid")
          .neq("fulfillment_status", "cancelled");
        if (error) throw new HttpError(503, "Não foi possível confirmar.");
        await orderEvent(
          order.id,
          "payment",
          `${actor}: confirmou recebimento conferido no atendimento.`,
        );
        if (!order.local) await enqueueOrderJob(order.id, "shipping_prepare");
      }
    }
    if (
      data.action === "mark_local_posted" ||
      data.action === "mark_local_delivered"
    ) {
      if (
        !order.local ||
        order.payment_status !== "paid" ||
        order.fulfillment_status === "cancelled"
      )
        throw new HttpError(
          409,
          "A ação exige pedido local com pagamento confirmado.",
        );
      if (
        data.action === "mark_local_posted" &&
        order.fulfillment_status === "delivered"
      )
        throw new HttpError(409, "Este pedido já foi entregue.");
      const delivered = data.action === "mark_local_delivered";
      await updateOrder(order.id, {
        fulfillment_status: delivered ? "delivered" : "posted",
        ...(delivered
          ? { delivered_at: new Date().toISOString() }
          : { posted_at: new Date().toISOString() }),
      });
      await orderEvent(
        order.id,
        "delivery",
        `${actor}: confirmou ${delivered ? "entrega" : "saída para entrega"} local.`,
      );
    }
    if (data.action === "cancel") {
      if (
        order.shipping_provider_id ||
        ["posted", "delivered"].includes(order.fulfillment_status)
      )
        throw new HttpError(
          409,
          "Confira e cancele primeiro o envio na transportadora. Pedidos já postados não são cancelados aqui.",
        );
      await updateOrder(order.id, {
        fulfillment_status: "cancelled",
        needs_review: order.payment_status === "paid",
        last_error:
          order.payment_status === "paid"
            ? "Pedido cancelado. Confira o estorno manualmente na provedora; cancelar aqui não devolve valores."
            : null,
      });
      await orderEvent(
        order.id,
        "admin",
        `${actor}: cancelou o pedido. Nenhum estorno é realizado automaticamente.`,
      );
    }
    if (data.action === "attach_shipment") {
      if (
        order.local ||
        order.payment_status !== "paid" ||
        order.shipping_provider_id ||
        !data.shipment_id
      )
        throw new HttpError(
          409,
          "Confira o pedido e o identificador do envio.",
        );
      const shipment = await syncShipment(data.shipment_id);
      await updateOrder(order.id, {
        shipping_provider_id: shipment.id,
        needs_review: false,
        last_error: null,
        fulfillment_status: "freight_pending",
      });
      await enqueueOrderJob(order.id, "shipping_sync");
      await orderEvent(
        order.id,
        "admin",
        `${actor}: vinculou o envio ${shipment.id} após conferência no Melhor Envio.`,
      );
    }
    if (data.action === "retry_shipping") {
      if (
        order.local ||
        order.payment_status !== "paid" ||
        order.shipping_provider_id ||
        order.fulfillment_status === "cancelled"
      )
        throw new HttpError(409, "Este pedido não permite recriar envio.");
      await updateOrder(order.id, {
        shipping_started_at: null,
        needs_review: false,
        last_error: null,
        fulfillment_status: "preparing",
      });
      await orderEvent(
        order.id,
        "admin",
        `${actor}: confirmou que não há envio duplicado no Melhor Envio e autorizou nova tentativa.`,
      );
      await enqueueOrderJob(order.id, "shipping_prepare");
    }
    if (data.action === "sync") {
      order = await syncOrderPayment(order);
      order = await syncOrderShipment(order);
    }
    if (data.action === "prepare" || data.action === "retry_shipping") {
      order = await getOrder(order.id);
      await prepareOrderShipment(order);
    }
    return json({ order: adminOrder(await getOrder(order.id)) });
  } catch (e) {
    return failure(e);
  }
}

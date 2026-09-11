import "server-only";
import { db } from "./catalog";
import { createPix, getPayment, VeloraError } from "./payments/velora";
import {
  prepareShipment,
  syncShipment,
  generateAndPrintLabel,
  ShippingOperationUncertainError,
  ShippingError,
  type ShippingOption,
  type ShipmentSnapshot,
} from "./shipping/melhor-envio";
import {
  enqueueOrderJob,
  getOrder,
  orderEvent,
  updateOrder,
  type OrderRecord,
} from "./orders";
import { shippingItems } from "./commerce-checkout";
import { HttpError } from "./http";

export async function startPix(order: OrderRecord): Promise<OrderRecord> {
  if (
    order.payment_method !== "pix" ||
    order.payment_provider_id ||
    order.fulfillment_status === "cancelled" ||
    !["pending", "creating"].includes(order.payment_status)
  )
    return order;
  if (
    order.payment_started_at &&
    Date.now() - new Date(order.payment_started_at).getTime() > 23 * 60 * 60_000
  ) {
    await updateOrder(order.id, {
      payment_status: "review",
      needs_review: true,
      last_error:
        "Confira na VeloraPay se esta cobrança foi criada antes de emitir outro Pix.",
    });
    return getOrder(order.id);
  }
  const cutoff = new Date(Date.now() - 60_000).toISOString();
  const claimed = await db()
    .from("orders")
    .update({
      payment_status: "creating",
      payment_started_at: order.payment_started_at ?? new Date().toISOString(),
      payment_checked_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .neq("fulfillment_status", "cancelled")
    .is("payment_provider_id", null)
    .in("payment_status", ["pending", "creating"])
    .or(`payment_checked_at.is.null,payment_checked_at.lt.${cutoff}`)
    .select("id")
    .maybeSingle();
  if (claimed.error)
    throw new HttpError(503, "Não foi possível preparar o Pix.");
  if (!claimed.data) return getOrder(order.id);
  try {
    const payment = await createPix({
      orderId: order.id,
      amountCents: order.total_cents,
      name: order.address.name,
      document: order.address.document,
      email: order.address.email,
      phone: order.address.phone,
    });
    if (payment.isTest)
      throw new HttpError(
        503,
        "A provedora está em modo de testes. Nenhum envio será liberado.",
      );
    await updateOrder(order.id, {
      payment_provider_id: payment.providerId,
      payment_status: "pending",
      needs_review: false,
      last_error: null,
      pix: {
        copy_paste: payment.pixCopyPaste,
        ...(payment.qrCode ? { qr_code: payment.qrCode } : {}),
        expires_at: payment.expiresAt,
      },
    });
  } catch (e) {
    await updateOrder(order.id, {
      last_error:
        e instanceof VeloraError
          ? e.message
          : "A cobrança precisa de conferência. O pedido está salvo; não faça outro pagamento.",
      needs_review: true,
    });
    // The original order/idempotency key is retained after ambiguous responses.
    // The durable job, never a second checkout, retries within the provider window.
  }
  return getOrder(order.id);
}

export async function syncOrderPayment(order: OrderRecord) {
  if (order.payment_method !== "pix") return order;
  if (!order.payment_provider_id) return startPix(order);
  const payment = await getPayment(order.payment_provider_id);
  if (
    payment.providerId !== order.payment_provider_id ||
    payment.orderId !== order.id ||
    payment.amountCents !== order.total_cents ||
    payment.currency !== "BRL" ||
    payment.isTest ||
    payment.type !== "CASH_IN"
  ) {
    await updateOrder(order.id, {
      needs_review: true,
      last_error: "Os dados do pagamento precisam ser conferidos na VeloraPay.",
    });
    throw new HttpError(
      409,
      "O pagamento está em conferência. Não repita o pagamento.",
    );
  }
  if (payment.status === "paid") {
    const { error } = await db().rpc("confirm_order_payment", {
      order_uuid: order.id,
      provider_id: order.payment_provider_id,
      paid_cents: payment.amountCents,
    });
    if (error)
      throw new HttpError(
        503,
        "Não foi possível registrar a confirmação do pagamento.",
      );
  } else if (order.payment_status === "paid") {
    await updateOrder(order.id, {
      needs_review: true,
      last_error:
        "O status do pagamento mudou na provedora. Confira antes de enviar.",
    });
  } else {
    const status =
      payment.status === "pending"
        ? "pending"
        : payment.status === "failed" || payment.status === "cancelled"
          ? "failed"
          : "review";
    const { error } = await db()
      .from("orders")
      .update({
        payment_status: status,
        payment_checked_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .not("payment_status", "in", "(paid,refunded)");
    if (error)
      throw new HttpError(503, "Não foi possível atualizar a situação do Pix.");
  }
  return getOrder(order.id);
}

export async function prepareOrderShipment(order: OrderRecord) {
  if (
    order.local ||
    order.payment_status !== "paid" ||
    order.fulfillment_status === "cancelled" ||
    order.needs_review
  )
    return order;
  if (order.payment_method === "pix") {
    order = await syncOrderPayment(order);
    if (order.payment_status !== "paid" || order.needs_review) return order;
  }
  if (order.shipping_provider_id) return syncOrderShipment(order);
  if (!order.fiscal_document) {
    await updateOrder(order.id, {
      needs_review: true,
      last_error:
        "Informe a nota fiscal ou confirme o uso de declaração de conteúdo neste pedido.",
    });
    return getOrder(order.id);
  }
  if (order.shipping_started_at) {
    await updateOrder(order.id, {
      needs_review: true,
      last_error:
        "Confira o carrinho no Melhor Envio. Uma tentativa anterior pode ter criado o envio.",
    });
    return getOrder(order.id);
  }
  const claimed = await db()
    .from("orders")
    .update({ shipping_started_at: new Date().toISOString() })
    .eq("id", order.id)
    .eq("payment_status", "paid")
    .eq("needs_review", false)
    .is("shipping_provider_id", null)
    .is("shipping_started_at", null)
    .select("id")
    .maybeSingle();
  if (claimed.error)
    throw new HttpError(503, "Não foi possível preparar o envio.");
  if (!claimed.data) return getOrder(order.id);
  const a = order.address;
  try {
    const shipment = await prepareShipment({
      orderId: order.id,
      paymentStatus: "paid",
      recipient: {
        name: a.name,
        email: a.email,
        phone: a.phone,
        document: a.document,
        address: a.street,
        number: a.number,
        complement: a.complement,
        district: a.neighborhood,
        city: a.city,
        state: a.state,
        postalCode: a.postal_code,
      },
      items: shippingItems(order.items),
      option: order.shipping_raw as ShippingOption,
      fiscalDocument:
        order.fiscal_document.type === "invoice"
          ? { type: "invoice", key: order.fiscal_document.key! }
          : {
              type: "declaration",
              authorized: true,
              ...(order.fiscal_document.key
                ? { key: order.fiscal_document.key }
                : {}),
            },
    });
    await updateOrder(order.id, {
      shipping_provider_id: shipment.id,
      fulfillment_status: "freight_pending",
      needs_review: false,
      last_error: null,
    });
    await enqueueOrderJob(order.id, "shipping_sync", 300);
    await orderEvent(
      order.id,
      "shipping",
      "Envio preparado. Aguardando pagamento do frete pela loja no Melhor Envio.",
    );
  } catch (e) {
    // A timeout after POST /cart must never silently create a duplicate label.
    const uncertain =
      e instanceof ShippingOperationUncertainError ||
      !(e instanceof ShippingError);
    await updateOrder(order.id, {
      needs_review: true,
      fulfillment_status: "attention",
      ...(uncertain ? {} : { shipping_started_at: null }),
      last_error:
        e instanceof ShippingError
          ? e.message
          : "Confira no Melhor Envio se o envio foi criado antes de tentar novamente.",
    });
  }
  return getOrder(order.id);
}

async function applyShipment(order: OrderRecord, shipment: ShipmentSnapshot) {
  const status =
    shipment.deliveredAt || shipment.status === "delivered"
      ? "delivered"
      : shipment.postedAt ||
          ["posted", "in_transit", "received"].includes(shipment.status)
        ? "posted"
        : shipment.generatedAt || shipment.status === "generated"
          ? "ready_to_post"
          : "freight_pending";
  const cancelled =
    !!shipment.canceledAt ||
    shipment.status === "canceled" ||
    shipment.status === "cancelled";
  // Keep historical tracking events, and append only actual carrier status changes.
  const descriptions = {
    delivered: "Transportadora confirmou a entrega.",
    posted:
      "Transportadora confirmou a postagem. Acompanhe as movimentações no rastreio.",
    ready_to_post: "Etiqueta liberada. O pedido aguarda postagem.",
    freight_pending: "Envio em preparação pela loja.",
  };
  const events = [...order.tracking_events];
  const description = cancelled
    ? "A transportadora informou cancelamento do envio. A loja está conferindo."
    : descriptions[status];
  if (events.at(-1)?.description !== description)
    events.push({
      date:
        shipment.deliveredAt ||
        shipment.postedAt ||
        shipment.generatedAt ||
        new Date().toISOString(),
      description,
    });
  const rank: Record<string, number> = {
    freight_pending: 0,
    ready_to_post: 1,
    posted: 2,
    delivered: 3,
  };
  const effectiveStatus =
    !cancelled && (rank[order.fulfillment_status] ?? -1) > rank[status]
      ? order.fulfillment_status
      : status;
  await updateOrder(order.id, {
    fulfillment_status: cancelled ? "attention" : effectiveStatus,
    tracking_code: shipment.trackingCode ?? order.tracking_code,
    tracking_url: shipment.trackingUrl ?? order.tracking_url,
    tracking_events: events.slice(-100),
    tracking_updated_at: new Date().toISOString(),
    posted_at: shipment.postedAt ?? order.posted_at,
    delivered_at: shipment.deliveredAt ?? order.delivered_at,
    ...(cancelled
      ? {
          needs_review: true,
          last_error: "Envio cancelado na transportadora. Verifique o pedido.",
        }
      : {}),
  });
}
export async function syncOrderShipment(order: OrderRecord) {
  if (
    !order.shipping_provider_id ||
    order.payment_status !== "paid" ||
    order.local
  )
    return order;
  const shipment = await syncShipment(order.shipping_provider_id);
  await applyShipment(order, shipment);
  if (
    shipment.paidAt &&
    !shipment.canceledAt &&
    !order.needs_review &&
    !order.label_url &&
    ["released", "generated", "received", "posted", "delivered"].includes(
      shipment.status,
    )
  ) {
    // This endpoint prints an already-paid shipment. There is no freight purchase call.
    const label = await generateAndPrintLabel(order.shipping_provider_id);
    await updateOrder(order.id, { label_url: label.url });
    await applyShipment(await getOrder(order.id), label.shipment);
  }
  return getOrder(order.id);
}

type Job = {
  id: string;
  order_id: string;
  kind: "payment_sync" | "shipping_prepare" | "shipping_sync";
  lock_token: string;
  attempts: number;
};
export async function processOrderJobs(batch = 5) {
  const { data, error } = await db().rpc("claim_order_jobs", {
    batch_size: Math.min(3, batch),
  });
  if (error)
    throw new HttpError(503, "Não foi possível consultar a fila de pedidos.");
  let processed = 0;
  for (const job of (data ?? []) as Job[]) {
    let done = false;
    let lastError: string | null = null;
    let delay = 300;
    try {
      let order = await getOrder(job.order_id);
      if (job.kind === "payment_sync") {
        order = await syncOrderPayment(order);
        done =
          ["paid", "failed", "expired", "refunded", "review"].includes(
            order.payment_status,
          ) ||
          (order.fulfillment_status === "cancelled" &&
            !order.payment_provider_id);
        if (
          !done &&
          Date.now() - new Date(order.created_at).getTime() > 48 * 60 * 60_000
        ) {
          await updateOrder(order.id, {
            needs_review: true,
            last_error:
              "Pix ainda sem confirmação após 48 horas. Confira na provedora antes de encerrar o pedido.",
          });
          done = true;
        }
      } else if (job.kind === "shipping_prepare") {
        order = await prepareOrderShipment(order);
        done =
          !!order.shipping_provider_id ||
          order.needs_review ||
          order.payment_status !== "paid" ||
          order.local;
      } else {
        order = await syncOrderShipment(order);
        done =
          order.fulfillment_status === "delivered" ||
          order.fulfillment_status === "cancelled" ||
          !order.shipping_provider_id;
        delay = order.fulfillment_status === "posted" ? 1800 : 300;
      }
    } catch (e) {
      lastError =
        e instanceof ShippingError ||
        e instanceof VeloraError ||
        e instanceof HttpError
          ? e.message
          : "Falha temporária ao sincronizar. Nova tentativa agendada.";
      delay = Math.min(3600, 60 * 2 ** Math.min(job.attempts, 6));
      if (job.attempts >= 10)
        await updateOrder(job.order_id, {
          needs_review: true,
          last_error: lastError,
        });
    }
    const { error: saveError } = await db()
      .from("order_jobs")
      .update({
        done,
        last_error: lastError,
        run_at: new Date(Date.now() + delay * 1000).toISOString(),
        locked_until: null,
        lock_token: null,
      })
      .eq("id", job.id)
      .eq("lock_token", job.lock_token);
    if (saveError)
      throw new HttpError(
        503,
        "Não foi possível guardar o resultado da sincronização.",
      );
    processed++;
  }
  return { processed };
}

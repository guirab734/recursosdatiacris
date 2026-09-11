"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  CreditCard,
  ExternalLink,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Package,
  PackageCheck,
  QrCode,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Truck,
  UserRound,
} from "lucide-react";
import { Header, Footer } from "./header";
import { money } from "@/lib/types";
import {
  paymentLabels,
  type CustomerOrder,
  type FulfillmentStatus,
} from "@/lib/commerce-types";
import { track } from "@/lib/client-events";
import "./commerce.css";

const customerStatus: Record<FulfillmentStatus, string> = {
  awaiting_payment: "Aguardando pagamento",
  local_contact: "Entrega a combinar",
  preparing: "Em preparação",
  freight_pending: "Em preparação",
  ready_to_post: "Pronto para postar",
  posted: "A caminho",
  delivered: "Entregue",
  cancelled: "Cancelado",
  attention: "Em acompanhamento",
};
const date = (value: string, includeTime = false) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        ...(includeTime
          ? ({ hour: "2-digit", minute: "2-digit" } as const)
          : {}),
      });
};
function safeExternal(value: string | null | undefined, whatsapp = false) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password)
      return undefined;
    if (
      whatsapp &&
      !["wa.me", "api.whatsapp.com", "web.whatsapp.com"].includes(url.hostname)
    )
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}
function statusTone(order: CustomerOrder) {
  if (order.fulfillment_status === "delivered") return "is-delivered";
  if (order.fulfillment_status === "posted") return "is-posted";
  if (
    ["failed", "expired", "review"].includes(order.payment_status) ||
    order.fulfillment_status === "cancelled"
  )
    return "is-attention";
  return "is-pending";
}

export function CustomerOrders() {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "progress" | "delivered">("all");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/orders", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || "Não conseguimos carregar seus pedidos agora.",
        );
      setOrders(data.orders ?? []);
      setAuthenticated(!!data.authenticated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const visible = orders.filter(
    (order) =>
      filter === "all" ||
      (filter === "delivered"
        ? order.fulfillment_status === "delivered"
        : !["delivered", "cancelled"].includes(order.fulfillment_status)),
  );

  return (
    <>
      <Header />
      <main className="page-wrap commerce-orders-page">
        <div className="eyebrow">CADA DESCOBERTA TEM UM CAMINHO</div>
        <div className="commerce-title-row">
          <div>
            <h1 className="page-title">
              Suas próximas <em>alegrias.</em>
            </h1>
            <p className="page-subtitle">
              Do primeiro clique até chegar às suas mãos. Acompanhe tudo por
              aqui.
            </p>
          </div>
          <Link className="commerce-text-link" href="/#catalogo">
            <ShoppingBag size={17} /> Explorar recursos
          </Link>
        </div>
        {!authenticated && !loading && (
          <div className="commerce-account-banner">
            <UserRound size={24} />
            <div>
              <strong>Seus pedidos, sempre por perto.</strong>
              <p>
                Os pedidos feitos neste navegador aparecem aqui. Entre com seu
                e-mail para acessar sua conta em outro aparelho.
              </p>
            </div>
            <Link href="/conta" className="button secondary">
              Acessar minha conta <ArrowRight size={16} />
            </Link>
          </div>
        )}
        <div className="commerce-orders-toolbar">
          <div className="commerce-order-filters" aria-label="Filtrar pedidos">
            {(
              [
                { id: "all", label: "Todos os pedidos" },
                { id: "progress", label: "Em andamento" },
                { id: "delivered", label: "Entregues" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={filter === tab.id ? "is-active" : ""}
                aria-pressed={filter === tab.id}
                onClick={() => setFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            className="commerce-text-link"
            type="button"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? "commerce-spin" : ""} />{" "}
            Atualizar
          </button>
        </div>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <div className="commerce-loading" role="status">
            <LoaderCircle size={28} className="commerce-spin" />
            <p>Buscando suas descobertas...</p>
          </div>
        ) : error ? null : !visible.length ? (
          <div className="empty-state">
            <Package size={44} />
            <h3>
              {orders.length
                ? "Nenhum pedido por aqui ainda."
                : "Sua próxima descoberta está no ateliê."}
            </h3>
            <p>
              {orders.length
                ? "Escolha outro filtro para ver seus pedidos."
                : "Quando você concluir uma compra, o pedido e as novidades da entrega vão aparecer aqui."}
            </p>
            <Link href="/#catalogo" className="button primary">
              Conhecer os recursos <ArrowRight size={18} />
            </Link>
          </div>
        ) : (
          <div className="commerce-order-list">
            {visible.map((order) => (
              <Link
                key={order.id}
                href={`/pedidos/${encodeURIComponent(order.id)}`}
                className="commerce-order-preview"
              >
                <div className="commerce-order-preview-icon">
                  {order.fulfillment_status === "delivered" ? (
                    <PackageCheck size={27} />
                  ) : order.fulfillment_status === "posted" ? (
                    <Truck size={27} />
                  ) : (
                    <ShoppingBag size={27} />
                  )}
                </div>
                <div className="commerce-order-preview-main">
                  <div className="commerce-order-preview-heading">
                    <h2>Pedido {order.reference}</h2>
                    <span className={`commerce-status ${statusTone(order)}`}>
                      {customerStatus[order.fulfillment_status]}
                    </span>
                  </div>
                  <p>
                    {date(order.created_at)} <span>·</span>{" "}
                    {order.items.reduce((sum, item) => sum + item.quantity, 0)}{" "}
                    recursos
                  </p>
                  <p className="commerce-order-product-names">
                    {order.items.map((item) => item.name).join(", ")}
                  </p>
                </div>
                <div className="commerce-order-preview-total">
                  <strong>{money(order.total_cents)}</strong>
                  <span>
                    Ver pedido <ArrowRight size={15} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}

export function CustomerOrderDetail({ id }: { id: string }) {
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(0);
  const syncLock = useRef(false);
  const syncFailures = useRef(0);
  const latestId = useRef(id);
  latestId.current = id;
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (latestId.current !== id) return;
      if (!response.ok)
        throw new Error(
          data.error || "Este pedido não está disponível neste acesso.",
        );
      setOrder(data.order);
    } catch (e) {
      if (latestId.current === id) setError((e as Error).message);
    } finally {
      if (latestId.current === id) setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const sync = useCallback(
    async (automatic = false) => {
      if (syncLock.current) return;
      syncLock.current = true;
      setSyncing(true);
      if (!automatic) setError("");
      try {
        const response = await fetch(
          `/api/orders/${encodeURIComponent(id)}/sync`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          },
        );
        const data = await response.json();
        if (latestId.current !== id) return;
        if (!response.ok)
          throw new Error(
            data.error ||
              "A atualização está demorando. Tente novamente em instantes.",
          );
        setOrder(data.order);
        syncFailures.current = 0;
      } catch (e) {
        if (latestId.current !== id) return;
        syncFailures.current++;
        if (!automatic || syncFailures.current >= 3)
          setError(
            automatic
              ? "Não conseguimos atualizar automaticamente agora. Use Atualizar status em instantes."
              : (e as Error).message,
          );
      } finally {
        setSyncing(false);
        syncLock.current = false;
      }
    },
    [id],
  );

  useEffect(() => {
    if (
      order?.payment_method !== "pix" ||
      !["pending", "creating"].includes(order.payment_status)
    )
      return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && syncFailures.current < 3)
        void sync(true);
    }, 20000);
    return () => clearInterval(timer);
  }, [order?.payment_method, order?.payment_status, sync]);

  async function copyPix() {
    if (!order?.pix?.copy_paste) return;
    try {
      await navigator.clipboard.writeText(order.pix.copy_paste);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setError(
        "Não conseguimos copiar automaticamente. Selecione o código Pix abaixo e copie.",
      );
    }
  }

  const whatsapp = safeExternal(order?.whatsapp_url, true);
  const tracking = safeExternal(order?.tracking_url);
  const paid = order?.payment_status === "paid";
  const pixExpired =
    order?.payment_status === "expired" ||
    !!(
      order?.pix?.expires_at &&
      now &&
      new Date(order.pix.expires_at).getTime() <= now
    );
  const qr = order?.pix?.qr_code;
  const qrImage =
    qr &&
    (/^data:image\/(png|jpeg|webp|gif);base64,[a-z\d+/=\s]+$/i.test(qr)
      ? qr
      : /^https:\/\//.test(qr)
        ? safeExternal(qr)
        : /^[a-z\d+/=\s]+$/i.test(qr)
          ? `data:image/png;base64,${qr}`
          : undefined);
  const minutesLeft =
    order?.pix?.expires_at && now
      ? Math.max(
          0,
          Math.ceil((new Date(order.pix.expires_at).getTime() - now) / 60000),
        )
      : null;
  const progressIndex = !order
    ? 0
    : order.fulfillment_status === "delivered"
      ? 3
      : order.fulfillment_status === "posted"
        ? 2
        : paid ||
            ["preparing", "freight_pending", "ready_to_post"].includes(
              order.fulfillment_status,
            )
          ? 1
          : 0;

  return (
    <>
      <Header />
      <main className="page-wrap commerce-orders-page">
        <Link href="/pedidos" className="continue-link commerce-back">
          <ArrowLeft size={16} /> Todos os meus pedidos
        </Link>
        {loading ? (
          <div className="commerce-loading" role="status">
            <LoaderCircle size={30} className="commerce-spin" />
            <p>Preparando os detalhes do pedido...</p>
          </div>
        ) : !order ? (
          <div className="commerce-card commerce-access-error">
            <ShieldCheck size={35} />
            <h1>Vamos encontrar seu pedido.</h1>
            <p>{error || "Não foi possível abrir o pedido neste acesso."}</p>
            <p className="small-note">
              Use o navegador em que fez a compra ou entre na sua conta com o
              e-mail do pedido.
            </p>
            <div className="commerce-action-row">
              <Link href="/conta" className="button primary">
                Acessar minha conta <ArrowRight size={17} />
              </Link>
              <button type="button" className="button secondary" onClick={load}>
                Tentar novamente
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="eyebrow">SEU PEDIDO NO ATELIÊ</div>
            <div className="commerce-title-row">
              <div>
                <h1 className="page-title">
                  Pedido{" "}
                  <em style={{ overflowWrap: "anywhere" }}>
                    {order.reference}
                  </em>
                </h1>
                <p className="page-subtitle">
                  Escolhido em {date(order.created_at)}. Preparado com carinho.
                </p>
              </div>
              <span
                className={`commerce-status commerce-status-large ${statusTone(order)}`}
              >
                {customerStatus[order.fulfillment_status]}
              </span>
            </div>
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <div className="commerce-detail-layout">
              <div className="commerce-detail-main">
                {paid && (
                  <div className="commerce-paid-note" role="status">
                    <CheckCircle2 size={30} />
                    <div>
                      <strong>
                        Pagamento confirmado. A diversão está mais perto!
                      </strong>
                      <p>
                        {order.local
                          ? "Agora é só combinar a entrega com a Tia Cris."
                          : "Vamos preparar seu pedido. Acompanhe cada etapa aqui."}
                      </p>
                    </div>
                  </div>
                )}
                {order.payment_method === "pix" &&
                  !paid &&
                  !["refunded", "review"].includes(order.payment_status) &&
                  order.fulfillment_status !== "cancelled" && (
                    <section className="commerce-card commerce-pix">
                      <div className="commerce-section-heading">
                        <span className="commerce-step">
                          <QrCode size={21} />
                        </span>
                        <div>
                          <h2>
                            {pixExpired
                              ? "Vamos conferir seu Pix"
                              : "Falta só um Pix"}
                          </h2>
                          <p>
                            {pixExpired
                              ? "O prazo deste código terminou."
                              : "Abra o aplicativo do seu banco para pagar."}
                          </p>
                        </div>
                      </div>
                      {pixExpired ? (
                        <p>
                          Se você já pagou, clique em atualizar status para
                          conferir a confirmação. Se ainda não pagou, fale com a
                          Tia Cris para continuar.
                        </p>
                      ) : order.pix?.copy_paste ? (
                        <>
                          <div className="commerce-pix-payment">
                            {qrImage && (
                              <div className="commerce-qr">
                                <img
                                  src={qrImage}
                                  width="208"
                                  height="208"
                                  alt="QR Code Pix deste pedido"
                                />
                              </div>
                            )}
                            <div>
                              <span className="eyebrow">TOTAL A PAGAR</span>
                              <strong className="commerce-pix-amount">
                                {money(order.total_cents)}
                              </strong>
                              <p>
                                Leia o QR Code ou copie o código e escolha Pix
                                Copia e Cola no seu banco.
                              </p>
                              {minutesLeft !== null && (
                                <span className="commerce-pix-expiry">
                                  <Clock3 size={14} />{" "}
                                  {minutesLeft > 0
                                    ? `Disponível por mais ${minutesLeft} min`
                                    : "Conferindo validade..."}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            className="button primary full-width"
                            type="button"
                            onClick={copyPix}
                          >
                            {copied ? (
                              <>
                                <Check size={18} /> Código copiado
                              </>
                            ) : (
                              <>
                                <Copy size={18} /> Copiar código Pix
                              </>
                            )}
                          </button>
                          <details className="commerce-pix-code">
                            <summary>Ver código Pix copia e cola</summary>
                            <textarea
                              aria-label="Código Pix copia e cola"
                              readOnly
                              value={order.pix.copy_paste}
                              onFocus={(event) => event.target.select()}
                            />
                          </details>
                          <p className="small-note commerce-inline-icon">
                            <ShieldCheck size={14} /> A confirmação aparece
                            automaticamente. Confira o valor e o recebedor no
                            aplicativo do seu banco.
                          </p>
                        </>
                      ) : (
                        <div className="commerce-pix-wait">
                          <LoaderCircle
                            size={24}
                            className={
                              order.payment_status === "creating" ||
                              order.payment_status === "pending"
                                ? "commerce-spin"
                                : ""
                            }
                          />
                          <p>
                            {order.payment_status === "failed"
                              ? "Não foi possível preparar o Pix agora. Atualize o status ou fale com a Tia Cris."
                              : "Estamos preparando seu Pix. Esta página atualiza automaticamente."}
                          </p>
                        </div>
                      )}
                      <button
                        type="button"
                        className="commerce-text-link commerce-refresh-payment"
                        onClick={() => sync()}
                        disabled={syncing}
                      >
                        <RefreshCw
                          size={16}
                          className={syncing ? "commerce-spin" : ""}
                        />{" "}
                        {syncing
                          ? "Conferindo pagamento..."
                          : "Já paguei, atualizar status"}
                      </button>
                    </section>
                  )}

                {(order.local ||
                  order.payment_method === "card" ||
                  pixExpired ||
                  ["failed", "review"].includes(order.payment_status)) &&
                  whatsapp && (
                    <section className="commerce-card commerce-whatsapp-order">
                      <MessageCircle size={29} />
                      <h2>
                        {order.local
                          ? "Vamos combinar a sua entrega?"
                          : order.payment_method === "card"
                            ? "Seu cartão, com atendimento de perto."
                            : "A Tia Cris ajuda você por aqui."}
                      </h2>
                      <p>
                        {order.local
                          ? "A mensagem já leva os recursos escolhidos, seus dados e o endereço. É só abrir, revisar e enviar para combinarmos os detalhes."
                          : order.payment_method === "card"
                            ? "Seu pedido está salvo. Abra a mensagem pronta para combinar o pagamento por cartão com a Tia Cris."
                            : "Envie a mensagem com os dados do pedido para receber ajuda com o pagamento."}
                      </p>
                      {order.payment_method === "card" && (
                        <p className="small-note">
                          Pode haver uma pequena taxa da provedora. O valor será
                          informado antes de você pagar.
                        </p>
                      )}
                      <a
                        href={whatsapp}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="button whatsapp full-width"
                        onClick={() =>
                          track(
                            "whatsapp",
                            order.items.map((item) => item.product_id),
                          )
                        }
                      >
                        <MessageCircle size={18} /> Abrir pedido no WhatsApp{" "}
                        <ExternalLink size={15} />
                      </a>
                      <p className="small-note">
                        A mensagem só será enviada quando você confirmar no
                        WhatsApp.
                      </p>
                    </section>
                  )}

                <section className="commerce-card">
                  <div className="commerce-section-heading">
                    <span className="commerce-step">
                      <Truck size={22} />
                    </span>
                    <div>
                      <h2>O caminho da sua descoberta</h2>
                      <p>
                        {order.local
                          ? "Entrega local combinada com você."
                          : "As novidades chegam aqui a cada atualização da transportadora."}
                      </p>
                    </div>
                  </div>
                  <ol className="commerce-order-journey">
                    {[
                      { title: "Pedido recebido", Icon: ShoppingBag },
                      { title: "Em preparação", Icon: Package },
                      {
                        title: order.local ? "Saiu para entrega" : "Postado",
                        Icon: Truck,
                      },
                      { title: "Entregue", Icon: CheckCircle2 },
                    ].map((step, index) => (
                      <li
                        key={step.title}
                        className={
                          index < progressIndex
                            ? "is-done"
                            : index === progressIndex
                              ? "is-current"
                              : ""
                        }
                      >
                        <span>
                          {index < progressIndex ? (
                            <Check size={19} />
                          ) : (
                            <step.Icon size={19} />
                          )}
                        </span>
                        <strong>{step.title}</strong>
                      </li>
                    ))}
                  </ol>
                  {order.fulfillment_status === "cancelled" ? (
                    <p className="commerce-detail-note">
                      Este pedido foi cancelado. Se precisar, fale com a Tia
                      Cris.
                    </p>
                  ) : order.shipping &&
                    !["posted", "delivered"].includes(
                      order.fulfillment_status,
                    ) ? (
                    <p className="commerce-detail-note">
                      Estimativa escolhida:{" "}
                      <strong>
                        {order.shipping.min_days} a {order.shipping.max_days}{" "}
                        dias úteis
                      </strong>{" "}
                      após a confirmação do pagamento, incluindo preparação e
                      postagem.
                    </p>
                  ) : null}
                  {order.tracking_code ? (
                    <div className="commerce-tracking-code">
                      <div>
                        <small>CÓDIGO DE RASTREIO</small>
                        <strong>{order.tracking_code}</strong>
                      </div>
                      {tracking && (
                        <a
                          href={tracking}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="commerce-text-link"
                        >
                          Ver na transportadora <ExternalLink size={15} />
                        </a>
                      )}
                    </div>
                  ) : (
                    <p className="small-note">
                      {order.local
                        ? "Para saber o horário e os detalhes da entrega local, converse pelo WhatsApp."
                        : "O código de rastreio aparece aqui quando estiver disponível."}
                    </p>
                  )}
                  {order.tracking_events.length > 0 && (
                    <ol className="commerce-tracking-events">
                      {order.tracking_events.map((event, index) => (
                        <li key={`${event.date}-${index}`}>
                          <span />
                          <div>
                            <time dateTime={event.date}>
                              {date(event.date, true)}
                            </time>
                            <strong>{event.description}</strong>
                            {event.location && <p>{event.location}</p>}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                  <div className="commerce-tracking-footer">
                    <p className="small-note">
                      {order.tracking_updated_at
                        ? `Última consulta em ${date(order.tracking_updated_at, true)}.`
                        : "Os status refletem as informações mais recentes disponibilizadas."}
                    </p>
                    <button
                      type="button"
                      className="commerce-text-link"
                      onClick={() => sync()}
                      disabled={syncing}
                    >
                      <RefreshCw
                        size={15}
                        className={syncing ? "commerce-spin" : ""}
                      />{" "}
                      Atualizar status
                    </button>
                  </div>
                </section>
                <section className="commerce-card">
                  <div className="commerce-section-heading">
                    <span className="commerce-step">
                      <MapPin size={21} />
                    </span>
                    <div>
                      <h2>O endereço da alegria</h2>
                      <p>Confira onde seu pedido vai chegar.</p>
                    </div>
                  </div>
                  <address className="commerce-address">
                    <strong>{order.address.name}</strong>
                    <span>
                      {order.address.street}, {order.address.number}
                      {order.address.complement
                        ? `, ${order.address.complement}`
                        : ""}
                    </span>
                    <span>
                      {order.address.neighborhood}, {order.address.city}/
                      {order.address.state}
                    </span>
                    <span>
                      CEP{" "}
                      {order.address.postal_code.replace(
                        /^(\d{5})(\d{3})$/,
                        "$1-$2",
                      )}
                    </span>
                    <span>{order.address.phone}</span>
                    <span>{order.address.email}</span>
                  </address>
                  <p className="small-note commerce-address-note">
                    Precisa corrigir algum dado? Avise a Tia Cris antes da
                    postagem.
                  </p>
                </section>
              </div>
              <aside className="commerce-recap commerce-order-recap">
                <div className="commerce-recap-top">
                  <span className="eyebrow">FEITO PARA DESCOBRIR</span>
                  <h2>
                    Dentro do
                    <br />
                    <em>seu pedido.</em>
                  </h2>
                </div>
                <div className="commerce-order-lines">
                  {order.items.map((item) => (
                    <div key={item.product_id}>
                      <div>
                        <span className="commerce-item-quantity">
                          {item.quantity}×
                        </span>
                        <strong>{item.name}</strong>
                      </div>
                      <span>{money(item.subtotal_cents)}</span>
                    </div>
                  ))}
                </div>
                <div className="summary-line">
                  <span>Produtos</span>
                  <strong>{money(order.subtotal_cents)}</strong>
                </div>
                <div className="summary-line">
                  <span>Entrega</span>
                  <strong>
                    {order.local && order.coupon?.kind === "final_total"
                      ? "Incluída no cupom"
                      : order.local && order.subtotal_cents - (order.discount_cents || 0) < 15000
                      ? "A combinar"
                      : order.shipping_cents === 0
                        ? "Grátis"
                        : money(order.shipping_cents)}
                  </strong>
                </div>
                {order.coupon && order.discount_cents > 0 && (
                  <div className="summary-line">
                    <span>Cupom {order.coupon.code}</span>
                    <strong>-{money(order.discount_cents)}</strong>
                  </div>
                )}
                <div className="summary-line total">
                  <span>
                    {order.local && order.coupon?.kind !== "final_total" && order.subtotal_cents - (order.discount_cents || 0) < 15000
                      ? "Total dos produtos"
                      : "Total"}
                  </span>
                  <strong>{money(order.total_cents)}</strong>
                </div>
                <p className="commerce-order-payment-status">
                  <span>
                    {order.payment_method === "pix" ? (
                      <QrCode size={17} />
                    ) : order.payment_method === "card" ? (
                      <CreditCard size={17} />
                    ) : (
                      <MessageCircle size={17} />
                    )}
                    {order.payment_method === "pix"
                      ? "Pix"
                      : order.payment_method === "card"
                        ? "Cartão pelo WhatsApp"
                        : "Pagamento a combinar"}
                  </span>
                  <strong>{paymentLabels[order.payment_status]}</strong>
                </p>
                {order.local && order.coupon?.kind !== "final_total" && order.subtotal_cents - (order.discount_cents || 0) < 15000 && (
                  <p className="small-note">
                    O frete será combinado pelo WhatsApp e somado ao valor dos
                    produtos.
                  </p>
                )}
                {order.payment_method === "card" && (
                  <p className="small-note">
                    Eventual taxa do cartão será confirmada no atendimento.
                  </p>
                )}
                {order.shipping && (
                  <p className="small-note">
                    {order.shipping.company} · {order.shipping.name}
                  </p>
                )}
                <div className="commerce-recap-footer">
                  <ShieldCheck size={19} />
                  <p>
                    Seus dados ficam protegidos.
                    <br />
                    <Link href="/conta">
                      Acesse sua conta em outro aparelho{" "}
                      <ArrowRight size={12} />
                    </Link>
                  </p>
                </div>
                {whatsapp && (
                  <a
                    className="commerce-text-link commerce-help"
                    href={whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle size={17} /> Preciso de ajuda com o pedido
                  </a>
                )}
              </aside>
            </div>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}

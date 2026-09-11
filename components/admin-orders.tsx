"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  CreditCard,
  ExternalLink,
  FileText,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  MapPin,
  Package,
  Printer,
  RefreshCw,
  Search,
  ShoppingBag,
  Truck,
  X,
} from "lucide-react";
import { Brand } from "./header";
import { money } from "@/lib/types";
import {
  fulfillmentLabels,
  paymentLabels,
  type AdminOrder,
} from "@/lib/commerce-types";
import "./admin-orders.css";

type Filter =
  "all" | "pending" | "to_post" | "posted" | "delivered" | "attention";
type Action =
  | "sync"
  | "prepare"
  | "save"
  | "confirm_manual_payment"
  | "mark_local_posted"
  | "mark_local_delivered"
  | "cancel"
  | "attach_shipment"
  | "retry_shipping";
type FiscalDocument = { type: "invoice" | "declaration"; key?: string };
type OrderEvent = {
  id: string;
  kind: string;
  message: string;
  created_at: string;
};
type Detail = {
  order: AdminOrder;
  events: OrderEvent[];
  fiscal_document: FiscalDocument | null;
};
type Summary = {
  total: number;
  paid_cents: number;
  to_post: number;
  posted: number;
  delivered: number;
  pending: number;
  attention: number;
};
type Confirmation = {
  action: Action;
  title: string;
  message: string;
  button: string;
  checkbox?: string;
  danger?: boolean;
};
type IntegrationStatus = {
  pix_configured: boolean;
  pix_webhook_configured: boolean;
  shipping_configured: boolean;
  customer_signup_enabled: boolean;
  google_enabled: boolean;
  apple_enabled: boolean;
  scheduler: {
    active: boolean;
    last_run: string | null;
    pending_jobs: number;
  } | null;
};
const filters: { id: Filter; label: string; icon: typeof Package }[] = [
  { id: "all", label: "Todos", icon: ShoppingBag },
  { id: "pending", label: "Aguardando pagamento", icon: Clock3 },
  { id: "to_post", label: "A postar", icon: Package },
  { id: "posted", label: "Postados", icon: Truck },
  { id: "delivered", label: "Concluídos", icon: CheckCircle2 },
  { id: "attention", label: "Precisam de atenção", icon: AlertCircle },
];
const date = (value: string | null | undefined) => {
  if (!value) return "Ainda não informado";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Data indisponível"
    : parsed.toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      });
};
const number = (order: AdminOrder) =>
  `#${String(order.number).padStart(4, "0")}`;
const method = (order: AdminOrder) =>
  order.payment_method === "pix"
    ? "Pix"
    : order.payment_method === "card"
      ? "Cartão pelo WhatsApp"
      : "Combinado pelo WhatsApp";
const externalUrl = (value: string | null, allowed: string[]) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      allowed.includes(url.hostname) &&
      !url.username &&
      !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...options });
  if (response.status === 401) {
    window.location.assign("/admin/login");
    throw new Error("Entre novamente para continuar.");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      body?.error || "Não foi possível concluir. Tente novamente.",
    );
  if (!body) throw new Error("O servidor não respondeu. Tente novamente.");
  return body as T;
}

function Status({ order }: { order: AdminOrder }) {
  return (
    <span className={`ao-status ao-status-${order.fulfillment_status}`}>
      <i aria-hidden="true" />
      {fulfillmentLabels[order.fulfillment_status]}
    </span>
  );
}

export function AdminOrders({ email }: { email: string }) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, page_size: 30 });
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(
    null,
  );
  const [integrationError, setIntegrationError] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [busy, setBusy] = useState<Action | null>(null);
  const [notes, setNotes] = useState("");
  const [documentType, setDocumentType] = useState<
    "" | "invoice" | "declaration"
  >("");
  const [documentKey, setDocumentKey] = useState("");
  const [shipmentId, setShipmentId] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const detailsDialog = useRef<HTMLDialogElement>(null);
  const confirmationDialog = useRef<HTMLDialogElement>(null);
  const selectedId = useRef<string | null>(null);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const lastFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const refresh = useCallback(
    async (quiet = false) => {
      const request = ++listRequest.current;
      if (!quiet) setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          status: filter,
          search: query,
          page: String(page),
        });
        const response = await api<{
          orders: AdminOrder[];
          summary: Summary;
          page: number;
          total: number;
          page_size: number;
        }>(`/api/admin/orders?${params}`);
        if (request !== listRequest.current) return;
        const lastPage = Math.max(
          1,
          Math.ceil(response.total / response.page_size),
        );
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setOrders(response.orders);
        setSummary(response.summary);
        setPagination({ total: response.total, page_size: response.page_size });
      } catch (caught) {
        if (request === listRequest.current)
          setError((caught as Error).message);
      } finally {
        if (request === listRequest.current) setLoading(false);
      }
    },
    [filter, query, page],
  );

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh(true);
    }, 60_000);
    return () => {
      clearInterval(timer);
      ++listRequest.current;
    };
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    let disposed = false;
    async function readIntegrations() {
      try {
        const status = await api<IntegrationStatus>(
          "/api/admin/commerce-status",
        );
        if (!disposed) {
          setIntegrations(status);
          setIntegrationError(false);
        }
      } catch {
        if (!disposed) setIntegrationError(true);
      }
    }
    void readIntegrations();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void readIntegrations();
    }, 60_000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);

  const loadDetail = useCallback(async (id: string, initialize = false) => {
    const request = ++detailRequest.current;
    const response = await api<Detail>(`/api/admin/orders/${id}`);
    if (selectedId.current !== id || request !== detailRequest.current) return;
    setDetail(response);
    if (initialize) {
      setNotes(response.order.notes || "");
      setDocumentType(response.fiscal_document?.type ?? "");
      setDocumentKey(response.fiscal_document?.key ?? "");
      setShipmentId("");
    }
  }, []);

  useEffect(() => {
    if (!detailOpen || busy) return;
    const timer = setInterval(() => {
      const id = selectedId.current;
      if (id && document.visibilityState === "visible") {
        void loadDetail(id).catch((caught) =>
          setDetailError((caught as Error).message),
        );
      }
    }, 30_000);
    return () => clearInterval(timer);
  }, [detailOpen, busy, loadDetail]);

  async function openDetail(order: AdminOrder) {
    lastFocus.current = document.activeElement as HTMLElement;
    selectedId.current = order.id;
    setDetail(null);
    setDetailError("");
    setDetailLoading(true);
    setDetailOpen(true);
    detailsDialog.current?.showModal();
    try {
      await loadDetail(order.id, true);
    } catch (caught) {
      if (selectedId.current === order.id)
        setDetailError((caught as Error).message);
    } finally {
      if (selectedId.current === order.id) setDetailLoading(false);
    }
  }

  function closeDetail() {
    if (busy) return;
    selectedId.current = null;
    setDetailOpen(false);
    detailsDialog.current?.close();
    lastFocus.current?.focus();
  }

  function askConfirmation(next: Confirmation) {
    setConfirmed(false);
    setConfirmation(next);
    confirmationDialog.current?.showModal();
  }

  async function act(action: Action, payload: Record<string, unknown> = {}) {
    const id = selectedId.current;
    if (!id || busy) return;
    setBusy(action);
    setDetailError("");
    try {
      await api<{ order: AdminOrder }>(`/api/admin/orders/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      confirmationDialog.current?.close();
      setConfirmation(null);
      await loadDetail(id);
      void refresh(true);
      setNotice(
        action === "save"
          ? "Informações salvas."
          : action === "prepare"
            ? "Preparação solicitada. O status será atualizado no painel."
            : "Pedido atualizado.",
      );
    } catch (caught) {
      confirmationDialog.current?.close();
      setConfirmation(null);
      setDetailError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await act("save", {
      notes,
      ...(documentType && !detail?.order.shipping_provider_id
        ? {
            fiscal_document: {
              type: documentType,
              ...(documentKey ? { key: documentKey } : {}),
            },
          }
        : {}),
    });
  }

  async function logout() {
    try {
      await api("/api/admin/logout", { method: "POST" });
      window.location.assign("/admin/login");
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  const order = detail?.order;
  const labelUrl = externalUrl(order?.label_url ?? null, [
    "melhorenvio.com.br",
    "www.melhorenvio.com.br",
    "sandbox.melhorenvio.com.br",
  ]);
  const trackingUrl = externalUrl(order?.tracking_url ?? null, [
    "melhorrastreio.com.br",
    "www.melhorrastreio.com.br",
  ]);
  const whatsappUrl = externalUrl(order?.whatsapp_url ?? null, [
    "wa.me",
    "api.whatsapp.com",
  ]);
  const closed =
    order && ["cancelled", "delivered"].includes(order.fulfillment_status);
  const paid = order?.payment_status === "paid";
  const shippingNeedsReview =
    order &&
    !order.local &&
    paid &&
    order.needs_review &&
    !order.shipping_provider_id;

  function changeFilter(next: Filter) {
    setFilter(next);
    setPage(1);
  }

  const totalPages = Math.max(
    1,
    Math.ceil(pagination.total / pagination.page_size),
  );
  const integrationWarnings = integrations
    ? [
        ...(!integrations.pix_configured
          ? ["O Pix ainda precisa ser configurado."]
          : !integrations.pix_webhook_configured
            ? [
                "Pix é consultado automaticamente; conecte o webhook para confirmação imediata.",
              ]
            : []),
        ...(!integrations.shipping_configured
          ? ["As cotações de frete aguardam a configuração do Melhor Envio."]
          : []),
        ...(!integrations.scheduler?.active
          ? [
              "As atualizações automáticas aguardam configuração. Enquanto isso, use Atualizar status nos pedidos.",
            ]
          : []),
        ...(!integrations.customer_signup_enabled
          ? ["O acesso de novos clientes por email ainda está desativado."]
          : []),
      ]
    : [];

  return (
    <div className="admin-shell ao-shell">
      <aside className="admin-sidebar">
        <Brand />
        <div className="sidebar-caption">SEU ATELIÊ</div>
        <nav aria-label="Gestão">
          <Link href="/admin" className="admin-orders-menu-link">
            <LayoutDashboard size={19} />
            Visão geral
          </Link>
          <Link href="/admin?tab=products" className="admin-orders-menu-link">
            <Package size={19} />
            Meus recursos
          </Link>
          <Link
            href="/admin/pedidos"
            className="admin-orders-menu-link active"
            aria-current="page"
          >
            <ShoppingBag size={19} />
            Pedidos
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <Link href="/" target="_blank">
            <ExternalLink size={17} />
            Visitar minha loja
          </Link>
          <button onClick={logout}>
            <LogOut size={17} />
            Sair da gestão
          </button>
          <div className="admin-account">
            <span>TC</span>
            <div>
              <b>Ateliê da Tia Cris</b>
              <small>{email}</small>
            </div>
          </div>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <span>
            RECURSOS DA TIA CRIS <span>/ Pedidos</span>
          </span>
          <span className="admin-private">
            <LockKeyhole size={15} />
            Área protegida
          </span>
          <div className="admin-mobile-links">
            <Link href="/" aria-label="Visitar loja">
              <ExternalLink size={17} />
            </Link>
            <button onClick={logout} aria-label="Sair da gestão">
              <LogOut size={17} />
            </button>
          </div>
        </header>
        <div className="admin-content ao-content">
          <div className="admin-heading">
            <div>
              <div className="eyebrow">DA SUA MESA PARA NOVAS DESCOBERTAS</div>
              <h1>Cada pedido, um carinho.</h1>
              <p>Cuide dos pagamentos, dos envios e de cada chegada.</p>
            </div>
            <button
              className="ao-button"
              disabled={loading}
              onClick={() => void refresh()}
            >
              <RefreshCw size={16} className={loading ? "ao-spinning" : ""} />
              Atualizar
            </button>
          </div>

          {integrationError ? (
            <p className="ao-integration-summary ao-muted">
              <AlertCircle size={13} />
              Não foi possível conferir as integrações agora.
            </p>
          ) : (
            integrations &&
            (integrationWarnings.length ? (
              <aside
                className="ao-integration-notes"
                aria-label="Configuração das integrações"
              >
                <details>
                  <summary>
                    <AlertCircle size={15} />
                    <span>
                      Integrações: {integrationWarnings.length}{" "}
                      {integrationWarnings.length === 1
                        ? "ponto para conferir"
                        : "pontos para conferir"}
                    </span>
                  </summary>
                  <div>
                    {integrationWarnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                    {integrations.scheduler?.active && (
                      <small>
                        Última execução: {date(integrations.scheduler.last_run)}
                        . {integrations.scheduler.pending_jobs} tarefas na fila.
                      </small>
                    )}
                    <small>
                      Login Google:{" "}
                      {integrations.google_enabled
                        ? "ativado"
                        : "não configurado"}
                      . Login Apple:{" "}
                      {integrations.apple_enabled
                        ? "ativado"
                        : "não configurado"}
                      .
                    </small>
                    <a
                      href="https://github.com/guirab734/recursosdatiacris/blob/main/README.md"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Orientações de configuração
                      <ArrowUpRight size={13} />
                    </a>
                  </div>
                </details>
              </aside>
            ) : (
              <p className="ao-integration-summary">
                <CheckCircle2 size={13} />
                Integrações conectadas
              </p>
            ))
          )}

          <div className="ao-summary" aria-label="Resumo dos pedidos">
            <div className="ao-metric ao-metric-revenue">
              <span>
                <CreditCard size={18} />
                Pagamentos confirmados
              </span>
              <strong>{summary ? money(summary.paid_cents) : "..."}</strong>
              <small>Valor recebido nos pedidos</small>
            </div>
            <button
              className={`ao-metric ${filter === "to_post" ? "selected" : ""}`}
              onClick={() => changeFilter("to_post")}
            >
              <span>
                <Package size={18} />A postar
              </span>
              <strong>{summary?.to_post ?? "..."}</strong>
              <small>
                Próximos a sair do ateliê
                <ArrowUpRight size={14} />
              </small>
            </button>
            <button
              className={`ao-metric ${filter === "posted" ? "selected" : ""}`}
              onClick={() => changeFilter("posted")}
            >
              <span>
                <Truck size={18} />A caminho
              </span>
              <strong>{summary?.posted ?? "..."}</strong>
              <small>
                Acompanhe a entrega
                <ArrowUpRight size={14} />
              </small>
            </button>
            <button
              className={`ao-metric ${filter === "delivered" ? "selected" : ""}`}
              onClick={() => changeFilter("delivered")}
            >
              <span>
                <CheckCircle2 size={18} />
                Concluídos
              </span>
              <strong>{summary?.delivered ?? "..."}</strong>
              <small>
                Já chegaram ao destino
                <ArrowUpRight size={14} />
              </small>
            </button>
          </div>

          {!!summary?.attention && (
            <button
              className="ao-attention-banner"
              onClick={() => changeFilter("attention")}
            >
              <AlertCircle size={19} />
              <span>
                <b>
                  {summary.attention}{" "}
                  {summary.attention === 1
                    ? "pedido precisa"
                    : "pedidos precisam"}{" "}
                  de atenção.
                </b>{" "}
                Confira as pendências para continuar o envio.
              </span>
              <ArrowUpRight size={18} />
            </button>
          )}

          <section className="ao-orders" aria-label="Lista de pedidos">
            <div className="ao-toolbar">
              <div>
                <h2>Pedidos da loja</h2>
                <p>
                  {summary
                    ? `${summary.total} ${summary.total === 1 ? "pedido registrado" : "pedidos registrados"}`
                    : "Carregando pedidos"}
                </p>
              </div>
              <label className="ao-search">
                <Search size={18} />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar pedido ou cliente"
                  aria-label="Buscar pedido ou cliente"
                  maxLength={100}
                />
              </label>
            </div>
            <div
              className="ao-filters"
              aria-label="Filtrar pedidos por situação"
            >
              {filters.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  className={filter === id ? "selected" : ""}
                  onClick={() => changeFilter(id)}
                  aria-pressed={filter === id}
                >
                  <Icon size={15} />
                  {label}
                  {summary && (
                    <span>{id === "all" ? summary.total : summary[id]}</span>
                  )}
                </button>
              ))}
            </div>
            {error && (
              <div className="ao-error" role="alert">
                <AlertCircle size={18} />
                <span>{error}</span>
                <button onClick={() => void refresh()}>Tentar novamente</button>
              </div>
            )}
            {error && !orders.length ? null : loading && !orders.length ? (
              <div className="ao-empty" role="status">
                <RefreshCw size={30} className="ao-spinning" />
                <h3>Organizando os pedidos...</h3>
              </div>
            ) : !orders.length ? (
              <div className="ao-empty">
                <ShoppingBag size={38} strokeWidth={1.3} />
                <h3>
                  {filter === "all" && !query
                    ? "As próximas descobertas começam aqui."
                    : "Nenhum pedido por aqui."}
                </h3>
                <p>
                  {filter === "all" && !query
                    ? "Quando alguém fizer um pedido, você acompanha todos os detalhes neste espaço."
                    : "Experimente outra busca ou veja todos os pedidos."}
                </p>
                {(filter !== "all" || query) && (
                  <button
                    className="ao-button"
                    onClick={() => {
                      changeFilter("all");
                      setSearch("");
                    }}
                  >
                    Ver todos os pedidos
                  </button>
                )}
              </div>
            ) : (
              <div className="ao-table-wrap" aria-busy={loading}>
                <table className="ao-table">
                  <thead>
                    <tr>
                      <th>Pedido</th>
                      <th>Cliente e destino</th>
                      <th>Pagamento</th>
                      <th>Envio</th>
                      <th>Total</th>
                      <th>
                        <span className="ao-sr-only">Detalhes</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((item) => (
                      <tr key={item.id}>
                        <td data-label="Pedido">
                          <button
                            className="ao-order-number"
                            onClick={() => void openDetail(item)}
                          >
                            {number(item)}
                          </button>
                          <small>{date(item.created_at)}</small>
                        </td>
                        <td data-label="Cliente">
                          <b>{item.address.name}</b>
                          <small>
                            <MapPin size={12} />
                            {item.address.city}, {item.address.state}
                            {item.local ? " · Entrega local" : ""}
                          </small>
                        </td>
                        <td data-label="Pagamento">
                          <span
                            className={`ao-payment ao-payment-${item.payment_status}`}
                          >
                            {paymentLabels[item.payment_status]}
                          </span>
                          <small>{method(item)}</small>
                        </td>
                        <td data-label="Envio">
                          <Status order={item} />
                          {item.shipping && (
                            <small>
                              {item.shipping.company} {item.shipping.name}
                            </small>
                          )}
                        </td>
                        <td data-label="Total">
                          <b className="ao-order-total">
                            {money(item.total_cents)}
                          </b>
                          <small>
                            {item.items.reduce(
                              (sum, entry) => sum + entry.quantity,
                              0,
                            )}{" "}
                            itens
                          </small>
                        </td>
                        <td>
                          <button
                            className="ao-open-order"
                            onClick={() => void openDetail(item)}
                            aria-label={`Ver detalhes do pedido ${number(item)}`}
                          >
                            Ver pedido
                            <ArrowUpRight size={17} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {pagination.total > 0 && (
              <nav className="ao-pagination" aria-label="Páginas de pedidos">
                <span aria-live="polite">
                  {(page - 1) * pagination.page_size + 1} a{" "}
                  {Math.min(page * pagination.page_size, pagination.total)} de{" "}
                  {pagination.total} pedidos
                </span>
                <div>
                  <button
                    className="ao-button ao-button-small"
                    disabled={loading || page <= 1}
                    onClick={() =>
                      setPage((current) => Math.max(1, current - 1))
                    }
                  >
                    <ArrowLeft size={14} />
                    Anteriores
                  </button>
                  <span>
                    Página {page} de {totalPages}
                  </span>
                  <button
                    className="ao-button ao-button-small"
                    disabled={loading || page >= totalPages}
                    onClick={() =>
                      setPage((current) => Math.min(totalPages, current + 1))
                    }
                  >
                    Próximos
                    <ArrowRight size={14} />
                  </button>
                </div>
              </nav>
            )}
          </section>
          <p className="ao-footnote">
            <LockKeyhole size={13} />
            Dados dos clientes disponíveis apenas na gestão da loja.
          </p>
        </div>
      </main>

      <dialog
        ref={detailsDialog}
        className="ao-detail-dialog"
        aria-labelledby="ao-detail-title"
        onCancel={(event) => {
          if (busy) event.preventDefault();
          else selectedId.current = null;
        }}
        onClose={() => {
          selectedId.current = null;
          setDetailOpen(false);
          setDetail(null);
        }}
      >
        <div className="ao-detail-top">
          <div>
            <span className="eyebrow">CUIDE DE CADA DETALHE</span>
            <h2 id="ao-detail-title">
              {order ? `Pedido ${number(order)}` : "Detalhes do pedido"}
            </h2>
            {order && <p>Recebido em {date(order.created_at)}</p>}
          </div>
          <button
            className="ao-close"
            aria-label="Fechar detalhes"
            disabled={!!busy}
            onClick={closeDetail}
          >
            <X size={21} />
          </button>
        </div>
        {detailLoading && (
          <div className="ao-empty" role="status">
            <RefreshCw className="ao-spinning" size={26} />
            <p>Carregando informações...</p>
          </div>
        )}
        {detailError && (
          <div className="ao-error" role="alert">
            <AlertCircle size={18} />
            <span>{detailError}</span>
          </div>
        )}
        {notice && (
          <div className="ao-detail-notice" role="status">
            <CheckCircle2 size={16} />
            {notice}
          </div>
        )}
        {order && (
          <div className="ao-detail-body">
            <div className="ao-detail-status">
              <Status order={order} />
              <span className={`ao-payment ao-payment-${order.payment_status}`}>
                {paymentLabels[order.payment_status]}
              </span>
              <button
                className="ao-button ao-button-small"
                onClick={() => void act("sync")}
                disabled={!!busy}
              >
                <RefreshCw
                  size={14}
                  className={busy === "sync" ? "ao-spinning" : ""}
                />
                Atualizar status
              </button>
            </div>
            {order.last_error && (
              <div className="ao-error" role="alert">
                <AlertCircle size={18} />
                <div>
                  <b>Uma etapa precisa da sua atenção.</b>
                  <p>{order.last_error}</p>
                </div>
              </div>
            )}

            <section className="ao-detail-section">
              <h3>
                <ShoppingBag size={18} />O que vai neste pedido
              </h3>
              <div className="ao-item-list">
                {order.items.map((item) => (
                  <div key={item.product_id} className="ao-item">
                    <span className="ao-item-quantity">{item.quantity}×</span>
                    <div>
                      <b>{item.name}</b>
                      <small>{money(item.unit_price_cents)} por unidade</small>
                    </div>
                    <strong>{money(item.subtotal_cents)}</strong>
                  </div>
                ))}
              </div>
              <dl className="ao-totals">
                <div>
                  <dt>Produtos</dt>
                  <dd>{money(order.subtotal_cents)}</dd>
                </div>
                <div>
                  <dt>
                    {order.local &&
                    order.shipping_cents === 0 &&
                    order.subtotal_cents < 15000
                      ? "Entrega local a combinar"
                      : "Frete cobrado"}
                  </dt>
                  <dd>
                    {order.local &&
                    order.shipping_cents === 0 &&
                    order.subtotal_cents < 15000
                      ? "Pelo WhatsApp"
                      : order.shipping_cents === 0
                        ? "Grátis"
                        : money(order.shipping_cents)}
                  </dd>
                </div>
                <div className="ao-grand-total">
                  <dt>Total do pedido</dt>
                  <dd>{money(order.total_cents)}</dd>
                </div>
              </dl>
            </section>

            <div className="ao-detail-columns">
              <section className="ao-detail-section">
                <h3>
                  <MapPin size={18} />
                  Cliente e entrega
                </h3>
                <address className="ao-address">
                  <b>{order.address.name}</b>
                  <span>
                    {order.address.street}, {order.address.number}
                  </span>
                  {order.address.complement && (
                    <span>{order.address.complement}</span>
                  )}
                  <span>{order.address.neighborhood}</span>
                  <span>
                    {order.address.city}, {order.address.state}
                  </span>
                  <span>
                    CEP{" "}
                    {order.address.postal_code.replace(
                      /^(\d{5})(\d{3})$/,
                      "$1-$2",
                    )}
                  </span>
                </address>
                <div className="ao-contact">
                  <a href={`tel:${order.address.phone.replace(/\D/g, "")}`}>
                    {order.address.phone}
                  </a>
                  <a href={`mailto:${encodeURIComponent(order.address.email)}`}>
                    {order.address.email}
                  </a>
                  <span>CPF/CNPJ: {order.address.document}</span>
                </div>
              </section>
              <section className="ao-detail-section">
                <h3>
                  <CreditCard size={18} />
                  Pagamento
                </h3>
                <dl className="ao-facts">
                  <div>
                    <dt>Forma escolhida</dt>
                    <dd>{method(order)}</dd>
                  </div>
                  <div>
                    <dt>Situação</dt>
                    <dd>{paymentLabels[order.payment_status]}</dd>
                  </div>
                  {order.paid_at && (
                    <div>
                      <dt>Confirmado em</dt>
                      <dd>{date(order.paid_at)}</dd>
                    </div>
                  )}
                </dl>
                {!paid &&
                  !closed &&
                  order.payment_method !== "pix" &&
                  order.payment_status !== "refunded" && (
                    <button
                      className="ao-button ao-button-primary"
                      disabled={!!busy}
                      onClick={() =>
                        askConfirmation({
                          action: "confirm_manual_payment",
                          title: "Confirmar pagamento recebido",
                          message: `Confira o recebimento de ${money(order.total_cents)} antes de liberar este pedido.`,
                          button: "Confirmar recebimento",
                          checkbox: "Conferi o pagamento recebido",
                        })
                      }
                    >
                      <CheckCircle2 size={16} />
                      Confirmar recebimento
                    </button>
                  )}
                {whatsappUrl && (
                  <a
                    className="ao-text-link"
                    href={whatsappUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir conversa do pedido
                    <ArrowUpRight size={15} />
                  </a>
                )}
              </section>
            </div>

            <section className="ao-detail-section">
              <h3>
                <Truck size={18} />
                {order.local ? "Entrega em Aracaju" : "Envio e rastreamento"}
              </h3>
              {order.local ? (
                <>
                  <p className="ao-muted">
                    A entrega é combinada pelo WhatsApp. Atualize as etapas aqui
                    conforme o pedido sair e chegar ao destino.
                  </p>
                  <div className="ao-action-row">
                    {paid &&
                      !closed &&
                      order.fulfillment_status !== "posted" && (
                        <button
                          className="ao-button"
                          disabled={!!busy}
                          onClick={() =>
                            askConfirmation({
                              action: "mark_local_posted",
                              title: "O pedido saiu para entrega?",
                              message:
                                "Marque esta etapa depois que o pedido estiver com o entregador.",
                              button: "Marcar como saiu para entrega",
                            })
                          }
                        >
                          <Truck size={16} />
                          Saiu para entrega
                        </button>
                      )}
                    {paid && order.fulfillment_status === "posted" && (
                      <button
                        className="ao-button ao-button-primary"
                        disabled={!!busy}
                        onClick={() =>
                          askConfirmation({
                            action: "mark_local_delivered",
                            title: "Confirmar entrega concluída",
                            message:
                              "Confirme esta etapa depois de verificar que o cliente recebeu o pedido.",
                            button: "Confirmar entrega",
                          })
                        }
                      >
                        <CheckCircle2 size={16} />
                        Confirmar entrega
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {order.shipping && (
                    <div className="ao-carrier">
                      <span className="ao-carrier-symbol">
                        <Truck size={23} />
                      </span>
                      <div>
                        <b>
                          {order.shipping.company} {order.shipping.name}
                        </b>
                        <small>
                          Prazo estimado: {order.shipping.min_days} a{" "}
                          {order.shipping.max_days} dias úteis
                        </small>
                      </div>
                      <strong>{money(order.shipping.price_cents)}</strong>
                    </div>
                  )}
                  {order.shipping && order.shipping.subsidy_cents > 0 && (
                    <p className="ao-muted ao-shipping-note">
                      A loja oferece {money(order.shipping.subsidy_cents)} de
                      desconto no frete.
                    </p>
                  )}
                  {order.fulfillment_status === "freight_pending" && (
                    <div className="ao-freight-note">
                      <FileText size={19} />
                      <div>
                        <b>O frete aguarda seu pagamento.</b>
                        <p>
                          O envio já está no carrinho do Melhor Envio. Pague por
                          lá e atualize este pedido para liberar a etiqueta.
                        </p>
                        <a
                          href="https://app.melhorenvio.com.br/"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Abrir Melhor Envio
                          <ArrowUpRight size={15} />
                        </a>
                      </div>
                    </div>
                  )}
                  <div className="ao-action-row">
                    {paid &&
                      !closed &&
                      !order.shipping_provider_id &&
                      !order.needs_review && (
                        <button
                          className="ao-button ao-button-primary"
                          disabled={!!busy}
                          onClick={() => void act("prepare")}
                        >
                          <Package size={16} />
                          {busy === "prepare"
                            ? "Solicitando preparação..."
                            : "Preparar envio"}
                        </button>
                      )}
                    {labelUrl && (
                      <a
                        className="ao-button ao-button-primary"
                        href={labelUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Printer size={16} />
                        Imprimir etiqueta
                      </a>
                    )}
                    {trackingUrl && (
                      <a
                        className="ao-button"
                        href={trackingUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink size={16} />
                        Ver rastreio completo
                      </a>
                    )}
                  </div>
                  {order.tracking_code && (
                    <div className="ao-tracking-code">
                      <span>
                        Código de rastreio<strong>{order.tracking_code}</strong>
                      </span>
                      <button
                        className="ao-button ao-button-small"
                        onClick={() => {
                          void navigator.clipboard
                            .writeText(order.tracking_code!)
                            .then(() =>
                              setNotice("Código de rastreio copiado."),
                            )
                            .catch(() =>
                              setDetailError(
                                "Não foi possível copiar. Selecione o código e copie manualmente.",
                              ),
                            );
                        }}
                      >
                        <Copy size={14} />
                        Copiar
                      </button>
                    </div>
                  )}
                  <p className="ao-muted ao-last-sync">
                    {order.tracking_updated_at
                      ? `Última atualização do rastreio: ${date(order.tracking_updated_at)}.`
                      : "O rastreio será exibido quando a transportadora disponibilizar as informações."}
                  </p>
                  {!!order.tracking_events.length && (
                    <ol className="ao-timeline">
                      {order.tracking_events.map((event, index) => (
                        <li key={`${event.date}-${index}`}>
                          <span>
                            <b>{event.description}</b>
                            {event.location && <small>{event.location}</small>}
                            <time>{date(event.date)}</time>
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                  {order.shipping_provider_id && (
                    <p className="ao-provider-id">
                      Identificador do envio:{" "}
                      <code>{order.shipping_provider_id}</code>
                    </p>
                  )}
                  {shippingNeedsReview && (
                    <div className="ao-reconcile">
                      <h4>Conferir envio no Melhor Envio</h4>
                      <p>
                        Antes de criar outro envio, procure o pedido no carrinho
                        do Melhor Envio. Se ele já existir, vincule o
                        identificador da etiqueta.
                      </p>
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void act("attach_shipment", {
                            shipment_id: shipmentId.trim(),
                          });
                        }}
                      >
                        <label className="ao-field">
                          Identificador da etiqueta
                          <input
                            value={shipmentId}
                            onChange={(event) =>
                              setShipmentId(event.target.value)
                            }
                            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                            required
                            pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
                            maxLength={36}
                          />
                        </label>
                        <button className="ao-button" disabled={!!busy}>
                          Vincular etiqueta existente
                        </button>
                      </form>
                      <button
                        className="ao-text-link"
                        disabled={!!busy}
                        onClick={() =>
                          askConfirmation({
                            action: "retry_shipping",
                            title: "Permitir nova tentativa de envio",
                            message:
                              "Uma nova tentativa pode criar outra etiqueta se o envio anterior já existir. Confira o pedido no Melhor Envio antes de continuar.",
                            button: "Tentar preparar novamente",
                            checkbox:
                              "Conferi o Melhor Envio e não existe etiqueta para este pedido",
                          })
                        }
                      >
                        O envio não existe. Tentar novamente
                        <ArrowUpRight size={14} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>

            <form className="ao-detail-section" onSubmit={save}>
              <h3>
                <FileText size={18} />
                Documento e anotações
              </h3>
              <fieldset disabled={!!busy} className="ao-form-fields">
                {!order.local && (
                  <div className="ao-document-fields">
                    <label className="ao-field">
                      Documento do envio
                      <select
                        value={documentType}
                        disabled={!!order.shipping_provider_id}
                        onChange={(event) => {
                          setDocumentType(
                            event.target.value as typeof documentType,
                          );
                          setDocumentKey("");
                        }}
                      >
                        <option value="">Selecionar documento</option>
                        <option value="declaration">
                          Declaração de conteúdo
                        </option>
                        <option value="invoice">Nota fiscal</option>
                      </select>
                    </label>
                    {documentType && (
                      <label className="ao-field">
                        {documentType === "invoice"
                          ? "Chave da nota fiscal"
                          : "Chave DCe já emitida (opcional)"}
                        <input
                          inputMode="numeric"
                          disabled={!!order.shipping_provider_id}
                          value={documentKey}
                          onChange={(event) =>
                            setDocumentKey(
                              event.target.value
                                .replace(/\D/g, "")
                                .slice(0, 44),
                            )
                          }
                          pattern="[0-9]{44}"
                          required={documentType === "invoice"}
                          minLength={44}
                          maxLength={44}
                          placeholder="44 dígitos"
                        />
                      </label>
                    )}
                    {documentType === "declaration" && (
                      <p className="ao-muted">
                        Use declaração de conteúdo quando permitida para este
                        envio. Se ela for emitida pelo Melhor Envio, deixe a
                        chave em branco.
                      </p>
                    )}
                  </div>
                )}
                <label className="ao-field">
                  Anotações da loja
                  <textarea
                    rows={3}
                    maxLength={3000}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Cuidados com a embalagem, combinações de entrega e outros detalhes."
                  />
                  <small>Visíveis apenas na gestão.</small>
                </label>
                <button className="ao-button ao-button-primary" type="submit">
                  <Check size={16} />
                  {busy === "save" ? "Salvando..." : "Salvar informações"}
                </button>
              </fieldset>
            </form>

            {!!detail.events.length && (
              <section className="ao-detail-section">
                <h3>
                  <Clock3 size={18} />
                  Histórico do pedido
                </h3>
                <ol className="ao-timeline">
                  {detail.events.map((event) => (
                    <li key={event.id}>
                      <span>
                        <b>
                          {event.message.replace(
                            /^Admin [0-9a-f-]{36}: /i,
                            "Administração: ",
                          )}
                        </b>
                        <time>{date(event.created_at)}</time>
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
            <div className="ao-detail-footer">
              <button
                className="ao-text-link"
                onClick={closeDetail}
                disabled={!!busy}
              >
                <ArrowLeft size={15} />
                Voltar aos pedidos
              </button>
              {!closed &&
                !order.shipping_provider_id &&
                order.fulfillment_status !== "posted" && (
                  <button
                    className="ao-text-link ao-danger"
                    disabled={!!busy}
                    onClick={() =>
                      askConfirmation({
                        action: "cancel",
                        title: "Cancelar este pedido?",
                        message: paid
                          ? "O pagamento já foi recebido. Cancelar o pedido aqui não faz estorno. A devolução precisa ser feita na provedora de pagamento, e uma etiqueta já paga deve ser cancelada no Melhor Envio."
                          : "O pedido ficará cancelado e não seguirá para envio. Se o pagamento for confirmado depois, confira a devolução na provedora.",
                        button: "Cancelar pedido",
                        danger: true,
                      })
                    }
                  >
                    Cancelar pedido
                  </button>
                )}
            </div>
          </div>
        )}
      </dialog>

      <dialog
        ref={confirmationDialog}
        className="ao-confirm-dialog"
        aria-labelledby="ao-confirm-title"
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        {confirmation && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!confirmation.checkbox || confirmed)
                void act(confirmation.action);
            }}
          >
            <div
              className={`ao-confirm-symbol ${confirmation.danger ? "danger" : ""}`}
            >
              {confirmation.danger ? (
                <AlertCircle size={25} />
              ) : (
                <CheckCircle2 size={25} />
              )}
            </div>
            <h2 id="ao-confirm-title">{confirmation.title}</h2>
            <p>{confirmation.message}</p>
            {confirmation.checkbox && (
              <label className="ao-confirm-check">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  required
                />
                {confirmation.checkbox}
              </label>
            )}
            <div className="ao-action-row">
              <button
                type="button"
                className="ao-button"
                disabled={!!busy}
                onClick={() => confirmationDialog.current?.close()}
              >
                Voltar
              </button>
              <button
                type="submit"
                className={`ao-button ${confirmation.danger ? "ao-button-danger" : "ao-button-primary"}`}
                disabled={!!busy || (!!confirmation.checkbox && !confirmed)}
              >
                {busy ? "Atualizando..." : confirmation.button}
              </button>
            </div>
          </form>
        )}
      </dialog>
      {notice && !detailOpen && (
        <div className="ao-notice" role="status">
          <CheckCircle2 size={17} />
          {notice}
          <button aria-label="Fechar aviso" onClick={() => setNotice("")}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

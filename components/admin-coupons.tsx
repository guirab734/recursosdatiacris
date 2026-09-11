"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CalendarDays,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Tag,
  Ticket,
  X,
} from "lucide-react";
import { Brand } from "./header";
import { money } from "@/lib/types";
import type { Coupon } from "@/lib/coupon-types";
import "./admin-orders.css";
import "./admin-coupons.css";

type CouponInput = Omit<Coupon, "id" | "uses_count" | "created_at">;
type Draft = {
  code: string;
  description: string;
  kind: Coupon["kind"];
  amount: string;
  active: boolean;
  minimum: string;
  maxUses: string;
  startsAt: string;
  expiresAt: string;
};
type CouponStatus = "active" | "paused" | "scheduled" | "expired" | "used";
type Filter = "all" | "active" | "paused" | "finished";
const statusLabels: Record<CouponStatus, string> = {
  active: "Disponível",
  paused: "Pausado",
  scheduled: "Agendado",
  expired: "Prazo encerrado",
  used: "Limite atingido",
};
const blank = (): Draft => ({
  code: "",
  description: "",
  kind: "percentage",
  amount: "",
  active: true,
  minimum: "",
  maxUses: "",
  startsAt: "",
  expiresAt: "",
});
const editableMoney = (cents: number) =>
  (cents / 100).toFixed(2).replace(".", ",");
const normalized = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}
function readableDate(value: string | null) {
  if (!value) return "Sem data limite";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Data indisponível"
    : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
function status(coupon: Coupon): CouponStatus {
  if (!coupon.active) return "paused";
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() <= Date.now())
    return "expired";
  if (coupon.max_uses !== null && coupon.uses_count >= coupon.max_uses)
    return "used";
  if (coupon.starts_at && new Date(coupon.starts_at).getTime() > Date.now())
    return "scheduled";
  return "active";
}
function amountLabel(coupon: Pick<Coupon, "kind" | "amount">) {
  return coupon.kind === "percentage"
    ? `${coupon.amount}%`
    : money(coupon.amount);
}
function amountDetail(kind: Coupon["kind"]) {
  return kind === "final_total" ? "total do pedido com frete" : "de desconto";
}
function parseMoney(value: string, empty = 0) {
  if (!value.trim()) return empty;
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().replace(",", ".").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}
function couponInput(coupon: Coupon): CouponInput {
  return {
    code: coupon.code,
    description: coupon.description,
    kind: coupon.kind,
    amount: coupon.amount,
    active: coupon.active,
    min_subtotal_cents: coupon.min_subtotal_cents,
    max_uses: coupon.max_uses,
    starts_at: coupon.starts_at,
    expires_at: coupon.expires_at,
  };
}
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...options });
  if (response.status === 401) {
    window.location.assign("/admin/login");
    throw new Error("Entre novamente para continuar.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      data?.error || "Não foi possível concluir. Tente novamente.",
    );
  if (!data) throw new Error("O servidor não respondeu. Tente novamente.");
  return data as T;
}

export function AdminCoupons({ email }: { email: string }) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const editor = useRef<HTMLDialogElement>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async (quiet = false) => {
    const current = ++requestId.current;
    if (!quiet) setLoading(true);
    setError("");
    try {
      const response = await api<{ coupons: Coupon[] }>("/api/admin/coupons");
      if (current === requestId.current) setCoupons(response.coupons);
    } catch (caught) {
      if (current === requestId.current) setError((caught as Error).message);
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    return () => {
      ++requestId.current;
    };
  }, [refresh]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  function edit(coupon?: Coupon) {
    setEditing(coupon ?? null);
    setSaveError("");
    setDraft(
      coupon
        ? {
            code: coupon.code,
            description: coupon.description,
            kind: coupon.kind,
            amount:
              coupon.kind === "percentage"
                ? String(coupon.amount)
                : editableMoney(coupon.amount),
            active: coupon.active,
            minimum: coupon.min_subtotal_cents
              ? editableMoney(coupon.min_subtotal_cents)
              : "",
            maxUses: coupon.max_uses === null ? "" : String(coupon.max_uses),
            startsAt: toLocalInput(coupon.starts_at),
            expiresAt: toLocalInput(coupon.expires_at),
          }
        : blank(),
    );
    editor.current?.showModal();
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaveError("");
    const amount =
      draft.kind === "percentage"
        ? /^\d+$/.test(draft.amount)
          ? Number(draft.amount)
          : null
        : parseMoney(draft.amount);
    const minimum = parseMoney(draft.minimum);
    const maxUses = draft.maxUses.trim() ? Number(draft.maxUses) : null;
    if (
      amount === null ||
      (draft.kind === "percentage"
        ? !Number.isInteger(amount) || amount < 1 || amount > 99
        : amount < 25)
    ) {
      setSaveError(
        draft.kind === "percentage"
          ? "Informe um percentual inteiro entre 1% e 99%."
          : "Informe um valor de pelo menos R$ 0,25, com até duas casas decimais.",
      );
      return;
    }
    if (minimum === null || minimum < 0) {
      setSaveError("Informe um valor mínimo válido para os produtos.");
      return;
    }
    if (
      maxUses !== null &&
      (!Number.isSafeInteger(maxUses) || maxUses < 1 || maxUses > 1_000_000)
    ) {
      setSaveError(
        "O limite de usos precisa ser um número inteiro entre 1 e 1.000.000.",
      );
      return;
    }
    const startsAt = draft.startsAt ? new Date(draft.startsAt) : null;
    const expiresAt = draft.expiresAt ? new Date(draft.expiresAt) : null;
    if (
      (startsAt && Number.isNaN(startsAt.getTime())) ||
      (expiresAt && Number.isNaN(expiresAt.getTime()))
    ) {
      setSaveError("Confira as datas de validade do cupom.");
      return;
    }
    if (startsAt && expiresAt && expiresAt <= startsAt) {
      setSaveError("A validade precisa terminar depois do início.");
      return;
    }
    const payload: CouponInput = {
      code: draft.code.trim().toUpperCase(),
      description: draft.description.trim(),
      kind: draft.kind,
      amount,
      active: draft.active,
      min_subtotal_cents: minimum,
      max_uses: maxUses,
      starts_at:
        editing && draft.startsAt === toLocalInput(editing.starts_at)
          ? editing.starts_at
          : (startsAt?.toISOString() ?? null),
      expires_at:
        editing && draft.expiresAt === toLocalInput(editing.expires_at)
          ? editing.expires_at
          : (expiresAt?.toISOString() ?? null),
    };
    setSaving(true);
    try {
      await api(
        editing
          ? `/api/admin/coupons/${encodeURIComponent(editing.id)}`
          : "/api/admin/coupons",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      editor.current?.close();
      setNotice(
        editing
          ? "Cupom atualizado."
          : "Cupom criado. Agora você pode compartilhar o código.",
      );
      void refresh(true);
    } catch (caught) {
      setSaveError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(coupon: Coupon) {
    if (toggling) return;
    setToggling(coupon.id);
    setError("");
    try {
      await api(`/api/admin/coupons/${encodeURIComponent(coupon.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...couponInput(coupon),
          active: !coupon.active,
        }),
      });
      setNotice(
        coupon.active
          ? "Cupom pausado. O histórico de usos foi preservado."
          : "Cupom ativado. A validade e os limites continuam valendo.",
      );
      void refresh(true);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setToggling(null);
    }
  }

  async function logout() {
    try {
      await api("/api/admin/logout", { method: "POST" });
      window.location.assign("/admin/login");
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  const visible = coupons.filter((coupon) => {
    const current = status(coupon);
    return (
      (filter === "all" ||
        (filter === "active" && current === "active") ||
        (filter === "paused" && current === "paused") ||
        (filter === "finished" && ["expired", "used"].includes(current))) &&
      normalized(`${coupon.code} ${coupon.description}`).includes(
        normalized(search.trim()),
      )
    );
  });
  const available = coupons.filter(
    (coupon) => status(coupon) === "active",
  ).length;
  const previewAmount =
    draft.kind === "percentage"
      ? Number(draft.amount)
      : parseMoney(draft.amount);

  return (
    <div className="admin-shell ac-shell">
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
          <Link href="/admin/pedidos" className="admin-orders-menu-link">
            <ShoppingBag size={19} />
            Pedidos
          </Link>
          <Link
            href="/admin/cupons"
            className="admin-orders-menu-link active"
            aria-current="page"
          >
            <Ticket size={19} />
            Cupons
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
            RECURSOS DA TIA CRIS <span>/ Cupons</span>
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
        <div className="admin-content ac-content">
          <div className="admin-heading">
            <div>
              <div className="eyebrow">UM INCENTIVO PARA NOVAS DESCOBERTAS</div>
              <h1>Um carinho a mais.</h1>
              <p>Crie cupons e acompanhe cada oportunidade de economizar.</p>
            </div>
            <button
              className="ao-button ao-button-primary"
              onClick={() => edit()}
            >
              <Plus size={18} />
              Novo cupom
            </button>
          </div>
          <section className="ac-overview" aria-label="Resumo dos cupons">
            <div className="ac-featured-stat">
              <span>
                <Ticket size={18} />
                Disponíveis agora
              </span>
              <strong>{loading && !coupons.length ? "..." : available}</strong>
              <p>Prontos para usar nas próximas compras.</p>
            </div>
            <div>
              <span>Usos registrados</span>
              <strong>
                {loading && !coupons.length
                  ? "..."
                  : coupons.reduce((sum, coupon) => sum + coupon.uses_count, 0)}
              </strong>
              <p>Histórico preservado mesmo ao pausar.</p>
            </div>
            <div>
              <span>Cupons cadastrados</span>
              <strong>
                {loading && !coupons.length ? "..." : coupons.length}
              </strong>
              <p>Ofertas ativas, programadas e encerradas.</p>
            </div>
          </section>
          <section className="ac-list" aria-label="Cupons da loja">
            <div className="ac-toolbar">
              <div className="ac-filters">
                {(
                  [
                    { id: "all", label: "Todos" },
                    { id: "active", label: "Disponíveis" },
                    { id: "paused", label: "Pausados" },
                    { id: "finished", label: "Encerrados" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    aria-pressed={filter === item.id}
                    className={filter === item.id ? "selected" : ""}
                    onClick={() => setFilter(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="ac-search-tools">
                <label className="ao-search">
                  <Search size={17} />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar cupom"
                    aria-label="Buscar código ou descrição"
                    maxLength={100}
                  />
                </label>
                <button
                  className="ao-button ao-button-small"
                  onClick={() => void refresh()}
                  disabled={loading}
                  aria-label="Atualizar cupons"
                >
                  <RefreshCw
                    size={16}
                    className={loading ? "ao-spinning" : ""}
                  />
                </button>
              </div>
            </div>
            {error && (
              <div className="ao-error" role="alert">
                <AlertCircle size={18} />
                <span>{error}</span>
                <button onClick={() => void refresh()}>Tentar novamente</button>
              </div>
            )}
            {loading && !coupons.length ? (
              <div className="ao-empty" role="status">
                <RefreshCw size={28} className="ao-spinning" />
                <h3>Organizando seus cupons...</h3>
              </div>
            ) : error && !coupons.length ? null : !visible.length ? (
              <div className="ao-empty">
                <Ticket size={42} strokeWidth={1.3} />
                <h3>
                  {!coupons.length
                    ? "O próximo incentivo começa aqui."
                    : "Nenhum cupom encontrado."}
                </h3>
                <p>
                  {!coupons.length
                    ? "Escolha o benefício, crie um código e compartilhe com seus clientes."
                    : "Experimente outro filtro ou uma nova busca."}
                </p>
                {!coupons.length && (
                  <button
                    className="ao-button ao-button-primary"
                    onClick={() => edit()}
                  >
                    <Plus size={16} />
                    Criar meu primeiro cupom
                  </button>
                )}
              </div>
            ) : (
              <div className="ac-grid" aria-busy={loading}>
                {visible.map((coupon) => {
                  const current = status(coupon);
                  return (
                    <article
                      className={`ac-coupon ac-coupon-${current}`}
                      key={coupon.id}
                    >
                      <div className="ac-ticket-top">
                        <span className={`ac-status ac-status-${current}`}>
                          <i aria-hidden="true" />
                          {statusLabels[current]}
                        </span>
                        <Tag size={18} />
                      </div>
                      <div className="ac-discount">
                        <strong>{amountLabel(coupon)}</strong>
                        <span>{amountDetail(coupon.kind)}</span>
                      </div>
                      <div className="ac-code">
                        <code>{coupon.code}</code>
                        <button
                          aria-label={`Copiar código ${coupon.code}`}
                          onClick={() => {
                            void navigator.clipboard
                              .writeText(coupon.code)
                              .then(() => setNotice("Código copiado."))
                              .catch(() =>
                                setError(
                                  "Não foi possível copiar. Selecione o código e copie manualmente.",
                                ),
                              );
                          }}
                        >
                          <Copy size={15} />
                        </button>
                      </div>
                      {coupon.description && (
                        <p className="ac-description">{coupon.description}</p>
                      )}
                      <div className="ac-terms">
                        <span>
                          <CalendarDays size={13} />
                          {current === "scheduled"
                            ? `Começa em ${readableDate(coupon.starts_at)}`
                            : coupon.expires_at
                              ? `Até ${readableDate(coupon.expires_at)}`
                              : "Sem data limite"}
                        </span>
                        <span>
                          {coupon.min_subtotal_cents > 0
                            ? `Mínimo de ${money(coupon.min_subtotal_cents)} em produtos`
                            : "Sem valor mínimo de produtos"}
                        </span>
                        <span>
                          {coupon.uses_count}{" "}
                          {coupon.uses_count === 1
                            ? "uso registrado"
                            : "usos registrados"}
                          {coupon.max_uses !== null
                            ? ` de ${coupon.max_uses}`
                            : " · Sem limite"}
                        </span>
                      </div>
                      <footer>
                        <button
                          className="ac-edit"
                          onClick={() => edit(coupon)}
                          disabled={!!toggling}
                        >
                          <Pencil size={15} />
                          Editar cupom
                        </button>
                        <button
                          className="ac-toggle"
                          role="switch"
                          aria-checked={coupon.active}
                          aria-label={`${coupon.active ? "Pausar" : "Ativar"} cupom ${coupon.code}`}
                          onClick={() => void toggle(coupon)}
                          disabled={!!toggling}
                        >
                          <span>
                            {toggling === coupon.id
                              ? "Salvando..."
                              : coupon.active
                                ? "Ativado"
                                : "Pausado"}
                          </span>
                          <i aria-hidden="true">
                            <b />
                          </i>
                        </button>
                      </footer>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
          <p className="ao-footnote">
            <LockKeyhole size={13} />
            Cupons e condições são validados pelo servidor em cada pedido.
          </p>
        </div>
      </main>

      <dialog
        ref={editor}
        className="ac-editor"
        aria-labelledby="ac-editor-title"
        onCancel={(event) => {
          if (saving) event.preventDefault();
        }}
      >
        <form onSubmit={save}>
          <header>
            <div>
              <span className="eyebrow">UMA BOA RAZÃO PARA VOLTAR</span>
              <h2 id="ac-editor-title">
                {editing ? "Cuide deste cupom." : "Crie uma oportunidade."}
              </h2>
              <p>
                {editing
                  ? "Ajuste as condições para as próximas utilizações."
                  : "Um código simples, um benefício especial."}
              </p>
            </div>
            <button
              className="ao-close"
              type="button"
              aria-label="Fechar formulário"
              disabled={saving}
              onClick={() => editor.current?.close()}
            >
              <X size={20} />
            </button>
          </header>
          <fieldset disabled={saving} className="ac-editor-fields">
            <div className="ac-editor-grid">
              <div className="ac-form-main">
                <label className="ao-field">
                  Código do cupom
                  <input
                    value={draft.code}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        code: event.target.value
                          .toUpperCase()
                          .replace(/\s/g, ""),
                      })
                    }
                    required
                    minLength={3}
                    maxLength={32}
                    pattern="[A-Z0-9][A-Z0-9_\-]*"
                    placeholder="Ex.: BEMVINDO10"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <small>Use letras, números, hífen ou sublinhado.</small>
                </label>
                <label className="ao-field">
                  Descrição (opcional)
                  <input
                    value={draft.description}
                    onChange={(event) =>
                      setDraft({ ...draft, description: event.target.value })
                    }
                    maxLength={200}
                    placeholder="Ex.: Boas-vindas à nossa loja"
                  />
                </label>
                <div className="ac-form-row">
                  <label className="ao-field">
                    Tipo de benefício
                    <select
                      value={draft.kind}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          kind: event.target.value as Coupon["kind"],
                          amount: "",
                        })
                      }
                    >
                      <option value="percentage">
                        Desconto em porcentagem
                      </option>
                      <option value="fixed">Desconto em reais</option>
                      <option value="final_total">Total final do pedido</option>
                    </select>
                  </label>
                  <label className="ao-field">
                    {draft.kind === "percentage"
                      ? "Porcentagem"
                      : draft.kind === "fixed"
                        ? "Desconto em reais"
                        : "Total a pagar em reais"}
                    <div className="ac-amount-input">
                      <span>{draft.kind === "percentage" ? "%" : "R$"}</span>
                      <input
                        value={draft.amount}
                        onChange={(event) =>
                          setDraft({ ...draft, amount: event.target.value })
                        }
                        required
                        inputMode={
                          draft.kind === "percentage" ? "numeric" : "decimal"
                        }
                        pattern={
                          draft.kind === "percentage"
                            ? "[0-9]+"
                            : "[0-9]+([,.][0-9]{1,2})?"
                        }
                        placeholder={
                          draft.kind === "percentage" ? "10" : "10,00"
                        }
                        maxLength={12}
                      />
                    </div>
                  </label>
                </div>
                {draft.kind === "final_total" && (
                  <p className="ac-benefit-note">
                    Este cupom define o total final do pedido, incluindo
                    produtos e frete, no valor indicado.
                  </p>
                )}
                <div className="ac-form-row">
                  <label className="ao-field">
                    Mínimo em produtos (opcional)
                    <input
                      value={draft.minimum}
                      onChange={(event) =>
                        setDraft({ ...draft, minimum: event.target.value })
                      }
                      inputMode="decimal"
                      pattern="[0-9]+([,.][0-9]{1,2})?"
                      placeholder="R$ 0,00"
                      maxLength={12}
                    />
                    <small>Não inclui o valor do frete.</small>
                  </label>
                  <label className="ao-field">
                    Limite de usos (opcional)
                    <input
                      value={draft.maxUses}
                      onChange={(event) =>
                        setDraft({ ...draft, maxUses: event.target.value })
                      }
                      inputMode="numeric"
                      pattern="[0-9]+"
                      placeholder="Sem limite"
                      maxLength={7}
                    />
                    <small>
                      {editing
                        ? `${editing.uses_count} usos já registrados.`
                        : "Deixe em branco para não limitar."}
                    </small>
                  </label>
                </div>
                <div className="ac-form-row">
                  <label className="ao-field">
                    Começa em (opcional)
                    <input
                      type="datetime-local"
                      value={draft.startsAt}
                      onChange={(event) =>
                        setDraft({ ...draft, startsAt: event.target.value })
                      }
                    />
                  </label>
                  <label className="ao-field">
                    Válido até (opcional)
                    <input
                      type="datetime-local"
                      value={draft.expiresAt}
                      onChange={(event) =>
                        setDraft({ ...draft, expiresAt: event.target.value })
                      }
                    />
                  </label>
                </div>
                <p className="ac-date-note">
                  As datas usam o horário local do seu navegador. Sem data de
                  início, o cupom pode ser usado assim que for ativado.
                </p>
                <label className="ac-active-field">
                  <span>
                    <b>Cupom ativado</b>
                    <small>
                      A validade, o mínimo e o limite de usos continuam sendo
                      respeitados.
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    checked={draft.active}
                    onChange={(event) =>
                      setDraft({ ...draft, active: event.target.checked })
                    }
                  />
                </label>
              </div>
              <aside className="ac-preview" aria-label="Prévia do benefício">
                <div className="ac-preview-caption">PRÉVIA DO CUPOM</div>
                <Ticket size={30} strokeWidth={1.3} />
                <strong>
                  {previewAmount && previewAmount > 0
                    ? amountLabel({ kind: draft.kind, amount: previewAmount })
                    : draft.kind === "percentage"
                      ? "0%"
                      : "R$ 0,00"}
                </strong>
                <span>{amountDetail(draft.kind)}</span>
                <code>{draft.code || "SEUCUPOM"}</code>
                <p>
                  {draft.description ||
                    "Um incentivo para descobrir novos recursos."}
                </p>
                <small>As condições são conferidas no checkout.</small>
              </aside>
            </div>
          </fieldset>
          {saveError && (
            <div className="ao-error" role="alert">
              <AlertCircle size={17} />
              <span>{saveError}</span>
            </div>
          )}
          <footer className="ac-editor-footer">
            <button
              className="ao-button"
              type="button"
              disabled={saving}
              onClick={() => editor.current?.close()}
            >
              Voltar
            </button>
            <button
              className="ao-button ao-button-primary"
              type="submit"
              disabled={saving}
            >
              {saving ? (
                <RefreshCw size={16} className="ao-spinning" />
              ) : (
                <Check size={16} />
              )}
              {saving
                ? "Salvando..."
                : editing
                  ? "Salvar alterações"
                  : "Criar cupom"}
            </button>
          </footer>
        </form>
      </dialog>
      {notice && (
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

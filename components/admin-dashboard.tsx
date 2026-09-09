"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Package,
  LogOut,
  ExternalLink,
  Plus,
  Search,
  Eye,
  MessageCircle,
  TriangleAlert,
  ArrowUpRight,
  Pencil,
  Trash2,
  X,
  Upload,
  ArrowLeft,
  ArrowRight,
  Image as ImageIcon,
  Play,
  Check,
  RefreshCw,
  ShoppingBag,
} from "lucide-react";
import { Brand } from "./header";
import { useShop } from "./shop-provider";
import { categories, money, type AdminProduct, type Media } from "@/lib/types";
type Metrics = {
  total_products: number;
  active_products: number;
  views: number;
  cart_adds: number;
  whatsapp_clicks: number;
  low_stock: { id: string; name: string; stock: number }[];
  popular: { id: string; name: string; views: number; clicks: number }[];
  daily: { date: string; clicks: number }[];
};
type Draft = {
  id?: string;
  slug: string;
  name: string;
  description: string;
  price: string;
  category: string;
  stock: number;
  active: boolean;
  badge: string;
  skills: string;
  media: Media[];
};
const blank = (): Draft => ({
  name: "",
  slug: "",
  description: "",
  price: "",
  category: categories[0],
  stock: 0,
  active: false,
  badge: "",
  skills: "",
  media: [],
});
const slugify = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
async function api(path: string, options?: RequestInit) {
  const response = await fetch(path, options);
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("O servidor não respondeu. Tente novamente.");
  }
  if (response.status === 401) {
    window.location.assign("/admin/login");
    throw new Error("Entre novamente para continuar.");
  }
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir.");
  return data;
}
export function AdminDashboard({
  email,
  demo = false,
}: {
  email: string;
  demo?: boolean;
}) {
  const [tab, setTab] = useState<"overview" | "products">("overview");
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft>(blank());
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<AdminProduct | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const editor = useRef<HTMLDialogElement>(null);
  const confirmation = useRef<HTMLDialogElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const { notify } = useShop();
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [catalog, stats] = await Promise.all([
        api("/api/admin/products"),
        api("/api/admin/metrics"),
      ]);
      setProducts(catalog.products);
      setMetrics(stats);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function logout() {
    try {
      await api("/api/admin/logout", { method: "POST" });
      window.location.assign("/admin/login");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function edit(product?: AdminProduct) {
    setSaveError("");
    setDraft(
      product
        ? {
            id: product.id,
            name: product.name,
            slug: product.slug,
            description: product.description,
            price: (product.price_cents / 100).toFixed(2).replace(".", ","),
            category: product.category,
            stock: product.stock,
            active: product.active,
            badge: product.badge || "",
            skills: product.skills.join("\n"),
            media: [...product.media].sort((a, b) => a.position - b.position),
          }
        : blank(),
    );
    editor.current?.showModal();
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaveError("");
    const price = Number(draft.price.replace(",", "."));
    if (!Number.isFinite(price) || price <= 0) {
      setSaveError("Informe um preço válido.");
      return;
    }
    setSaving(true);
    try {
      const { price: unused, skills, badge, ...rest } = draft;
      await api("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...rest,
          price_cents: Math.round(price * 100),
          skills: skills
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          badge: badge || null,
          media: draft.media.map((m, i) => ({ ...m, position: i })),
        }),
      });
      editor.current?.close();
      notify("Recurso salvo com carinho.");
      await refresh();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function upload(files: FileList | null) {
    if (!files) return;
    setSaveError("");
    if (draft.media.length + files.length > 20) {
      setSaveError("Você pode incluir até 20 fotos e vídeos.");
      return;
    }
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 20 * 1024 * 1024)
          throw new Error("Cada arquivo pode ter até 20 MB.");
        const form = new FormData();
        form.append("file", file);
        const result = await api("/api/admin/media", {
          method: "POST",
          body: form,
        });
        setDraft((old) => ({
          ...old,
          media: [
            ...old.media,
            { ...result.media, position: old.media.length },
          ],
        }));
      }
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setUploading(false);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }
  function moveMedia(index: number, direction: number) {
    setDraft((old) => {
      const media = [...old.media];
      const next = index + direction;
      if (next < 0 || next >= media.length) return old;
      [media[index], media[next]] = [media[next], media[index]];
      return { ...old, media };
    });
  }
  async function toggle(p: AdminProduct) {
    try {
      await api("/api/admin/products/" + p.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !p.active }),
      });
      notify(p.active ? "Recurso desativado." : "Recurso disponível na loja.");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function remove() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await api("/api/admin/products/" + deleting.id, { method: "DELETE" });
      confirmation.current?.close();
      notify("Recurso excluído.");
      setDeleting(null);
      await refresh();
    } catch (e) {
      setDeleteError((e as Error).message);
    } finally {
      setDeleteBusy(false);
    }
  }
  const visibleProducts = products.filter(
    (p) =>
      (filter === "all" || (filter === "active" ? p.active : !p.active)) &&
      p.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Brand />
        <div className="sidebar-caption">SEU ATELIÊ</div>
        <nav aria-label="Gestão">
          <button
            className={tab === "overview" ? "active" : ""}
            onClick={() => setTab("overview")}
          >
            <LayoutDashboard size={19} />
            Visão geral
          </button>
          <button
            className={tab === "products" ? "active" : ""}
            onClick={() => setTab("products")}
          >
            <Package size={19} />
            Meus recursos<span>{products.length}</span>
          </button>
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
            RECURSOS DA TIA CRIS{" "}
            <span>
              / {tab === "overview" ? "Visão geral" : "Meus recursos"}
            </span>
          </span>
          <span className="admin-private">
            <LockIcon />
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
        <div className="admin-content">
          {demo && (
            <div className="setup-note">
              <strong>A vitrine está em prévia local.</strong>
              <p>
                Seus cadastros são salvos no Supabase. Após revisar preços e
                estoque, defina DEMO_MODE=false no .env.local para exibir os
                produtos reais na loja.
              </p>
            </div>
          )}
          <div className="admin-heading">
            <div>
              <div className="eyebrow">
                TUDO PRONTO PARA CRIAR POSSIBILIDADES
              </div>
              <h1>
                {tab === "overview"
                  ? "Seu ateliê, em um olhar."
                  : "Cada recurso, uma descoberta."}
              </h1>
              <p>
                {tab === "overview"
                  ? "Acompanhe o que acontece na sua loja."
                  : "Cuide dos produtos, das fotos e de cada detalhe."}
              </p>
            </div>
            <button className="button primary" onClick={() => edit()}>
              <Plus size={18} />
              Novo recurso
            </button>
          </div>
          {error && (
            <div className="error-message" role="alert">
              {error}{" "}
              <button onClick={() => void refresh()}>Tentar novamente</button>
            </div>
          )}
          {loading && !metrics ? (
            <div className="loading-dot">Preparando seu ateliê...</div>
          ) : tab === "overview" ? (
            <>
              <div className="metric-grid">
                <Metric
                  icon={<Package />}
                  label="Recursos cadastrados"
                  value={metrics?.total_products ?? 0}
                  note={`${metrics?.active_products ?? 0} disponíveis na loja`}
                  color="blue"
                />
                <Metric
                  icon={<Eye />}
                  label="Visualizações"
                  value={metrics?.views ?? 0}
                  note="Últimos 30 dias"
                  color="purple"
                />
                <Metric
                  icon={<MessageCircle />}
                  label="Pedidos pelo WhatsApp"
                  value={metrics?.whatsapp_clicks ?? 0}
                  note="Cliques de saída nos últimos 30 dias"
                  color="green"
                />
                <Metric
                  icon={<TriangleAlert />}
                  label="Precisam de reposição"
                  value={metrics?.low_stock.length ?? 0}
                  note="Recursos ativos com até 5 unidades"
                  color="orange"
                />
              </div>
              <div className="dashboard-panels">
                <section className="admin-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Conversas que viram descobertas</h2>
                      <p>Saídas para o WhatsApp nos últimos 14 dias</p>
                    </div>
                    <MessageCircle size={20} />
                  </div>
                  <div
                    className="bar-chart"
                    role="img"
                    aria-label={
                      metrics?.daily
                        .map((d) => `${d.date}: ${d.clicks} cliques`)
                        .join("; ") || "Ainda sem cliques"
                    }
                  >
                    {(metrics?.daily || []).map((day, i) => {
                      const max = Math.max(
                        1,
                        ...(metrics?.daily || []).map((d) => d.clicks),
                      );
                      return (
                        <div key={day.date} className="chart-column">
                          <span className="chart-value">
                            {day.clicks || ""}
                          </span>
                          <div
                            className="chart-bar"
                            style={{
                              height: Math.max(3, (day.clicks / max) * 120),
                            }}
                            title={`${day.date}: ${day.clicks} cliques`}
                          />
                          <small>{i % 2 === 0 ? day.date.slice(8) : ""}</small>
                        </div>
                      );
                    })}
                  </div>
                  <p className="small-note">
                    São pedidos estimados por cliques. O envio da mensagem, o
                    pagamento e a venda não são confirmados pelo WhatsApp.
                  </p>
                </section>
                <section className="admin-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Um carinho no estoque</h2>
                      <p>Recursos com até 5 unidades disponíveis</p>
                    </div>
                    <TriangleAlert size={20} />
                  </div>
                  {metrics?.low_stock.length ? (
                    <div className="low-stock-list">
                      {metrics.low_stock.slice(0, 6).map((p) => (
                        <button
                          key={p.id}
                          onClick={() =>
                            edit(products.find((x) => x.id === p.id))
                          }
                        >
                          <span>{p.name}</span>
                          <b>{p.stock === 0 ? "Esgotado" : `${p.stock} un.`}</b>
                          <Pencil size={14} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="panel-empty">
                      <Check size={30} />
                      <h3>Tudo em dia por aqui.</h3>
                      <p>Nenhum recurso ativo precisa de reposição.</p>
                    </div>
                  )}
                </section>
              </div>
              <section className="admin-panel popular-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Os recursos que despertam curiosidade</h2>
                    <p>
                      Visualizações e adições ao carrinho nos últimos 30 dias
                    </p>
                  </div>
                  <button onClick={() => setTab("products")}>
                    Ver todos <ArrowUpRight size={16} />
                  </button>
                </div>
                {metrics?.popular.length ? (
                  <div className="popular-list">
                    {metrics.popular.map((p, i) => (
                      <div key={p.id}>
                        <span className="popular-rank">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <strong>{p.name}</strong>
                        <span>
                          <Eye size={15} />
                          {p.views}
                        </span>
                        <span>
                          <ShoppingBag size={15} />
                          {p.clicks}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="panel-empty">
                    <Eye size={28} />
                    <h3>As primeiras descobertas vão aparecer aqui.</h3>
                    <p>
                      As métricas começam quando as pessoas interagem com a
                      loja.
                    </p>
                  </div>
                )}
              </section>
            </>
          ) : (
            <section className="admin-panel products-panel">
              <div className="admin-products-toolbar">
                <label className="search-field">
                  <Search size={18} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar nos meus recursos"
                    aria-label="Buscar produtos"
                  />
                </label>
                <div>
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    aria-label="Filtrar por status"
                  >
                    <option value="all">Todos os status</option>
                    <option value="active">Ativos</option>
                    <option value="inactive">Inativos</option>
                  </select>
                  <button
                    className="icon-button"
                    onClick={() => void refresh()}
                    aria-label="Atualizar produtos"
                  >
                    <RefreshCw size={17} />
                  </button>
                </div>
              </div>
              <div className="table-scroll">
                <table className="products-table">
                  <thead>
                    <tr>
                      <th>Recurso</th>
                      <th>Categoria</th>
                      <th>Preço</th>
                      <th>Estoque</th>
                      <th>Status</th>
                      <th>
                        <span className="sr-only">Ações</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleProducts.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <div className="table-product">
                            {p.media.find((m) => m.type === "image") ? (
                              <img
                                src={
                                  p.media.find((m) => m.type === "image")!.url
                                }
                                alt=""
                                width="46"
                                height="46"
                              />
                            ) : (
                              <span className="table-placeholder">
                                <ImageIcon size={20} />
                              </span>
                            )}
                            <strong>{p.name}</strong>
                          </div>
                        </td>
                        <td>{p.category}</td>
                        <td className="nowrap">{money(p.price_cents)}</td>
                        <td>
                          <span className={p.stock <= 5 ? "stock-low" : ""}>
                            {p.stock} un.
                          </span>
                        </td>
                        <td>
                          <button
                            className={
                              "status-toggle " + (p.active ? "is-active" : "")
                            }
                            onClick={() => void toggle(p)}
                            aria-label={
                              (p.active ? "Desativar " : "Ativar ") + p.name
                            }
                            aria-pressed={p.active}
                          >
                            <span />
                            {p.active ? "Ativo" : "Inativo"}
                          </button>
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                              aria-label={"Editar " + p.name}
                              onClick={() => edit(p)}
                            >
                              <Pencil size={17} />
                            </button>
                            <button
                              className="danger"
                              aria-label={"Excluir " + p.name}
                              onClick={() => {
                                setDeleting(p);
                                setDeleteError("");
                                confirmation.current?.showModal();
                              }}
                            >
                              <Trash2 size={17} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!visibleProducts.length && (
                <div className="panel-empty">
                  <Package size={32} />
                  <h3>
                    {products.length
                      ? "Nenhum recurso nessa busca."
                      : "O ateliê está pronto para o primeiro recurso."}
                  </h3>
                  <p>
                    {products.length
                      ? "Experimente outro nome ou status."
                      : "Cadastre um novo produto para começar sua loja."}
                  </p>
                  {!products.length && (
                    <button className="button secondary" onClick={() => edit()}>
                      Cadastrar recurso <Plus size={16} />
                    </button>
                  )}
                </div>
              )}
              <div className="table-foot">
                {visibleProducts.length} de {products.length} recursos
              </div>
            </section>
          )}
        </div>
      </main>
      <dialog
        className="product-dialog"
        ref={editor}
        aria-labelledby="editor-title"
        onCancel={(e) => {
          if (saving || uploading) e.preventDefault();
        }}
      >
        <div className="dialog-top">
          <div>
            <span className="eyebrow">CUIDADO EM CADA DETALHE</span>
            <h2 id="editor-title">
              {draft.id ? "Editar recurso" : "Uma nova descoberta"}
            </h2>
          </div>
          <button
            aria-label="Fechar edição"
            disabled={saving || uploading}
            onClick={() => editor.current?.close()}
          >
            <X size={22} />
          </button>
        </div>
        <form onSubmit={save}>
          <fieldset disabled={saving || uploading}>
            <div className="editor-grid">
              <div className="form-stack">
                <label className="field">
                  Nome do recurso
                  <input
                    value={draft.name}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        name: e.target.value,
                        ...(!d.id ? { slug: slugify(e.target.value) } : {}),
                      }))
                    }
                    required
                    minLength={2}
                    maxLength={150}
                    placeholder="Ex.: Livro das Vogais"
                  />
                </label>
                <label className="field">
                  Descrição
                  <textarea
                    value={draft.description}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, description: e.target.value }))
                    }
                    required
                    minLength={10}
                    maxLength={5000}
                    rows={5}
                    placeholder="Conte como esse recurso transforma o brincar."
                  />
                </label>
                <div className="field-row">
                  <label className="field">
                    Preço (R$)
                    <input
                      inputMode="decimal"
                      value={draft.price}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, price: e.target.value }))
                      }
                      required
                      pattern="[0-9]+([,.][0-9]{1,2})?"
                      placeholder="0,00"
                    />
                  </label>
                  <label className="field">
                    Quantidade disponível
                    <input
                      type="number"
                      min={0}
                      max={100000}
                      value={draft.stock}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          stock: Number(e.target.value),
                        }))
                      }
                      required
                    />
                  </label>
                </div>
                <label className="field">
                  Categoria
                  <select
                    value={draft.category}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, category: e.target.value }))
                    }
                  >
                    {categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Habilidades trabalhadas{" "}
                  <span className="small-note">
                    Uma por linha, até 15 habilidades
                  </span>
                  <textarea
                    value={draft.skills}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, skills: e.target.value }))
                    }
                    rows={3}
                    placeholder="Coordenação motora fina&#10;Reconhecimento das vogais"
                  />
                </label>
                <label className="field">
                  Endereço do produto
                  <input
                    value={draft.slug}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, slug: e.target.value }))
                    }
                    required
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    maxLength={120}
                  />
                  <span className="small-note">
                    /produto/{draft.slug || "nome-do-recurso"}
                  </span>
                </label>
              </div>
              <div className="form-stack">
                <div className="field">
                  Fotos e vídeos
                  <span className="small-note">
                    A primeira foto será a capa. Até 20 arquivos, 20 MB por
                    arquivo.
                  </span>
                </div>
                <label className="upload-area">
                  <Upload size={27} />
                  <strong>
                    {uploading
                      ? "Enviando arquivos..."
                      : "Adicione fotos e vídeos"}
                  </strong>
                  <span>JPG, PNG, WebP, MP4 e WebM</span>
                  <input
                    ref={uploadRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                    multiple
                    onChange={(e) => void upload(e.target.files)}
                  />
                </label>
                <div className="media-grid">
                  {draft.media.map((m, i) => (
                    <div key={m.id} className="media-tile">
                      {m.type === "image" ? (
                        <img src={m.url} alt={"Foto " + (i + 1)} />
                      ) : (
                        <video src={m.url} controls preload="metadata" />
                      )}
                      <div>
                        <button
                          type="button"
                          disabled={i === 0}
                          aria-label="Mover mídia para antes"
                          onClick={() => moveMedia(i, -1)}
                        >
                          <ArrowLeft size={14} />
                        </button>
                        <span>
                          {m.type === "image" &&
                          draft.media.find((x) => x.type === "image")?.id ===
                            m.id
                            ? "Capa"
                            : i + 1}
                        </span>
                        <button
                          type="button"
                          disabled={i === draft.media.length - 1}
                          aria-label="Mover mídia para depois"
                          onClick={() => moveMedia(i, 1)}
                        >
                          <ArrowRight size={14} />
                        </button>
                        <button
                          type="button"
                          className="danger"
                          aria-label="Remover mídia"
                          onClick={() =>
                            setDraft((d) => ({
                              ...d,
                              media: d.media.filter((x) => x.id !== m.id),
                            }))
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <label className="field">
                  Destaque visual
                  <select
                    value={draft.badge}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, badge: e.target.value }))
                    }
                  >
                    <option value="">Sem destaque</option>
                    <option>Escolha da Tia Cris</option>
                    <option>Novidade</option>
                    <option>Mais vendido</option>
                  </select>
                  <span className="small-note">
                    Use “Mais vendido” apenas quando o histórico de vendas
                    sustentar o destaque.
                  </span>
                </label>
                <label className="active-checkbox">
                  <input
                    type="checkbox"
                    checked={draft.active}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, active: e.target.checked }))
                    }
                  />
                  <div>
                    <strong>Disponível na loja</strong>
                    <span>Produtos inativos ficam visíveis só na gestão.</span>
                  </div>
                </label>
              </div>
            </div>
          </fieldset>
          {saveError && (
            <p className="error-message" role="alert">
              {saveError}
            </p>
          )}
          <div className="dialog-footer">
            <button
              type="button"
              className="button secondary"
              disabled={saving || uploading}
              onClick={() => editor.current?.close()}
            >
              Cancelar
            </button>
            <button className="button primary" disabled={saving || uploading}>
              {saving
                ? "Salvando..."
                : uploading
                  ? "Aguarde o upload..."
                  : "Salvar recurso"}
              <Check size={17} />
            </button>
          </div>
        </form>
      </dialog>
      <dialog
        className="confirm-dialog"
        ref={confirmation}
        aria-labelledby="delete-title"
        onCancel={(e) => {
          if (deleteBusy) e.preventDefault();
        }}
      >
        <div className="delete-icon">
          <Trash2 size={26} />
        </div>
        <h2 id="delete-title">Excluir este recurso?</h2>
        <p>
          “{deleting?.name}” será removido do catálogo. Essa ação não pode ser
          desfeita. Você também pode desativá-lo para guardar o cadastro.
        </p>
        {deleteError && (
          <div className="error-message" role="alert">
            {deleteError}
          </div>
        )}
        <div className="dialog-footer">
          <button
            className="button secondary"
            disabled={deleteBusy}
            onClick={() => confirmation.current?.close()}
          >
            Manter recurso
          </button>
          <button
            className="button danger-button"
            disabled={deleteBusy}
            onClick={() => void remove()}
          >
            {deleteBusy ? "Excluindo..." : "Excluir recurso"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
function Metric({
  icon,
  label,
  value,
  note,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  note: string;
  color: string;
}) {
  return (
    <section className={"metric-card " + color}>
      <span className="metric-icon">{icon}</span>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </section>
  );
}
function LockIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V6a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

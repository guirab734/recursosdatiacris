"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ShoppingBag,
  Trash2,
  ArrowLeft,
  ArrowRight,
  MapPin,
  MessageCircle,
  ShieldCheck,
  LoaderCircle,
  Check,
} from "lucide-react";
import { Header, Footer } from "./header";
import { Quantity } from "./product-detail";
import { useShop } from "./shop-provider";
import { money, effectivePrice, type Product, type Quote } from "@/lib/types";
import { track } from "@/lib/client-events";
export function CartPage() {
  const { items, update, count } = useShop();
  const [products, setProducts] = useState<Product[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [result, setResult] = useState<Quote | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [method, setMethod] = useState<"address" | "location">("address");
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locating, setLocating] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [complement, setComplement] = useState("");
  const checkoutRevision = JSON.stringify({
    items,
    name,
    address,
    complement,
    method,
    location,
  });
  const latestCheckout = useRef(checkoutRevision);
  latestCheckout.current = checkoutRevision;
  useEffect(() => {
    fetch("/api/products")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setProducts(data.products);
      })
      .catch(() =>
        setError(
          "Não foi possível carregar os recursos. Recarregue a página para tentar novamente.",
        ),
      );
  }, []);
  useEffect(() => {
    setResult(null);
    setQuote(null);
    setError("");
    if (!items.length) return;
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
        signal: controller.signal,
      })
        .then(async (r) => {
          const data = await r.json();
          if (!r.ok) throw new Error(data.error);
          setQuote(data);
        })
        .catch((e) => {
          if (e.name !== "AbortError") setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [items]);
  useEffect(
    () => setResult(null),
    [name, address, complement, method, location],
  );
  function locate() {
    setLocating(true);
    setError("");
    if (!navigator.geolocation) {
      setError(
        "Seu navegador não oferece localização. Informe o endereço manualmente.",
      );
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocating(false);
      },
      () => {
        setError(
          "Não conseguimos obter sua localização. Você pode informar o endereço manualmente.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
    );
  }
  async function checkout(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    setResult(null);
    const revision = checkoutRevision;
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          delivery: {
            name,
            method,
            address,
            complement,
            ...(method === "location" && location ? location : {}),
          },
        }),
      });
      const data = await response.json();
      if (latestCheckout.current !== revision) return;
      if (!response.ok) throw new Error(data.error);
      setQuote(data);
      setResult(data);
    } catch (e) {
      if (latestCheckout.current === revision) setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <>
      <Header />
      <main className="page-wrap">
        <div className="eyebrow">UMA SACOLA CHEIA DE POSSIBILIDADES</div>
        <h1 className="page-title">
          Suas próximas <em>descobertas.</em>
        </h1>
        <p className="page-subtitle">
          {count
            ? `${count} ${count === 1 ? "recurso escolhido" : "recursos escolhidos"} com carinho. Falta pouco para levar a diversão para casa.`
            : "Vamos encontrar algo especial para aprender brincando?"}
        </p>
        {!items.length ? (
          <div className="empty-state">
            <ShoppingBag size={48} />
            <h3>Tem espaço para muita imaginação aqui.</h3>
            <p>Seu carrinho está esperando a primeira descoberta.</p>
            <Link href="/#catalogo" className="button primary">
              Explorar os recursos <ArrowRight size={18} />
            </Link>
          </div>
        ) : (
          <div className="cart-layout">
            <div>
              <div className="cart-items">
                {items.map((item) => {
                  const p = products.find((p) => p.id === item.product_id);
                  const line = quote?.items.find(
                    (x) => x.product_id === item.product_id,
                  );
                  const cover = p?.media.find((m) => m.type === "image");
                  return (
                    <article className="cart-row" key={item.product_id}>
                      {cover ? (
                        <img
                          src={cover.url}
                          alt={p?.name}
                          width="96"
                          height="105"
                        />
                      ) : (
                        <div />
                      )}
                      <div>
                        {p ? (
                          <Link href={"/produto/" + p.slug}>
                            <h3>{p.name}</h3>
                          </Link>
                        ) : (
                          <h3>Recurso indisponível</h3>
                        )}
                        <p>
                          {p
                            ? `${money(line?.unit_price_cents ?? effectivePrice(p))} por unidade`
                            : "Remova este item para continuar."}
                        </p>
                        <Quantity
                          value={item.quantity}
                          onChange={(q) => update(item.product_id, q)}
                        />
                      </div>
                      <div className="cart-line-right">
                        <strong>
                          {line ? money(line.subtotal_cents) : "Conferindo..."}
                        </strong>
                        <button
                          onClick={() => update(item.product_id, 0)}
                          aria-label={"Remover " + (p?.name || "recurso")}
                        >
                          <Trash2 size={13} />
                          Remover
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
              <Link className="continue-link" href="/#catalogo">
                <ArrowLeft size={16} />
                Continuar descobrindo
              </Link>
            </div>
            <aside className="order-summary">
              <h2>Um resumo do seu pedido</h2>
              <div className="summary-line">
                <span>Produtos ({count})</span>
                <strong>
                  {quote ? money(quote.total_cents) : "Conferindo..."}
                </strong>
              </div>
              <div className="summary-line">
                <span>Entrega</span>
                <span>A combinar</span>
              </div>
              <div className="summary-line total">
                <span>Total estimado</span>
                <strong>{quote ? money(quote.total_cents) : "..."}</strong>
              </div>
              <p className="small-note">
                O frete não está incluído. Prazo, entrega e pagamento serão
                combinados com a Tia Cris.
              </p>
              {quote?.demo && (
                <p className="demo-note">
                  Prévia local. Os valores serão confirmados no atendimento.
                </p>
              )}
              <form onSubmit={checkout} className="checkout-form form-stack">
                <div>
                  <h3>Onde as descobertas vão chegar?</h3>
                  <div className="delivery-tabs">
                    <label>
                      <input
                        type="radio"
                        name="delivery-method"
                        checked={method === "address"}
                        onChange={() => setMethod("address")}
                      />
                      Meu endereço
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="delivery-method"
                        checked={method === "location"}
                        onChange={() => setMethod("location")}
                      />
                      Localização
                    </label>
                  </div>
                </div>
                <label className="field">
                  Seu nome
                  <input
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    minLength={2}
                    maxLength={100}
                    placeholder="Como podemos chamar você?"
                  />
                </label>
                {method === "address" ? (
                  <label className="field">
                    Endereço completo
                    <textarea
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      autoComplete="street-address"
                      required
                      minLength={10}
                      maxLength={400}
                      placeholder="Rua, número, bairro, cidade, estado e CEP"
                    />
                  </label>
                ) : (
                  <div>
                    <button
                      type="button"
                      className="location-button"
                      disabled={locating}
                      onClick={locate}
                    >
                      {locating ? (
                        <LoaderCircle size={16} />
                      ) : location ? (
                        <Check size={16} />
                      ) : (
                        <MapPin size={16} />
                      )}{" "}
                      {locating
                        ? "Buscando localização..."
                        : location
                          ? "Localização recebida. Atualizar?"
                          : "Usar minha localização"}
                    </button>
                    {location && (
                      <p className="small-note">
                        Localização será compartilhada apenas na mensagem do seu
                        pedido.
                      </p>
                    )}
                  </div>
                )}
                <label className="field">
                  Complemento ou referência{" "}
                  <span className="small-note">Opcional</span>
                  <input
                    value={complement}
                    onChange={(e) => setComplement(e.target.value)}
                    maxLength={150}
                    placeholder="Apartamento, ponto de referência..."
                  />
                </label>
                {error && (
                  <p className="error-message" role="alert">
                    {error}
                  </p>
                )}
                <button
                  className="button primary full-width"
                  type="submit"
                  disabled={
                    submitting ||
                    loading ||
                    !quote ||
                    (method === "location" && !location)
                  }
                >
                  {submitting
                    ? "Conferindo seu pedido..."
                    : result
                      ? "Atualizar pedido"
                      : "Finalizar pedido"}
                  <ArrowRight size={18} />
                </button>
                <p className="small-note">
                  <ShieldCheck
                    size={13}
                    style={{ display: "inline", verticalAlign: "middle" }}
                  />{" "}
                  O pedido é conferido antes de abrir o WhatsApp. Nenhum
                  pagamento é feito aqui.
                </p>
              </form>
              {result && (
                <div className="quote-result">
                  <p className="success-message">
                    Tudo pronto para conversar com a Tia Cris!
                  </p>
                  <pre>{result.message}</pre>
                  <a
                    className="button whatsapp full-width"
                    href={result.whatsapp_url}
                    onClick={() =>
                      track(
                        "whatsapp",
                        items.map((x) => x.product_id),
                      )
                    }
                  >
                    <MessageCircle size={19} />
                    Enviar pelo WhatsApp
                  </a>
                  <p className="small-note" style={{ marginTop: 12 }}>
                    A mensagem abrirá no WhatsApp para você revisar e enviar. O
                    pedido ainda não reserva os produtos.
                  </p>
                </div>
              )}
            </aside>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}

"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShoppingBag,
  Trash2,
  ArrowLeft,
  ArrowRight,
  MapPin,
  MessageCircle,
  ShieldCheck,
  LoaderCircle,
  Truck,
  CreditCard,
  QrCode,
  Gift,
  PackageCheck,
  TicketPercent,
  Check,
  X,
} from "lucide-react";
import { Header, Footer } from "./header";
import { Quantity } from "./product-detail";
import { useShop } from "./shop-provider";
import { money, effectivePrice, type Product, type Quote } from "@/lib/types";
import type {
  CustomerAddress,
  CustomerOrder,
  PaymentMethod,
  ShippingQuote,
} from "@/lib/commerce-types";
import { customerAddressSchema } from "@/lib/commerce-validation";
import type { AppliedCoupon } from "@/lib/coupon-types";
import { couponCodeSchema } from "@/lib/coupon-validation";
import "./commerce.css";

const emptyAddress: CustomerAddress = {
  name: "",
  email: "",
  phone: "",
  document: "",
  postal_code: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
};
const states = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];
const digits = (value: string) => value.replace(/\D/g, "");
type CouponApplication = {
  coupon: AppliedCoupon;
  subtotal_cents: number;
  discount_cents: number;
  discounted_subtotal_cents: number;
};

export function CartPage() {
  const router = useRouter();
  const { items, update, count, clear } = useShop();
  const [products, setProducts] = useState<Product[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [shipping, setShipping] = useState<ShippingQuote | null>(null);
  const [address, setAddress] = useState<CustomerAddress>(emptyAddress);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentMethod>("pix");
  const [error, setError] = useState("");
  const [checkoutFailed, setCheckoutFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [findingCep, setFindingCep] = useState(false);
  const [cepNote, setCepNote] = useState("");
  const [expired, setExpired] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [couponAttempt, setCouponAttempt] = useState(0);
  const [couponResult, setCouponResult] = useState<
    (CouponApplication & { revision: string }) | null
  >(null);
  const [couponError, setCouponError] = useState("");
  const [couponNotice, setCouponNotice] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const paymentSection = useRef<HTMLElement>(null);
  const submitLock = useRef(false);
  const idempotency = useRef<{ fingerprint: string; key: string } | null>(null);
  const revision = JSON.stringify({
    items,
    address,
    couponCode,
    couponAttempt,
  });
  const latestRevision = useRef(revision);
  latestRevision.current = revision;
  const cartRevision = JSON.stringify(items);
  const couponRevision = JSON.stringify({ items, couponCode, couponAttempt });
  const latestCouponRevision = useRef(couponRevision);
  latestCouponRevision.current = couponRevision;
  const appliedCoupon =
    couponResult?.revision === couponRevision ? couponResult : null;
  const couponPending = applyingCoupon;
  const effectiveCoupon = shipping?.coupon ?? appliedCoupon?.coupon;
  const finalTotalCoupon = effectiveCoupon?.kind === "final_total";
  const isLocal =
    address.city.trim().toLocaleLowerCase("pt-BR") === "aracaju" &&
    address.state === "SE";
  const subtotal =
    shipping?.subtotal_cents ??
    appliedCoupon?.subtotal_cents ??
    quote?.total_cents ??
    0;
  const discountedSubtotal =
    shipping?.discounted_subtotal_cents ??
    appliedCoupon?.discounted_subtotal_cents ??
    subtotal;
  const threshold = isLocal ? 15000 : 30000;
  const remaining = Math.max(0, threshold - discountedSubtotal);
  const selectedShipping = shipping?.options.find(
    (option) => option.id === serviceId,
  );
  const payable =
    selectedShipping?.total_cents ??
    (shipping?.local ? shipping.total_cents : undefined) ??
    discountedSubtotal + (selectedShipping?.charged_cents ?? 0);
  const couponDiscount =
    finalTotalCoupon && shipping
      ? Math.max(0, subtotal + (selectedShipping?.charged_cents ?? 0) - payable)
      : (selectedShipping?.discount_cents ??
        shipping?.discount_cents ??
        appliedCoupon?.discount_cents ??
        0);

  useEffect(() => {
    try {
      const saved = couponCodeSchema.safeParse(
        sessionStorage.getItem("cris-cart-coupon"),
      );
      if (saved.success) {
        setCouponInput(saved.data);
        setCouponCode(saved.data);
      }
    } catch {}
  }, []);

  useEffect(() => {
    setCouponResult(null);
    setCouponError("");
    if (!couponCode || !items.length) {
      setApplyingCoupon(false);
      return;
    }
    const controller = new AbortController();
    const requestRevision = couponRevision;
    setApplyingCoupon(true);
    setCouponNotice("");
    const timer = setTimeout(() => {
      void fetch("/api/coupons/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, coupon_code: couponCode }),
        signal: controller.signal,
      })
        .then(async (response) => {
          const data = await response.json();
          if (
            controller.signal.aborted ||
            latestCouponRevision.current !== requestRevision
          )
            return;
          if (!response.ok)
            throw new Error(
              data.error ||
                "Não foi possível aplicar este cupom. Confira o código e tente novamente.",
            );
          setCouponResult({ ...data, revision: requestRevision });
          try {
            sessionStorage.setItem("cris-cart-coupon", data.coupon.code);
          } catch {}
        })
        .catch((e) => {
          if (
            !controller.signal.aborted &&
            latestCouponRevision.current === requestRevision
          )
            setCouponError(
              e.message || "Não foi possível conferir o cupom agora.",
            );
        })
        .finally(() => {
          if (
            !controller.signal.aborted &&
            latestCouponRevision.current === requestRevision
          )
            setApplyingCoupon(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // Personal details do not affect the coupon validation request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [couponRevision]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/products", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setProducts(data.products);
      })
      .catch((e) => {
        if (e.name !== "AbortError")
          setError(
            "Não foi possível carregar os recursos. Atualize a página para tentar novamente.",
          );
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
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
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok)
            throw new Error(
              data.error || "Não foi possível conferir seu carrinho.",
            );
          if (!controller.signal.aborted) setQuote(data);
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
    // The serialized cart also changes when quantities change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartRevision]);

  useEffect(() => {
    setShipping(null);
    setServiceId(null);
    setExpired(false);
  }, [revision]);

  useEffect(() => {
    if (!shipping) return;
    const tick = () =>
      setExpired(Date.now() >= new Date(shipping.expires_at).getTime());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [shipping]);

  useEffect(() => {
    const cep = digits(address.postal_code);
    setCepNote("");
    if (cep.length !== 8) {
      setFindingCep(false);
      return;
    }
    const controller = new AbortController();
    setFindingCep(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/address/${cep}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error || "Confira o CEP ou preencha o endereço abaixo.",
          );
        if (!controller.signal.aborted) {
          setAddress((previous) =>
            digits(previous.postal_code) !== cep
              ? previous
              : {
                  ...previous,
                  street: data.street || previous.street,
                  neighborhood: data.neighborhood || previous.neighborhood,
                  city: data.city || previous.city,
                  state: data.state || previous.state,
                },
          );
          setCepNote(
            "Endereço encontrado. Confira os dados e informe o número.",
          );
          setFieldErrors((previous) => ({
            ...previous,
            street: "",
            neighborhood: "",
            city: "",
            state: "",
          }));
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setCepNote((e as Error).message || "Preencha seu endereço abaixo.");
      } finally {
        if (!controller.signal.aborted) setFindingCep(false);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [address.postal_code]);

  function changeField(key: keyof CustomerAddress, value: string) {
    setAddress((previous) => ({ ...previous, [key]: value }));
    setFieldErrors((previous) => ({ ...previous, [key]: "" }));
    setError("");
  }

  function applyCoupon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || quoting || applyingCoupon) return;
    const parsed = couponCodeSchema.safeParse(couponInput);
    if (!parsed.success) {
      setCouponError(
        "Confira o cupom: use de 3 a 32 letras, números, hífen ou sublinhado.",
      );
      return;
    }
    const code = parsed.data;
    setCouponError("");
    setCouponNotice("");
    setError("");
    setApplyingCoupon(true);
    setCouponCode(code);
    setCouponAttempt((value) => value + 1);
    idempotency.current = null;
    try {
      sessionStorage.removeItem("cris-checkout-retry");
      sessionStorage.removeItem("cris-cart-coupon");
    } catch {}
  }

  function removeCoupon() {
    if (submitting) return;
    setCouponCode(null);
    setCouponResult(null);
    setCouponInput("");
    setCouponError("");
    setCouponNotice("Cupom removido. Os valores do pedido foram atualizados.");
    setError("");
    setApplyingCoupon(false);
    idempotency.current = null;
    try {
      sessionStorage.removeItem("cris-checkout-retry");
      sessionStorage.removeItem("cris-cart-coupon");
    } catch {}
  }

  async function quoteShipping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (couponPending || (couponCode && !appliedCoupon)) return;
    const parsed = customerAddressSchema.safeParse(address);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        errors[key] ||=
          key === "document"
            ? "Confira os 11 números do CPF."
            : key === "name"
              ? "Informe seu nome e sobrenome."
              : key === "phone"
                ? "Informe um telefone com DDD."
                : "Confira este campo para continuar.";
      }
      setFieldErrors(errors);
      setError("Falta conferir alguns dados do seu endereço.");
      const form = event.currentTarget;
      requestAnimationFrame(() => {
        const firstInvalid = form.elements.namedItem(Object.keys(errors)[0]);
        if (firstInvalid instanceof HTMLElement) firstInvalid.focus();
      });
      return;
    }
    setError("");
    setFieldErrors({});
    setQuoting(true);
    const requestRevision = revision;
    try {
      const response = await fetch("/api/shipping/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          address: parsed.data,
          ...(appliedCoupon ? { coupon_code: appliedCoupon.coupon.code } : {}),
        }),
      });
      const data = await response.json();
      if (latestRevision.current !== requestRevision) return;
      if (!response.ok)
        throw new Error(
          data.error ||
            "Não conseguimos consultar as entregas. Tente novamente.",
        );
      const shippingQuote = data as ShippingQuote;
      setShipping(shippingQuote);
      setExpired(false);
      setServiceId(shippingQuote.options[0]?.id ?? null);
      setPayment(shippingQuote.local ? "whatsapp" : "pix");
      requestAnimationFrame(() =>
        paymentSection.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      );
    } catch (e) {
      if (latestRevision.current === requestRevision)
        setError((e as Error).message);
    } finally {
      setQuoting(false);
    }
  }

  async function placeOrder() {
    if (
      submitLock.current ||
      couponPending ||
      (couponCode && !appliedCoupon) ||
      !shipping ||
      expired ||
      (!shipping.local && !selectedShipping)
    )
      return;
    submitLock.current = true;
    setSubmitting(true);
    setCheckoutFailed(false);
    setError("");
    const requestRevision = revision;
    const request = {
      items,
      address,
      quote_id: shipping.quote_id,
      service_id: shipping.local ? null : serviceId,
      payment_method: shipping.local ? "whatsapp" : payment,
      ...(appliedCoupon ? { coupon_code: appliedCoupon.coupon.code } : {}),
    };
    let uncertainOrder = false;
    try {
      // Persist only a digest and a random retry key, never personal data or prices.
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(request)),
      );
      const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      if (!idempotency.current) {
        try {
          idempotency.current = JSON.parse(
            sessionStorage.getItem("cris-checkout-retry") || "null",
          );
        } catch {}
      }
      if (idempotency.current?.fingerprint !== fingerprint) {
        idempotency.current = { fingerprint, key: crypto.randomUUID() };
        try {
          sessionStorage.setItem(
            "cris-checkout-retry",
            JSON.stringify(idempotency.current),
          );
        } catch {}
      }
      uncertainOrder = true;
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...request,
          idempotency_key: idempotency.current.key,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        uncertainOrder = response.status >= 500 || response.status === 409;
        throw new Error(
          data.error ||
            "Não foi possível concluir. Tente novamente para recuperar seu pedido.",
        );
      }
      const order = data.order as CustomerOrder;
      if (!order?.id)
        throw new Error(
          "A confirmação está demorando. Tente novamente para recuperar seu pedido.",
        );
      try {
        sessionStorage.removeItem("cris-cart-coupon");
      } catch {}
      if (latestRevision.current === requestRevision) clear();
      router.push(`/pedidos/${encodeURIComponent(order.id)}`);
    } catch (e) {
      setCheckoutFailed(uncertainOrder);
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
      submitLock.current = false;
    }
  }

  function field(
    key: keyof CustomerAddress,
    label: string,
    options: {
      placeholder?: string;
      autoComplete?: string;
      type?: string;
      maxLength?: number;
      numeric?: boolean;
      optional?: boolean;
      wide?: boolean;
    } = {},
  ) {
    return (
      <label className={`field ${options.wide ? "commerce-field-wide" : ""}`}>
        <span>
          {label}
          {options.optional && (
            <span className="commerce-optional">Opcional</span>
          )}
        </span>
        <input
          name={key}
          value={address[key]}
          onChange={(event) => changeField(key, event.target.value)}
          type={options.type || "text"}
          autoComplete={options.autoComplete}
          placeholder={options.placeholder}
          required={!options.optional}
          maxLength={options.maxLength ?? 100}
          inputMode={options.numeric ? "numeric" : undefined}
          aria-invalid={!!fieldErrors[key]}
          aria-describedby={fieldErrors[key] ? `error-${key}` : undefined}
        />
        {fieldErrors[key] && (
          <span className="commerce-field-error" id={`error-${key}`}>
            {fieldErrors[key]}
          </span>
        )}
      </label>
    );
  }

  return (
    <>
      <Header />
      <main className="page-wrap commerce-cart">
        <div className="eyebrow">UMA SACOLA CHEIA DE POSSIBILIDADES</div>
        <div className="commerce-title-row">
          <div>
            <h1 className="page-title">
              Quase aí, <em>quase seu.</em>
            </h1>
            <p className="page-subtitle">
              Cada descoberta começa com uma escolha. Vamos levar as suas para
              casa?
            </p>
          </div>
          <Link className="commerce-text-link" href="/pedidos">
            <PackageCheck size={17} /> Meus pedidos
          </Link>
        </div>
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
          <div className="commerce-checkout-layout">
            <div className="commerce-checkout-main">
              <section
                className="commerce-card commerce-cart-items"
                aria-label="Recursos escolhidos"
              >
                <div className="commerce-section-heading">
                  <span className="commerce-step">01</span>
                  <div>
                    <h2>Suas descobertas</h2>
                    <p>
                      {count}{" "}
                      {count === 1
                        ? "recurso escolhido"
                        : "recursos escolhidos"}{" "}
                      com carinho
                    </p>
                  </div>
                  <ShoppingBag size={22} />
                </div>
                <fieldset className="commerce-unfieldset" disabled={submitting}>
                  <div className="cart-items">
                    {items.map((item) => {
                      const product = products.find(
                        (product) => product.id === item.product_id,
                      );
                      const line = quote?.items.find(
                        (line) => line.product_id === item.product_id,
                      );
                      const cover = product?.media.find(
                        (media) => media.type === "image",
                      );
                      return (
                        <article className="cart-row" key={item.product_id}>
                          {cover ? (
                            <img
                              src={cover.url}
                              alt={product?.name || ""}
                              width="96"
                              height="105"
                            />
                          ) : (
                            <div className="commerce-product-placeholder">
                              <ShoppingBag />
                            </div>
                          )}
                          <div>
                            {product ? (
                              <Link href={`/produto/${product.slug}`}>
                                <h3>{product.name}</h3>
                              </Link>
                            ) : (
                              <h3>
                                {loading
                                  ? "Carregando recurso..."
                                  : "Recurso indisponível"}
                              </h3>
                            )}
                            <p>
                              {product
                                ? `${money(line?.unit_price_cents ?? effectivePrice(product))} por unidade`
                                : "Aguarde a conferência ou remova este item."}
                            </p>
                            <Quantity
                              value={item.quantity}
                              onChange={(quantity) =>
                                update(item.product_id, quantity)
                              }
                            />
                          </div>
                          <div className="cart-line-right">
                            <strong>
                              {line ? money(line.subtotal_cents) : "..."}
                            </strong>
                            <button
                              type="button"
                              onClick={() => update(item.product_id, 0)}
                              aria-label={`Remover ${product?.name || "recurso"}`}
                            >
                              <Trash2 size={13} /> Remover
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </fieldset>
                <Link className="continue-link" href="/#catalogo">
                  <ArrowLeft size={16} /> Continuar descobrindo
                </Link>
              </section>

              <section className="commerce-card">
                <div className="commerce-section-heading">
                  <span className="commerce-step">02</span>
                  <div>
                    <h2>Um destino para a diversão</h2>
                    <p>Preencha seus dados para ver as formas de entrega.</p>
                  </div>
                  <MapPin size={22} />
                </div>
                <form onSubmit={quoteShipping} noValidate>
                  <fieldset
                    className="commerce-unfieldset"
                    disabled={submitting || quoting}
                  >
                    <div className="commerce-fields">
                      {field("name", "Nome completo", {
                        autoComplete: "name",
                        placeholder: "Seu nome e sobrenome",
                        wide: true,
                      })}
                      {field("email", "E-mail", {
                        type: "email",
                        autoComplete: "email",
                        placeholder: "voce@exemplo.com",
                        maxLength: 254,
                      })}
                      {field("phone", "Telefone com DDD", {
                        type: "tel",
                        autoComplete: "tel",
                        placeholder: "(79) 99999-9999",
                        maxLength: 20,
                      })}
                      {field("document", "CPF", {
                        numeric: true,
                        placeholder: "000.000.000-00",
                        maxLength: 14,
                      })}
                      {field("postal_code", "CEP", {
                        numeric: true,
                        autoComplete: "postal-code",
                        placeholder: "00000-000",
                        maxLength: 9,
                      })}
                      {(findingCep || cepNote) && (
                        <p
                          className="commerce-field-wide small-note commerce-inline-icon"
                          role="status"
                        >
                          {findingCep && (
                            <LoaderCircle size={14} className="commerce-spin" />
                          )}
                          {findingCep ? "Buscando seu endereço..." : cepNote}
                        </p>
                      )}
                      {field("street", "Rua ou avenida", {
                        autoComplete: "address-line1",
                        placeholder: "Nome da rua ou avenida",
                        maxLength: 150,
                        wide: true,
                      })}
                      {field("number", "Número", {
                        placeholder: "Número ou S/N",
                        maxLength: 20,
                      })}
                      {field("complement", "Complemento", {
                        autoComplete: "address-line2",
                        placeholder: "Apartamento, bloco, referência",
                        optional: true,
                      })}
                      {field("neighborhood", "Bairro", {
                        placeholder: "Seu bairro",
                      })}
                      <label className="field">
                        <span>Estado</span>
                        <select
                          name="state"
                          value={address.state}
                          onChange={(event) =>
                            changeField("state", event.target.value)
                          }
                          required
                          autoComplete="address-level1"
                          aria-invalid={!!fieldErrors.state}
                        >
                          <option value="">Selecione</option>
                          {states.map((state) => (
                            <option key={state} value={state}>
                              {state}
                            </option>
                          ))}
                        </select>
                        {fieldErrors.state && (
                          <span className="commerce-field-error">
                            {fieldErrors.state}
                          </span>
                        )}
                      </label>
                      {field("city", "Cidade", {
                        autoComplete: "address-level2",
                        placeholder: "Sua cidade",
                        wide: true,
                      })}
                    </div>
                    <p className="small-note commerce-data-note">
                      <ShieldCheck size={15} /> Seus dados são usados para
                      identificar o pagamento e entregar seu pedido. Você pode
                      comprar sem criar uma conta.
                    </p>
                    <button
                      className="button primary full-width"
                      disabled={
                        !quote ||
                        loading ||
                        findingCep ||
                        quoting ||
                        submitting ||
                        couponPending ||
                        (!!couponCode && !appliedCoupon)
                      }
                      type="submit"
                    >
                      {quoting ? (
                        <>
                          <LoaderCircle className="commerce-spin" size={18} />{" "}
                          Consultando entregas...
                        </>
                      ) : (
                        <>
                          {shipping
                            ? "Atualizar opções de entrega"
                            : "Ver opções de entrega"}
                          <ArrowRight size={18} />
                        </>
                      )}
                    </button>
                  </fieldset>
                </form>
              </section>

              {shipping && (
                <section
                  className="commerce-card commerce-arrival"
                  ref={paymentSection}
                  aria-label="Entrega e pagamento"
                >
                  <div className="commerce-section-heading">
                    <span className="commerce-step">03</span>
                    <div>
                      <h2>
                        {shipping.local
                          ? "Pertinho de você"
                          : "Do ateliê para sua casa"}
                      </h2>
                      <p>
                        {shipping.local
                          ? "Sua entrega em Aracaju tem um cuidado especial."
                          : "Escolha a entrega que combina com seus planos."}
                      </p>
                    </div>
                    <Truck size={23} />
                  </div>
                  {shipping.local ? (
                    <div className="commerce-local-note">
                      <MapPin size={29} />
                      <div>
                        <h3>
                          {finalTotalCoupon
                            ? "Sua entrega faz parte do benefício do cupom."
                            : discountedSubtotal >= 15000
                              ? "A entrega em Aracaju é por nossa conta."
                              : "Vamos combinar a melhor entrega em Aracaju."}
                        </h3>
                        <p>
                          {finalTotalCoupon
                            ? "O valor final do pedido já considera a entrega. Combinamos os detalhes pelo WhatsApp."
                            : discountedSubtotal >= 15000
                              ? "Seu pedido alcançou R$ 150 em produtos e ganhou frete grátis. Combinamos o horário pelo WhatsApp."
                              : "Conversamos pelo WhatsApp para combinar a entrega, o valor do frete e o pagamento com você."}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <fieldset
                        className="commerce-shipping-options commerce-unfieldset"
                        disabled={submitting}
                      >
                        <legend className="commerce-sr-only">
                          Opções de entrega
                        </legend>
                        {shipping.options.map((option) => (
                          <label
                            key={option.id}
                            className={`commerce-option ${serviceId === option.id ? "is-selected" : ""}`}
                          >
                            <input
                              type="radio"
                              name="shipping"
                              checked={serviceId === option.id}
                              onChange={() => setServiceId(option.id)}
                            />
                            <div className="commerce-option-content">
                              <strong>
                                {option.company} <span>{option.name}</span>
                              </strong>
                              <span>
                                {option.min_days} a {option.max_days} dias úteis
                                estimados
                              </span>
                              {option.subsidy_cents > 0 &&
                                option.charged_cents > 0 && (
                                  <small>
                                    Você paga apenas a diferença desta
                                    modalidade.
                                  </small>
                                )}
                            </div>
                            <div className="commerce-option-price">
                              {option.charged_cents === 0 ? (
                                <strong className="commerce-free">
                                  Grátis
                                </strong>
                              ) : (
                                <strong>{money(option.charged_cents)}</strong>
                              )}
                              {option.subsidy_cents > 0 && (
                                <del>{money(option.price_cents)}</del>
                              )}
                            </div>
                          </label>
                        ))}
                        {!shipping.options.length && (
                          <p className="error-message">
                            Não encontramos entrega para este endereço. Confira
                            o CEP e consulte novamente.
                          </p>
                        )}
                      </fieldset>
                      <p className="small-note commerce-preparation">
                        <PackageCheck size={15} /> Postagem em até 24 horas
                        úteis. Os prazos de entrega exibidos já incluem essa
                        preparação e o transporte.
                      </p>
                      <div className="commerce-payment-heading">
                        <h3>Como prefere pagar?</h3>
                        <ShieldCheck size={18} />
                      </div>
                      <fieldset
                        className="commerce-unfieldset commerce-payment-options"
                        disabled={submitting}
                      >
                        <legend className="commerce-sr-only">
                          Forma de pagamento
                        </legend>
                        <label
                          className={`commerce-option ${payment === "pix" ? "is-selected" : ""}`}
                        >
                          <input
                            type="radio"
                            name="payment"
                            checked={payment === "pix"}
                            onChange={() => setPayment("pix")}
                          />
                          <QrCode size={24} />
                          <div className="commerce-option-content">
                            <strong>Pix</strong>
                            <span>QR Code ou código copia e cola.</span>
                            <small>Confirmação automática do pagamento.</small>
                          </div>
                          <span className="commerce-recommended">Prático</span>
                        </label>
                        <label
                          className={`commerce-option ${payment === "card" ? "is-selected" : ""}`}
                        >
                          <input
                            type="radio"
                            name="payment"
                            checked={payment === "card"}
                            onChange={() => setPayment("card")}
                          />
                          <CreditCard size={24} />
                          <div className="commerce-option-content">
                            <strong>Cartão pelo WhatsApp</strong>
                            <span>Conclua com a ajuda da Tia Cris.</span>
                            <small>
                              Pode haver uma pequena taxa da provedora. O valor
                              será informado antes do pagamento.
                            </small>
                          </div>
                        </label>
                      </fieldset>
                    </>
                  )}
                  {expired && (
                    <p className="error-message" role="alert">
                      Esta cotação expirou. Clique em atualizar opções de
                      entrega para conferir os valores novamente.
                    </p>
                  )}
                  <button
                    type="button"
                    className={`button ${shipping.local || payment === "card" ? "whatsapp" : "primary"} full-width commerce-submit`}
                    disabled={
                      submitting ||
                      loading ||
                      couponPending ||
                      (!!couponCode && !appliedCoupon) ||
                      expired ||
                      !quote ||
                      (!shipping.local && !selectedShipping)
                    }
                    onClick={placeOrder}
                  >
                    {submitting ? (
                      <>
                        <LoaderCircle size={18} className="commerce-spin" />{" "}
                        Preparando seu pedido...
                      </>
                    ) : shipping.local || payment === "card" ? (
                      <>
                        <MessageCircle size={18} /> Preparar pedido para o
                        WhatsApp
                      </>
                    ) : (
                      <>
                        Confirmar pedido e gerar Pix <ArrowRight size={18} />
                      </>
                    )}
                  </button>
                  <p className="small-note commerce-button-note">
                    {shipping.local || payment === "card"
                      ? "Na próxima tela, você revisa o pedido e abre a mensagem no WhatsApp."
                      : "Seu Pix será gerado com o total conferido. Você pode acompanhar o pedido a qualquer momento."}
                  </p>
                </section>
              )}
              {error && (
                <div className="error-message" role="alert">
                  {error}
                  {checkoutFailed && (
                    <p className="small-note" style={{ marginTop: 8 }}>
                      A confirmação pode ter chegado mesmo com a demora.{" "}
                      <Link href="/pedidos" className="commerce-text-link">
                        Confira Meus pedidos antes de começar outro pedido{" "}
                        <ArrowRight size={13} />
                      </Link>
                    </p>
                  )}
                </div>
              )}
            </div>
            <aside className="commerce-recap">
              <div className="commerce-recap-top">
                <span className="eyebrow">ESCOLHIDO COM CARINHO</span>
                <h2>
                  Seu pedido,
                  <br />
                  <em>quase pronto.</em>
                </h2>
                <span className="commerce-recap-symbol">
                  <ShoppingBag size={28} strokeWidth={1.4} />
                </span>
              </div>
              {!finalTotalCoupon && (
                <div className="commerce-free-shipping">
                  <div>
                    <Gift size={20} />
                    <strong>
                      {!quote
                        ? "Uma surpresa no caminho"
                        : remaining === 0
                          ? "Você conquistou frete grátis!"
                          : `Faltam ${money(remaining)} para o frete grátis`}
                    </strong>
                  </div>
                  <div
                    className="commerce-progress"
                    role="progressbar"
                    aria-label="Progresso para frete grátis"
                    aria-valuemin={0}
                    aria-valuemax={threshold / 100}
                    aria-valuenow={
                      Math.min(threshold, discountedSubtotal) / 100
                    }
                  >
                    <span
                      style={{
                        width: `${Math.min(100, (discountedSubtotal / threshold) * 100)}%`,
                      }}
                    />
                  </div>
                  <p>
                    {isLocal
                      ? "Em Aracaju, pedidos a partir de R$ 150 ganham entrega grátis."
                      : "Fora de Aracaju, a modalidade econômica é grátis a partir de R$ 300."}
                    {!address.city &&
                      " Em Aracaju, o benefício começa em R$ 150."}
                    {appliedCoupon &&
                      " A meta considera os produtos após o desconto do cupom."}
                  </p>
                </div>
              )}
              <form
                className="commerce-coupon"
                onSubmit={applyCoupon}
                noValidate
                aria-label="Aplicar cupom de desconto"
              >
                <label htmlFor="checkout-coupon">
                  <TicketPercent size={17} /> Tem um cupom?
                </label>
                <div className="commerce-coupon-entry">
                  <input
                    id="checkout-coupon"
                    name="coupon_code"
                    value={couponInput}
                    onChange={(event) => {
                      setCouponInput(event.target.value.toUpperCase());
                      setCouponError("");
                      setCouponNotice(
                        couponCode
                          ? "Clique em Aplicar para conferir o código informado."
                          : "",
                      );
                    }}
                    placeholder="Digite seu cupom"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    maxLength={32}
                    disabled={submitting || quoting || applyingCoupon}
                    aria-invalid={!!couponError}
                    aria-describedby="checkout-coupon-feedback"
                  />
                  <button
                    type="submit"
                    disabled={
                      submitting ||
                      quoting ||
                      couponPending ||
                      loading ||
                      !quote ||
                      !couponInput.trim()
                    }
                  >
                    {couponPending ? (
                      <LoaderCircle
                        size={16}
                        className="commerce-spin"
                        aria-label="Conferindo cupom"
                      />
                    ) : (
                      "Aplicar"
                    )}
                  </button>
                </div>
                <div id="checkout-coupon-feedback">
                  {couponPending && (
                    <p className="commerce-coupon-note" role="status">
                      Conferindo o cupom para os recursos escolhidos...
                    </p>
                  )}
                  {couponError && (
                    <p className="commerce-coupon-error" role="alert">
                      {couponError}
                    </p>
                  )}
                  {appliedCoupon && !couponPending && (
                    <div className="commerce-coupon-applied" role="status">
                      <span>
                        <Check size={15} />
                        <strong>{effectiveCoupon?.code}</strong> aplicado
                      </span>
                      <p>
                        {finalTotalCoupon
                          ? shipping
                            ? `Total final de ${money(payable)}, incluindo a entrega escolhida.`
                            : `Após escolher a entrega, o pedido terá total final de até ${money(effectiveCoupon!.amount)}, incluindo o frete.`
                          : `${money(couponDiscount)} de desconto nos seus produtos.`}
                      </p>
                    </div>
                  )}
                  {couponNotice && (
                    <p className="commerce-coupon-note" role="status">
                      {couponNotice}
                    </p>
                  )}
                </div>
                {couponCode && (
                  <button
                    className="commerce-coupon-remove"
                    type="button"
                    onClick={removeCoupon}
                    disabled={submitting || quoting}
                  >
                    <X size={13} /> Remover cupom
                  </button>
                )}
              </form>
              <div className="summary-line">
                <span>Produtos ({count})</span>
                <strong>{quote ? money(subtotal) : "Conferindo..."}</strong>
              </div>
              {appliedCoupon && (
                <div className="summary-line commerce-summary-discount">
                  <span>Desconto do cupom</span>
                  <strong>
                    {couponPending
                      ? "Conferindo..."
                      : `− ${money(couponDiscount)}`}
                  </strong>
                </div>
              )}
              <div className="summary-line">
                <span>Entrega</span>
                <strong>
                  {shipping?.local
                    ? finalTotalCoupon
                      ? "Incluída no cupom"
                      : discountedSubtotal >= 15000
                        ? "Grátis"
                        : "A combinar"
                    : selectedShipping
                      ? selectedShipping.charged_cents === 0
                        ? "Grátis"
                        : money(selectedShipping.charged_cents)
                      : "Informe seu endereço"}
                </strong>
              </div>
              <div className="summary-line total">
                <span>
                  {!shipping ||
                  (shipping.local &&
                    discountedSubtotal < 15000 &&
                    !finalTotalCoupon)
                    ? "Total dos produtos"
                    : "Total do pedido"}
                </span>
                <strong>
                  {couponPending
                    ? "Conferindo..."
                    : quote
                      ? money(payable)
                      : "..."}
                </strong>
              </div>
              {!shipping && (
                <p className="small-note">
                  {finalTotalCoupon
                    ? "A entrega será calculada e incluída no benefício do cupom na próxima etapa."
                    : "O valor da entrega aparece depois que você informa o endereço."}
                </p>
              )}
              {shipping?.local &&
                discountedSubtotal < 15000 &&
                !finalTotalCoupon && (
                  <p className="small-note">
                    O frete será combinado pelo WhatsApp e somado ao valor dos
                    produtos.
                  </p>
                )}
              {payment === "card" && !shipping?.local && shipping && (
                <p className="small-note">
                  Eventual taxa de cartão será informada no atendimento antes do
                  pagamento.
                </p>
              )}
              <div className="commerce-recap-footer">
                <ShieldCheck size={19} />
                <p>
                  Pedido protegido, atendimento de perto.
                  <br />
                  <Link href="/pedidos">
                    Acompanhe em Meus pedidos <ArrowRight size={12} />
                  </Link>
                </p>
              </div>
            </aside>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}

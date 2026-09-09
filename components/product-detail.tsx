"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Plus,
  Minus,
  ShoppingBag,
  HandHeart,
  MessageCircle,
  Play,
  ArrowRight,
} from "lucide-react";
import { Header, Footer } from "./header";
import { ProductCard } from "./storefront";
import { useShop } from "./shop-provider";
import { money, type Product } from "@/lib/types";
import { track } from "@/lib/client-events";
export function Quantity({
  value,
  onChange,
}: {
  value: number;
  onChange: (q: number) => void;
}) {
  return (
    <div className="quantity-control">
      <button
        type="button"
        aria-label="Diminuir quantidade"
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
      >
        <Minus size={15} />
      </button>
      <output aria-label="Quantidade">{value}</output>
      <button
        type="button"
        aria-label="Aumentar quantidade"
        disabled={value >= 99}
        onClick={() => onChange(value + 1)}
      >
        <Plus size={15} />
      </button>
    </div>
  );
}
export function ProductDetail({
  product,
  related,
}: {
  product: Product;
  related: Product[];
}) {
  const [selected, setSelected] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const { add } = useShop();
  const media = product.media[selected];
  useEffect(() => {
    const key = "view-" + product.id;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {}
    track("view", [product.id]);
  }, [product.id]);
  return (
    <>
      <Header />
      <main className="page-wrap">
        <div className="breadcrumbs">
          <Link href="/">Início</Link>
          <ChevronRight size={13} />
          <Link href="/#catalogo">Nossos recursos</Link>
          <ChevronRight size={13} />
          <span>{product.name}</span>
        </div>
        <div className="detail-grid">
          <div>
            <div className="gallery-main">
              {media?.type === "video" ? (
                <video
                  key={media.id}
                  src={media.url}
                  controls
                  playsInline
                  preload="metadata"
                />
              ) : media ? (
                <img
                  src={media.url}
                  alt={product.name}
                  width="700"
                  height="700"
                />
              ) : null}
            </div>
            {product.media.length > 1 && (
              <div className="gallery-thumbs" aria-label="Galeria do produto">
                {product.media.map((m, i) => (
                  <button
                    key={m.id}
                    className={i === selected ? "selected" : ""}
                    onClick={() => setSelected(i)}
                    aria-label={`Ver ${m.type === "video" ? "vídeo" : "foto"} ${i + 1}`}
                    aria-pressed={i === selected}
                  >
                    {m.type === "image" ? (
                      <img src={m.url} alt="" width="72" height="72" />
                    ) : (
                      <Play />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="detail-copy">
            <span className="eyebrow">{product.category}</span>
            <h1>{product.name}</h1>
            <p className="detail-description">{product.description}</p>
            <div className="detail-price">{money(product.price_cents)}</div>
            <p className="detail-price-note">
              Pagamento e entrega combinados com a Tia Cris.
            </p>
            <div className="purchase-row">
              <Quantity value={quantity} onChange={setQuantity} />
              <button
                className="button primary"
                disabled={!product.in_stock}
                onClick={() => add(product.id, quantity)}
              >
                <ShoppingBag size={18} />
                {product.in_stock
                  ? "Adicionar ao carrinho"
                  : "Indisponível no momento"}
              </button>
            </div>
            <Link href="/carrinho" className="continue-link">
              Ir para meu carrinho <ArrowRight size={16} />
            </Link>
            <div className="detail-meta">
              <span>
                <HandHeart size={18} />
                Feito à mão com carinho
              </span>
              <span>
                <MessageCircle size={18} />
                Atendimento pelo WhatsApp
              </span>
            </div>
            {product.skills.length > 0 && (
              <>
                <h3>O que vamos desenvolver?</h3>
                <ul className="skills-list">
                  {product.skills.map((skill) => (
                    <li key={skill}>{skill}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
        {related.length > 0 && (
          <section className="related">
            <h2>
              A descoberta <em>continua por aqui.</em>
            </h2>
            <div className="product-grid">
              {related.map((p, i) => (
                <ProductCard product={p} key={p.id} index={i} />
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}

"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Search,
  Sparkles,
  Heart,
  HandHeart,
  Package,
  MessageCircle,
  Plus,
  SlidersHorizontal,
  X,
  BookOpen,
  Brain,
  Shapes,
  Puzzle,
  Hand,
  MessageSquare,
  ChevronDown,
} from "lucide-react";
import { Header, Footer } from "./header";
import { useShop } from "./shop-provider";
import { ProductGallery } from "./product-gallery";
import { categories, money, type Product } from "@/lib/types";
const categoryNames = [
  "Alfabetização",
  "Números",
  "Cognição",
  "Coordenação",
  "Linguagem",
  "Cores e formas",
  "Jogos",
];
const categoryIcons = [
  BookOpen,
  Shapes,
  Brain,
  Hand,
  MessageSquare,
  Shapes,
  Puzzle,
];
export function ProductCard({
  product,
  index = 0,
}: {
  product: Product;
  index?: number;
}) {
  const { add } = useShop();
  return (
    <article
      className="product-card"
      style={
        {
          "--card-color": ["#f8e6bf", "#e4e8f7", "#e2efe8", "#f6e0df"][
            index % 4
          ],
        } as React.CSSProperties
      }
    >
      <ProductGallery
        key={product.id}
        media={product.media}
        name={product.name}
        href={"/produto/" + product.slug}
        badge={product.badge}
      />
      <div className="product-info">
        <span className="product-category">{product.category}</span>
        <Link href={"/produto/" + product.slug}>
          <h3>{product.name}</h3>
        </Link>
        <p>{product.description}</p>
        <div className="product-bottom">
          <div>
            <small>um mundo de descobertas por</small>
            <strong>{money(product.price_cents)}</strong>
          </div>
          <button
            className="add-button"
            onClick={() => add(product.id)}
            aria-label={"Adicionar " + product.name + " ao carrinho"}
          >
            <Plus size={21} />
          </button>
        </div>
      </div>
    </article>
  );
}
export function Storefront({
  products,
  demo,
  unavailable = false,
}: {
  products: Product[];
  demo: boolean;
  unavailable?: boolean;
}) {
  const [category, setCategory] = useState("Todos");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("featured");
  const [limit, setLimit] = useState(8);
  const filtered = useMemo(() => {
    let p = products.filter(
      (p) =>
        (category === "Todos" || p.category === category) &&
        p.name
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .includes(
            search
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase(),
          ),
    );
    if (sort === "price-asc") p.sort((a, b) => a.price_cents - b.price_cents);
    if (sort === "price-desc") p.sort((a, b) => b.price_cents - a.price_cents);
    if (sort === "name") p.sort((a, b) => a.name.localeCompare(b.name));
    return p;
  }, [products, category, search, sort]);
  return (
    <>
      <Header />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span /> APRENDER. BRINCAR. DESCOBRIR.
            </div>
            <h1>
              Pequenas brincadeiras,
              <br /> <em>grandes</em>
              <br />
              <span className="discovery">
                descobertas.
                <svg viewBox="0 0 470 16" aria-hidden="true">
                  <path d="M4 10 Q205 -4 465 7" />
                </svg>
              </span>
            </h1>
            <p>
              Recursos pedagógicos feitos à mão que transformam o aprender em um
              momento cheio de significado e diversão.
            </p>
            <a href="#catalogo" className="button primary">
              Encontre a próxima descoberta <ArrowRight size={19} />
            </a>
            <div className="hero-foot">
              <span className="little-star">✳</span>
              <span>
                Para mãos curiosas.
                <br />
                <b>E imaginações sem tamanho.</b>
              </span>
            </div>
          </div>
          <div className="hero-visual">
            <div className="hero-photo">
              <img
                src="/assets/img/hero-contando-batatas-1400.webp"
                alt="Livro Contando as Batatas com peças coloridas e atividades para aprender brincando"
                width="1400"
                height="1062"
                fetchPriority="high"
              />
              <div className="photo-caption">
                <span>UMA DESCOBERTA DE CADA VEZ</span>
                <Link href="/produto/contando-as-batatas">
                  Contando as Batatas <ArrowUpRight size={22} />
                </Link>
              </div>
            </div>
            <div className="round-stamp">
              <Heart size={27} />
              <span>
                feito à mão
                <br />
                <b>com muito carinho</b>
              </span>
            </div>
            <span className="hero-asterisk" aria-hidden="true">
              ✳
            </span>
            <div className="floating-note">
              <Sparkles size={23} />
              <span>
                Aqui, aprender
                <br />
                <b>tem gosto de brincar!</b>
              </span>
            </div>
            <span className="photo-index">01 / UM UNIVERSO PARA EXPLORAR</span>
          </div>
        </section>
        <div className="benefit-strip">
          <span>
            <HandHeart /> Feito à mão, com propósito
          </span>
          <i />
          <span>
            <Brain /> Cada recurso, uma habilidade
          </span>
          <i />
          <span>
            <MessageCircle /> Atendimento pertinho de você
          </span>
          <i />
          <span>
            <Package /> Carinho em cada detalhe
          </span>
        </div>
        <section id="catalogo" className="catalog-section">
          <div className="section-heading">
            <div>
              <div className="eyebrow">
                O PRÓXIMO “EU CONSEGUI!” COMEÇA AQUI
              </div>
              <h2>
                Um recurso. <em>Mil possibilidades.</em>
                <span className="heading-spark">✳</span>
              </h2>
            </div>
            <span className="section-note">
              Encontre o que faz os
              <br />
              olhinhos brilharem.
            </span>
          </div>
          <div className="category-filters">
            <button
              className={category === "Todos" ? "active" : ""}
              onClick={() => {
                setCategory("Todos");
                setLimit(8);
              }}
            >
              <Sparkles size={16} />
              Todos os recursos
            </button>
            {categories.map((c, i) => {
              const Icon = categoryIcons[i];
              return (
                <button
                  key={c}
                  className={category === c ? "active" : ""}
                  onClick={() => {
                    setCategory(c);
                    setLimit(8);
                  }}
                >
                  <Icon size={16} />
                  {categoryNames[i]}
                </button>
              );
            })}
          </div>
          <div className="catalog-toolbar">
            <span>
              <b>{filtered.length}</b> recursos para explorar
            </span>
            <div className="catalog-controls">
              <label className="search-field">
                <Search size={18} />
                <input
                  aria-label="Buscar recurso pelo nome"
                  placeholder="O que vamos descobrir hoje?"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setLimit(8);
                  }}
                />
                {search && (
                  <button
                    aria-label="Limpar busca"
                    onClick={() => setSearch("")}
                  >
                    <X size={15} />
                  </button>
                )}
              </label>
              <label className="sort-field">
                <SlidersHorizontal size={16} />
                <select
                  aria-label="Ordenar recursos"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="featured">Em destaque</option>
                  <option value="price-asc">Menor preço</option>
                  <option value="price-desc">Maior preço</option>
                  <option value="name">Nome A a Z</option>
                </select>
                <ChevronDown size={14} />
              </label>
            </div>
          </div>
          {unavailable ? (
            <div className="empty-state">
              <Package size={38} />
              <h3>Os recursos estão se preparando para aparecer.</h3>
              <p>
                Não foi possível carregar o catálogo. Tente novamente em
                instantes.
              </p>
              <button
                className="button primary"
                onClick={() => window.location.reload()}
              >
                Tentar novamente
              </button>
            </div>
          ) : filtered.length ? (
            <div className="product-grid">
              {filtered.slice(0, limit).map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Search size={38} />
              <h3>A próxima descoberta pode ter outro nome.</h3>
              <p>Experimente outra busca ou explore todos os recursos.</p>
              <button
                className="button secondary"
                onClick={() => {
                  setSearch("");
                  setCategory("Todos");
                }}
              >
                Ver todos os recursos
              </button>
            </div>
          )}
          {filtered.length > limit && (
            <div className="load-more">
              <button
                className="button secondary"
                onClick={() => setLimit((x) => x + 8)}
              >
                Mais recursos, mais descobertas <Plus size={18} />
              </button>
              <span>
                Você viu {Math.min(limit, filtered.length)} de {filtered.length}{" "}
                recursos
              </span>
            </div>
          )}
          {demo && (
            <p className="demo-note">
              Prévia local com os valores do catálogo original. Os pedidos da
              loja são combinados pelo WhatsApp.
            </p>
          )}
        </section>
        <section className="how-section" id="como-funciona">
          <div>
            <div className="eyebrow">DAQUI PARA AS SUAS MÃOS</div>
            <h2>
              Simples de escolher.
              <br />
              <em>Gostoso de receber.</em>
            </h2>
            <p>
              O pedido começa aqui e continua em uma boa conversa com a Tia
              Cris.
            </p>
          </div>
          <div className="how-steps">
            <div>
              <span>01</span>
              <div>
                <h3>Encontre seus favoritos</h3>
                <p>
                  Explore os recursos e coloque suas descobertas no carrinho.
                </p>
              </div>
            </div>
            <div>
              <span>02</span>
              <div>
                <h3>Conte onde a diversão vai chegar</h3>
                <p>
                  Informe o endereço para combinarmos as possibilidades de
                  entrega.
                </p>
              </div>
            </div>
            <div>
              <span>03</span>
              <div>
                <h3>Combine tudo pelo WhatsApp</h3>
                <p>
                  A Tia Cris confirma disponibilidade, pagamento e envio com
                  você.
                </p>
              </div>
            </div>
          </div>
        </section>
        <section id="sobre" className="about-section">
          <span className="about-spark">✳</span>
          <div className="eyebrow">PRAZER, ESSE É O NOSSO MUNDO</div>
          <h2>
            Tem carinho em cada recorte.
            <br />E uma intenção <em>em cada brincadeira.</em>
          </h2>
          <p>
            Por aqui, cada recurso é pensado para criar conexões entre o brincar
            e o aprender. Para a sala de aula, para o atendimento ou para aquele
            momento especial em família.
          </p>
          <a
            href="https://www.instagram.com/recursosdatiacris/"
            target="_blank"
            rel="noreferrer"
            className="button secondary"
          >
            Entre no mundo da Tia Cris <ArrowUpRight size={18} />
          </a>
        </section>
      </main>
      <Footer />
    </>
  );
}

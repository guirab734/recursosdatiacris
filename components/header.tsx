"use client";
import Link from "next/link";
import {
  ShoppingBag,
  Camera as Instagram,
  ArrowUpRight,
  Menu,
  X,
  Heart,
} from "lucide-react";
import { useState } from "react";
import { useShop } from "./shop-provider";
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Recursos da Tia Cris, início">
      <span className="brand-mark">
        <img src="/assets/img/logo-128.webp" width="52" height="52" alt="" />
      </span>
      <span>
        <small>RECURSOS DA</small>
        <strong>
          Tia Cris<span>✳</span>
        </strong>
      </span>
    </Link>
  );
}
export function Header() {
  const { count } = useShop();
  const [menu, setMenu] = useState(false);
  return (
    <>
      <div className="announcement">
        <span>
          <Heart size={13} /> Feito à mão, pensado para cada descoberta.
        </span>
        <a
          href="https://www.instagram.com/recursosdatiacris/"
          target="_blank"
          rel="noreferrer"
        >
          Conheça nosso ateliê <ArrowUpRight size={13} />
        </a>
      </div>
      <header className="header">
        <div className="header-inner">
          <Brand />
          <nav
            className={menu ? "nav open" : "nav"}
            aria-label="Navegação principal"
          >
            <Link href="/#catalogo" onClick={() => setMenu(false)}>
              Nossos recursos
            </Link>
            <Link href="/#como-funciona" onClick={() => setMenu(false)}>
              Como comprar
            </Link>
            <Link href="/#sobre" onClick={() => setMenu(false)}>
              O mundo da Tia Cris
            </Link>
          </nav>
          <div className="header-actions">
            <a
              className="instagram-link icon-button"
              aria-label="Instagram da Tia Cris"
              href="https://www.instagram.com/recursosdatiacris/"
              target="_blank"
              rel="noreferrer"
            >
              <Instagram size={20} />
            </a>
            <Link href="/carrinho" className="cart-button">
              <ShoppingBag size={19} />
              <span>Carrinho</span>
              <b>{count}</b>
            </Link>
            <button
              className="mobile-menu icon-button"
              aria-label={menu ? "Fechar menu" : "Abrir menu"}
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
export function Footer() {
  return (
    <footer className="footer">
      <div>
        <Brand />
        <p>
          Pequenos recursos.
          <br />
          Um mundo de possibilidades.
        </p>
      </div>
      <div>
        <span>FEITO COM CARINHO</span>
        <p>
          Para famílias, educadores
          <br />e profissionais que acreditam no brincar.
        </p>
      </div>
      <a
        href="https://www.instagram.com/recursosdatiacris/"
        target="_blank"
        rel="noreferrer"
      >
        <Instagram size={19} /> @recursosdatiacris <ArrowUpRight size={16} />
      </a>
      <div className="footer-bottom">
        © {new Date().getFullYear()} Recursos da Tia Cris{" "}
        <span>Aprender é uma linda descoberta.</span>
      </div>
    </footer>
  );
}

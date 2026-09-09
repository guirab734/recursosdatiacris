import Link from "next/link";
import { Header, Footer } from "@/components/header";
export default function NotFound() {
  return (
    <>
      <Header />
      <main className="empty-state">
        <span className="about-spark">✳</span>
        <h1 className="page-title">Essa descoberta mudou de lugar.</h1>
        <p>O recurso pode não estar mais disponível.</p>
        <Link className="button primary" href="/#catalogo">
          Voltar ao catálogo
        </Link>
      </main>
      <Footer />
    </>
  );
}

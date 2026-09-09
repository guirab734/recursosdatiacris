"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="empty-state">
      <h1 className="page-title">Uma pequena pausa por aqui.</h1>
      <p>Não foi possível carregar esta página. Tente novamente.</p>
      <button className="button primary" onClick={reset}>
        Tentar novamente
      </button>
    </main>
  );
}

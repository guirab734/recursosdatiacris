"use client";
import { useState } from "react";
import { LockKeyhole, ArrowRight, Eye, EyeOff, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Brand } from "./header";
export function LoginForm({ configured }: { configured: boolean }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      const r = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: form.get("password"),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      window.location.assign("/admin");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-art">
        <Brand />
        <div>
          <span className="login-star">✳</span>
          <div className="eyebrow">BASTIDORES DO NOSSO ATELIÊ</div>
          <h1>
            É aqui que
            <br />
            as descobertas
            <br />
            <em>ganham vida.</em>
          </h1>
          <p>
            Um cantinho para cuidar dos recursos
            <br />e acompanhar cada nova possibilidade.
          </p>
        </div>
        <span>RECURSOS DA TIA CRIS · FEITO COM CARINHO</span>
      </div>
      <div className="login-side">
        <Link className="login-back" href="/">
          <ArrowLeft size={16} />
          Voltar para a loja
        </Link>
        <div className="login-card">
          <div className="login-lock">
            <LockKeyhole size={24} />
          </div>
          <h2>Bem-vinda ao seu ateliê.</h2>
          <p>Digite sua senha para cuidar de tudo por aqui.</p>
          {!configured && (
            <div className="setup-note">
              <strong>O acesso ainda está sendo preparado.</strong>
              <p>
                Conclua a configuração da conta administrativa no servidor para
                liberar o acesso ao ateliê.
              </p>
            </div>
          )}
          <form onSubmit={submit} className="form-stack">
            <label className="field">
              Senha
              <div className="password-field">
                <input
                  type={visible ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  required
                  maxLength={200}
                  placeholder="Sua senha"
                />
                <button
                  type="button"
                  aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {error && (
              <div className="error-message" role="alert">
                {error}
              </div>
            )}
            <button
              className="button primary full-width"
              disabled={busy || !configured}
            >
              {busy ? "Entrando..." : "Entrar no meu ateliê"}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="login-foot">
            <LockKeyhole size={13} />
            Acesso exclusivo à administração da loja.
          </p>
        </div>
      </div>
    </main>
  );
}

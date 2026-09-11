"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Package,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Brand } from "./header";

type Features = { emailSignup: boolean; google: boolean; apple: boolean };
type Mode = "login" | "signup" | "link";

function ProviderMark({ provider }: { provider: "google" | "apple" }) {
  return provider === "google" ? (
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285f4"
        d="M21.8 12.2c0-.7-.1-1.4-.2-2.2H12v4.1h5.5a4.7 4.7 0 0 1-2 3.1v2.6h3.3c1.9-1.8 3-4.4 3-7.6Z"
      />
      <path
        fill="#34a853"
        d="M12 22c2.7 0 5-.9 6.8-2.5l-3.3-2.6c-.9.6-2.1 1-3.5 1-2.7 0-5-1.8-5.8-4.2H2.8v2.7A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#fbbc05"
        d="M6.2 13.7a6 6 0 0 1 0-3.4V7.6H2.8a10 10 0 0 0 0 8.8l3.4-2.7Z"
      />
      <path
        fill="#ea4335"
        d="M12 6.1c1.5 0 2.8.5 3.8 1.5l2.9-2.9A9.7 9.7 0 0 0 12 2a10 10 0 0 0-9.2 5.6l3.4 2.7C7 7.9 9.3 6.1 12 6.1Z"
      />
    </svg>
  ) : (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M17.1 12.7c0-2.2 1.8-3.3 1.9-3.4-1-1.5-2.6-1.7-3.1-1.7-1.3-.1-2.5.8-3.2.8-.7 0-1.8-.8-2.9-.8-1.5 0-2.9.9-3.7 2.2-1.6 2.8-.4 6.9 1.2 9.2.7 1.1 1.6 2.3 2.8 2.2 1.1 0 1.6-.7 3-.7 1.4 0 1.8.7 3 .7 1.2 0 2-1.1 2.8-2.2.8-1.2 1.1-2.4 1.1-2.5-.1 0-2.9-1.1-2.9-3.8ZM14.9 6.1c.6-.8 1.1-1.9 1-3-.9 0-2 .6-2.7 1.3-.6.7-1.2 1.8-1.1 2.9 1 .1 2.1-.5 2.8-1.2Z" />
    </svg>
  );
}

export function CustomerLogin({
  email,
  configured,
  features,
  next,
  linkError,
}: {
  email: string | null;
  configured: boolean;
  features: Features;
  next: string;
  linkError: boolean;
}) {
  const [mode, setMode] = useState<Mode>("login");
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState(
    linkError
      ? "Este link expirou ou já foi usado. Entre novamente ou solicite outro acesso por email."
      : "",
  );
  const [notice, setNotice] = useState("");

  function changeMode(value: Mode) {
    setMode(value);
    setError("");
    setNotice("");
    setVisible(false);
  }

  async function call(path: string, body?: Record<string, unknown>) {
    const response = await fetch(`/api/customer/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        result.error || "Não foi possível concluir. Tente novamente.",
      );
    return result;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const values = new FormData(event.currentTarget);
    try {
      const body: Record<string, unknown> = { email: values.get("email") };
      if (mode !== "link") body.password = values.get("password");
      if (mode === "signup") body.name = values.get("name");
      if (mode === "login") body.next = next;
      const data = await call(mode === "link" ? "email-link" : mode, body);
      if (mode === "login") {
        window.location.assign(data.redirectTo);
        return;
      }
      setNotice(data.message);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Confira os dados e tente novamente.",
      );
    }
    setBusy(false);
  }

  async function oauth(provider: "google" | "apple") {
    setBusy(true);
    setError("");
    try {
      const data = await call("oauth", { provider, next });
      window.location.assign(data.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Tente novamente.");
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    setError("");
    try {
      await call("logout");
      window.location.assign("/conta");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Tente novamente.");
      setBusy(false);
    }
  }

  return (
    <main className="customer-account">
      <div className="customer-account-nav">
        <Brand />
        <Link href="/" className="customer-store-back">
          <ArrowLeft size={16} /> Voltar para a loja
        </Link>
      </div>
      <div className="customer-account-layout">
        <section className="customer-account-intro">
          <span className="eyebrow">
            <Sparkles size={16} /> CADA DESCOBERTA TEM UMA HISTÓRIA
          </span>
          <h1>
            Seu próximo
            <br /> capítulo de
            <br /> <em>brincadeiras.</em>
          </h1>
          <p>
            Acompanhe o caminho dos seus recursos até chegarem às suas mãos.
          </p>
          <div className="customer-guest-note">
            <Package size={26} />
            <div>
              <strong>Comprar continua sendo simples.</strong>
              <p>
                Você pode acompanhar pedidos feitos neste navegador sem criar
                conta.
              </p>
              <Link href="/pedidos">
                Ver meus pedidos <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </section>
        <section
          className="customer-account-card"
          aria-labelledby="customer-account-title"
        >
          <span className="customer-account-icon">
            <UserRound size={23} />
          </span>
          <h2 id="customer-account-title">
            {email
              ? "Que bom ter você aqui."
              : mode === "signup"
                ? "Um cantinho só seu."
                : mode === "link"
                  ? "Seu acesso por email."
                  : "Vamos continuar?"}
          </h2>
          <p className="customer-account-subtitle">
            {email
              ? "Sua conta está pronta para acompanhar cada pedido."
              : mode === "signup"
                ? "Crie sua conta e confirme o email para acompanhar seus pedidos em outros dispositivos."
                : mode === "link"
                  ? "Receba um link para entrar na sua conta, sem precisar lembrar a senha."
                  : "Entre para encontrar seus pedidos e acompanhar a entrega."}
          </p>
          {email ? (
            <div className="customer-signed-in">
              <span>
                <Check size={17} /> Conectado como
              </span>
              <strong>{email}</strong>
              <Link href="/pedidos" className="button primary full-width">
                Meus pedidos <ArrowRight size={18} />
              </Link>
              <button
                type="button"
                className="customer-text-button"
                onClick={logout}
                disabled={busy}
              >
                {busy ? "Saindo..." : "Sair desta conta"}
              </button>
            </div>
          ) : (
            <>
              {(features.google || features.apple) && mode === "login" && (
                <>
                  <div className="customer-social-buttons">
                    {features.google && (
                      <button
                        type="button"
                        onClick={() => oauth("google")}
                        disabled={busy || !configured}
                      >
                        <ProviderMark provider="google" /> Continuar com Google
                      </button>
                    )}
                    {features.apple && (
                      <button
                        type="button"
                        className="customer-apple-button"
                        onClick={() => oauth("apple")}
                        disabled={busy || !configured}
                      >
                        <ProviderMark provider="apple" /> Continuar com Apple
                      </button>
                    )}
                  </div>
                  <div className="customer-auth-divider">
                    <span>ou use seu email</span>
                  </div>
                </>
              )}
              {!configured && (
                <p className="customer-auth-notice">
                  O acesso à conta está sendo preparado. Seus pedidos neste
                  navegador continuam disponíveis.
                </p>
              )}
              <form className="form-stack" onSubmit={submit}>
                {mode === "signup" && (
                  <label className="field">
                    Nome completo
                    <input
                      name="name"
                      autoComplete="name"
                      required
                      minLength={3}
                      maxLength={120}
                      placeholder="Como podemos chamar você?"
                    />
                  </label>
                )}
                <label className="field">
                  Email
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    autoCapitalize="none"
                    required
                    maxLength={254}
                    placeholder="voce@exemplo.com"
                  />
                </label>
                {mode !== "link" && (
                  <label className="field">
                    Senha
                    <div className="password-field">
                      <input
                        name="password"
                        type={visible ? "text" : "password"}
                        autoComplete={
                          mode === "signup"
                            ? "new-password"
                            : "current-password"
                        }
                        required
                        minLength={mode === "signup" ? 10 : 1}
                        maxLength={200}
                        placeholder={
                          mode === "signup"
                            ? "Pelo menos 10 caracteres"
                            : "Sua senha"
                        }
                      />
                      <button
                        type="button"
                        onClick={() => setVisible(!visible)}
                        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
                      >
                        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </label>
                )}
                {mode === "login" && features.emailSignup && (
                  <button
                    type="button"
                    className="customer-text-button customer-forgot"
                    onClick={() => changeMode("link")}
                    disabled={busy}
                  >
                    Esqueci minha senha
                  </button>
                )}
                {notice && (
                  <div className="customer-auth-notice" role="status">
                    <Mail size={18} />
                    <span>{notice}</span>
                  </div>
                )}
                {error && (
                  <div className="error-message" role="alert">
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  className="button primary full-width"
                  disabled={busy || !configured}
                >
                  {busy
                    ? "Só um instante..."
                    : mode === "signup"
                      ? "Criar minha conta"
                      : mode === "link"
                        ? "Receber link de acesso"
                        : "Entrar na minha conta"}
                  <ArrowRight size={18} />
                </button>
              </form>
              <div className="customer-auth-alternative">
                {mode === "login" ? (
                  features.emailSignup && (
                    <span>
                      Ainda não tem conta?{" "}
                      <button
                        type="button"
                        onClick={() => changeMode("signup")}
                        disabled={busy}
                      >
                        Criar uma conta
                      </button>
                    </span>
                  )
                ) : (
                  <button
                    type="button"
                    onClick={() => changeMode("login")}
                    disabled={busy}
                  >
                    <ArrowLeft size={14} /> Voltar para entrar
                  </button>
                )}
              </div>
            </>
          )}
          {email && error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}
          <p className="customer-account-privacy">
            <LockKeyhole size={13} /> Seus dados e pedidos ficam protegidos.
          </p>
        </section>
      </div>
    </main>
  );
}

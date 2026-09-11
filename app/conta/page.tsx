import type { Metadata } from "next";
import { CustomerLogin } from "@/components/customer-login";
import { authClient } from "@/lib/auth";
import { configured } from "@/lib/catalog";
import {
  customerAuthFeatures,
  safeCustomerNext,
} from "@/lib/customer-auth-config";
import "@/components/customer-auth.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Minha conta | Recursos da Tia Cris",
  robots: { index: false, follow: false },
};

export default async function CustomerAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const query = await searchParams;
  let email: string | null = null;
  if (configured()) {
    try {
      const client = await authClient();
      const { data, error } = await client.auth.getUser();
      if (!error && data.user?.email_confirmed_at)
        email = data.user.email || null;
    } catch {
      // Guest order access remains available while Auth is unavailable.
    }
  }
  return (
    <CustomerLogin
      email={email}
      configured={configured()}
      features={customerAuthFeatures()}
      next={safeCustomerNext(query.next)}
      linkError={query.error === "link-expirado"}
    />
  );
}

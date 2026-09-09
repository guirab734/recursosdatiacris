import { LoginForm } from "@/components/admin-login";
import { configured } from "@/lib/catalog";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <LoginForm configured={configured() && !!process.env.ADMIN_AUTH_EMAIL} />
  );
}

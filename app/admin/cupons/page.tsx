import { requireAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminCoupons } from "@/components/admin-coupons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cupons | Gestão da Tia Cris" };

export default async function AdminCouponsPage() {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    redirect("/admin/login");
  }
  return <AdminCoupons email={admin.user.email || "Administradora"} />;
}

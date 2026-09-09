import { requireAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
import { demoMode } from "@/lib/catalog";
export const dynamic = "force-dynamic";
export default async function Page() {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    redirect("/admin/login");
  }
  return (
    <>
      <AdminDashboard
        email={admin.user.email || "Administradora"}
        demo={demoMode()}
      />
    </>
  );
}

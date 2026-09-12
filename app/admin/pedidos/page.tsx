import { requireAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminOrders } from "@/components/admin-orders";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pedidos | Gestão da Tia Cris" };

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    redirect("/admin/login");
  }
  const { status } = await searchParams;
  return (
    <AdminOrders
      email={admin.user.email || "Administradora"}
      initialFilter={status}
    />
  );
}

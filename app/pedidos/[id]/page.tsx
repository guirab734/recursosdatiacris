import { CustomerOrderDetail } from "@/components/customer-orders";

export const metadata = {
  title: "Meu pedido | Recursos da Tia Cris",
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomerOrderDetail id={id} />;
}

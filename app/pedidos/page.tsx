import { CustomerOrders } from "@/components/customer-orders";

export const metadata = {
  title: "Meus pedidos | Recursos da Tia Cris",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <CustomerOrders />;
}

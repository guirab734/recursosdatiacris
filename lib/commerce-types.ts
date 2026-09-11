import type { Quote } from "./types";

export type CustomerAddress = {
  name: string;
  email: string;
  phone: string;
  document: string;
  postal_code: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
};
export type ShippingOption = {
  id: string;
  name: string;
  company: string;
  price_cents: number;
  charged_cents: number;
  subsidy_cents: number;
  min_days: number;
  max_days: number;
};
export type ShippingQuote = {
  quote_id: string;
  expires_at: string;
  local: boolean;
  subtotal_cents: number;
  free_shipping_threshold: number;
  options: ShippingOption[];
  preparation_min_days: number;
  preparation_max_days: number;
};
export type PaymentMethod = "pix" | "card" | "whatsapp";
export type PaymentStatus =
  | "pending"
  | "creating"
  | "paid"
  | "failed"
  | "expired"
  | "refunded"
  | "review";
export type FulfillmentStatus =
  | "awaiting_payment"
  | "local_contact"
  | "preparing"
  | "freight_pending"
  | "ready_to_post"
  | "posted"
  | "delivered"
  | "cancelled"
  | "attention";
export type TrackingEvent = {
  date: string;
  description: string;
  location?: string;
};
export type CustomerOrder = {
  id: string;
  number: number;
  created_at: string;
  updated_at: string;
  address: Omit<CustomerAddress, "document"> & { document?: string };
  items: Quote["items"];
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  local: boolean;
  shipping: ShippingOption | null;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  fulfillment_status: FulfillmentStatus;
  pix: {
    copy_paste: string;
    qr_code?: string;
    expires_at: string | null;
  } | null;
  tracking_code: string | null;
  tracking_url: string | null;
  tracking_events: TrackingEvent[];
  tracking_updated_at: string | null;
  whatsapp_url: string;
  order_url: string;
};
export type AdminOrder = CustomerOrder & {
  address: CustomerAddress;
  shipping_provider_id: string | null;
  label_url: string | null;
  last_error: string | null;
  notes: string;
  paid_at: string | null;
  posted_at: string | null;
  delivered_at: string | null;
  needs_review: boolean;
};
export const paymentLabels: Record<PaymentStatus, string> = {
  pending: "Aguardando pagamento",
  creating: "Preparando Pix",
  paid: "Pagamento confirmado",
  failed: "Pagamento não concluído",
  expired: "Pix expirado",
  refunded: "Pagamento devolvido",
  review: "Em conferência",
};
export const fulfillmentLabels: Record<FulfillmentStatus, string> = {
  awaiting_payment: "Aguardando pagamento",
  local_contact: "Entrega a combinar",
  preparing: "Em preparação",
  freight_pending: "Pagar frete no Melhor Envio",
  ready_to_post: "Pronto para postar",
  posted: "A caminho",
  delivered: "Entregue",
  cancelled: "Cancelado",
  attention: "Precisa de atenção",
};

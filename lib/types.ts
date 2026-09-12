export type Media = {
  id: string;
  type: "image" | "video";
  url: string;
  position: number;
  upload_receipt?: string;
};
export type Product = {
  id: string;
  slug: string;
  name: string;
  description: string;
  skills: string[];
  price_cents: number;
  sale_price_cents: number | null;
  category: string;
  badge: string | null;
  media: Media[];
  in_stock: boolean;
};
export type AdminProduct = Omit<Product, "in_stock"> & {
  active: boolean;
  created_at: string;
  updated_at: string;
};
export type CartItem = { product_id: string; quantity: number };
export type Quote = {
  items: {
    product_id: string;
    name: string;
    quantity: number;
    unit_price_cents: number;
    subtotal_cents: number;
  }[];
  total_cents: number;
  demo: boolean;
  whatsapp_url?: string;
  message?: string;
};
export const effectivePrice = (product: {
  price_cents: number;
  sale_price_cents?: number | null;
}) => product.sale_price_cents ?? product.price_cents;
export const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
export const categories = [
  "Alfabetização",
  "Números e contagem",
  "Estimulação cognitiva",
  "Coordenação motora",
  "Linguagem e associação",
  "Cores e percepção",
  "Jogos",
  "Sensoriais",
];

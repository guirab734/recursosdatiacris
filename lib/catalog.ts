import "server-only";
import { createClient } from "@supabase/supabase-js";
import seed from "./catalog-seed.json";
import type { Product, AdminProduct } from "./types";
export const configured = () =>
  !!(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
export const demoMode = () =>
  process.env.NODE_ENV === "development" && process.env.DEMO_MODE === "true";
export function db() {
  if (!configured())
    throw new Error("Configure o Supabase para acessar o banco de dados.");
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export function publicProduct(p: AdminProduct): Product {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    skills: p.skills,
    price_cents: p.price_cents,
    category: p.category,
    badge: p.badge,
    media: [...p.media].sort((a, b) => a.position - b.position),
    in_stock: p.stock > 0,
  };
}
export async function allProducts(
  includeInactive = false,
): Promise<AdminProduct[]> {
  if (demoMode()) return seed as AdminProduct[];
  let query = db()
    .from("products")
    .select("*, media:product_media(id,type,url,position)")
    .order("created_at", { ascending: false });
  if (!includeInactive) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) {
    console.error("catalog", error.code);
    throw new Error("Não foi possível carregar os recursos. Tente novamente.");
  }
  return data as AdminProduct[];
}
export async function catalog() {
  return (await allProducts()).map(publicProduct);
}

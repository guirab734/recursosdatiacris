import { catalog, demoMode } from "@/lib/catalog";
import { Storefront } from "@/components/storefront";
export const dynamic = "force-dynamic";
export default async function Home() {
  let products;
  try {
    products = await catalog();
  } catch {
    return <Storefront products={[]} demo={false} unavailable />;
  }
  return <Storefront products={products} demo={demoMode()} />;
}

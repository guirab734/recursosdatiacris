import { catalog, demoMode } from "@/lib/catalog";
import type { CatalogSection } from "@/lib/catalog-sections";
import { Storefront } from "./storefront";

export async function CatalogPage({ section }: { section: CatalogSection }) {
  let products;
  try {
    products = await catalog();
  } catch {
    return (
      <Storefront
        key={section.slug}
        products={[]}
        demo={false}
        unavailable
        section={section}
        catalogOnly
      />
    );
  }
  return (
    <Storefront
      key={section.slug}
      products={products}
      demo={demoMode()}
      section={section}
      catalogOnly
    />
  );
}

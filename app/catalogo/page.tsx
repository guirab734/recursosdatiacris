import type { Metadata } from "next";
import { CatalogPage } from "@/components/catalog-page";
import { catalogSections } from "@/lib/catalog-sections";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Catálogo | Recursos da Tia Cris",
  description: catalogSections[0].description,
  alternates: { canonical: "https://www.recursosdatiacris.com.br/catalogo" },
};

export default function Page() {
  return <CatalogPage section={catalogSections[0]} />;
}

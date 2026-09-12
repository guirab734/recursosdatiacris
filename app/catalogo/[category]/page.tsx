import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogPage } from "@/components/catalog-page";
import { catalogSection, catalogSectionPath } from "@/lib/catalog-sections";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ category: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const section = catalogSection((await params).category);
  if (!section || section.slug === "todos") notFound();
  const title = `${section.label} | Recursos da Tia Cris`;
  const url = `https://www.recursosdatiacris.com.br${catalogSectionPath(section)}`;
  return {
    title,
    description: section.description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: section.description,
      url,
      locale: "pt_BR",
      type: "website",
    },
  };
}

export default async function Page({ params }: Props) {
  const section = catalogSection((await params).category);
  if (!section || section.slug === "todos") notFound();
  return <CatalogPage section={section} />;
}

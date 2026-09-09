import { catalog } from "@/lib/catalog";
import { notFound } from "next/navigation";
import { ProductDetail } from "@/components/product-detail";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  try {
    const product = (await catalog()).find((p) => p.slug === slug);
    return {
      title: product
        ? `${product.name} | Recursos da Tia Cris`
        : "Recurso não encontrado",
      description: product?.description,
    };
  } catch {
    return { title: "Recursos da Tia Cris" };
  }
}
export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const products = await catalog();
  const product = products.find((p) => p.slug === slug);
  if (!product) notFound();
  return (
    <ProductDetail
      key={product.id}
      product={product}
      related={products
        .filter((p) => p.id !== product.id && p.category === product.category)
        .slice(0, 4)}
    />
  );
}

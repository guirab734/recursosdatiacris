import { effectivePrice, money } from "@/lib/types";

export function ProductPrice({
  product,
  variant = "card",
}: {
  product: { price_cents: number; sale_price_cents?: number | null };
  variant?: "card" | "detail" | "admin";
}) {
  const current = effectivePrice(product);
  const discount = current < product.price_cents;
  const percent = discount
    ? Math.floor(((product.price_cents - current) / product.price_cents) * 100)
    : 0;
  return (
    <div
      className={`product-price price-${variant}${discount ? " has-discount" : ""}`}
    >
      {discount && (
        <div className="price-history">
          <del>
            <span className="sr-only">Preço original: </span>
            {money(product.price_cents)}
          </del>
          {percent > 0 && (
            <span
              className="discount-percent"
              aria-label={`${percent}% de desconto`}
            >
              {percent}% OFF
            </span>
          )}
        </div>
      )}
      <strong>
        <span className="sr-only">
          {discount ? "Preço com desconto: " : "Preço: "}
        </span>
        {money(current)}
      </strong>
      {discount && variant === "detail" && (
        <span className="price-saving">
          Você economiza {money(product.price_cents - current)}.
        </span>
      )}
    </div>
  );
}

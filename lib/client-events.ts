export function track(
  kind: "view" | "cart_add" | "whatsapp",
  product_ids: string[],
) {
  if (!product_ids.length) return;
  void fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, product_ids, event_id: crypto.randomUUID() }),
    keepalive: true,
  }).catch(() => {});
}

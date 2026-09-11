const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFERENCE = /^CR-([0-9a-f]{12})$/i;

/** Stable public reference from the first 48 random bits of the order UUID. */
export function orderReference(id: string) {
  if (!UUID.test(id)) throw new Error("Identificador de pedido inválido.");
  return `CR-${id.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}

/** UUID bounds let Postgres use its primary-key index without a new column. */
export function orderReferenceRange(reference: string) {
  const match = REFERENCE.exec(reference.trim());
  if (!match) return null;
  const prefix = `${match[1].slice(0, 8)}-${match[1].slice(8)}`.toLowerCase();
  return {
    lower: `${prefix}-0000-0000-000000000000`,
    upper: `${prefix}-ffff-ffff-ffffffffffff`,
  };
}

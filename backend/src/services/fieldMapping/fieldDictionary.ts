import { ExtractedFields } from "../../types/fields";

/**
 * Maps each field to the label variants it might appear under in a real
 * document. Matching is case-insensitive and tolerant of punctuation
 * (handled by the callers, not here) — this list only needs the core
 * wording. Add more variants here as real-world documents surface them;
 * no code changes needed elsewhere.
 */
export const FIELD_ALIASES: Record<keyof ExtractedFields, string[]> = {
  invoiceNumber: ["invoice number", "invoice no", "invoice #"],
  poNumber: ["po number", "purchase order number", "po no", "p.o. number"],
  description: ["description", "item description", "product description", "goods description"],
  quantity: ["quantity", "qty"],
  unit: ["unit", "uom", "unit of measure"],
  unitPrice: ["unit price", "price per unit", "unit cost"],
  totalAmount: ["total amount", "total", "amount", "line total"],
  currency: ["currency"],
  subtotal: ["subtotal", "sub total", "sub-total"],
  tax: ["tax", "vat", "tax/vat", "vat amount"],
  grossWeight: ["gross weight", "g.w.", "gw"],
  netWeight: ["net weight", "n.w.", "nw"],
  hsCode: ["hs code", "hts code", "harmonized code", "h.s. code"],
  containerNumber: ["container number", "container no", "container #"],
  shippingTerms: ["incoterms", "shipping terms", "terms of delivery"],
  supplier: ["supplier", "seller", "shipper", "exporter"],
  customer: ["customer", "buyer", "consignee", "importer"],
  date: ["invoice date", "date", "issue date"],
};

/**
 * Finds which known field a raw label (e.g. a PDF line's left-hand side, or
 * an Excel header cell) refers to. Longer/more specific aliases are checked
 * first so e.g. "invoice date" doesn't fall through to the generic "date".
 */
export function findFieldKeyForLabel(rawLabel: string): keyof ExtractedFields | null {
  const normalized = rawLabel
    .toLowerCase()
    .replace(/[:*]/g, "")
    .trim();

  const entries = Object.entries(FIELD_ALIASES) as [keyof ExtractedFields, string[]][];
  const sorted = entries
    .flatMap(([key, aliases]) => aliases.map((alias) => ({ key, alias })))
    .sort((a, b) => b.alias.length - a.alias.length);

  for (const { key, alias } of sorted) {
    if (normalized === alias || normalized.endsWith(alias) || normalized.includes(alias)) {
      return key;
    }
  }
  return null;
}

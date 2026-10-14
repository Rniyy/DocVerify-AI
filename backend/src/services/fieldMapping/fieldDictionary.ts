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

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Built once: longer/more specific aliases first so e.g. "invoice date"
// wins over the generic "date".
const ALIAS_MATCHERS = (Object.entries(FIELD_ALIASES) as [keyof ExtractedFields, string[]][])
  .flatMap(([key, aliases]) =>
    aliases.map((alias) => ({
      key,
      alias,
      // Whole-word match: "VATIN" must not count as "vat", "Last update"
      // must not count as "date". (Stage 16 fix — this used to be a plain
      // substring test.)
      pattern: new RegExp(`(?<![a-z0-9])${escapeRegExp(alias)}(?![a-z0-9])`),
    }))
  )
  .sort((a, b) => b.alias.length - a.alias.length);

/**
 * Finds which known field a raw label (e.g. a PDF line's left-hand side, or
 * an Excel header cell) refers to. The alias must appear as a whole word or
 * phrase in the label.
 */
// Tax-registration labels ("VAT (TIN) K009", "VAT NO.", "VATTIN") carry an
// identifier, never an amount, but contain the word "vat". Real invoices
// printed "VAT (TIN) K009-902500680", which line-splitting turned into
// tax = 902500680.
const REGISTRATION_LABEL = /\btin\b|\bvat\s*\(?\s*tin\b|\bvattin\b|\bvat\s*(no|number|reg\w*)\b/;

export function findFieldKeyForLabel(rawLabel: string): keyof ExtractedFields | null {
  const normalized = rawLabel
    .toLowerCase()
    .replace(/[:*]/g, "")
    .trim();

  if (REGISTRATION_LABEL.test(normalized)) return null;

  for (const { key, alias, pattern } of ALIAS_MATCHERS) {
    if (normalized === alias || pattern.test(normalized)) {
      return key;
    }
  }
  return null;
}

import { ExtractedFields } from "../../types/fields";

const NUMERIC_FIELDS = new Set<keyof ExtractedFields>([
  "quantity",
  "unitPrice",
  "totalAmount",
  "subtotal",
  "tax",
  "grossWeight",
  "netWeight",
]);

export function parseNumber(raw: string): number | undefined {
  const cleaned = raw.replace(/[^0-9.\-]/g, "");
  if (!cleaned) return undefined;
  const value = parseFloat(cleaned);
  return Number.isNaN(value) ? undefined : value;
}

/** "500 CTN" -> { quantity: 500, unit: "CTN" } */
export function parseQuantityWithUnit(raw: string): { quantity?: number; unit?: string } {
  const match = raw.match(/([\d,]+(?:\.\d+)?)\s*([A-Za-z]+)?/);
  if (!match) return {};
  return {
    quantity: parseNumber(match[1]),
    unit: match[2]?.toUpperCase(),
  };
}

/** "USD 10,000.00" -> { amount: 10000, currency: "USD" } */
export function parseAmountWithCurrency(raw: string): { amount?: number; currency?: string } {
  const currencyMatch = raw.match(/\b([A-Z]{3})\b/);
  return {
    amount: parseNumber(raw),
    currency: currencyMatch ? currencyMatch[1] : undefined,
  };
}

/**
 * Parses a raw string value for the given field and assigns it onto
 * `fields`, applying the right parsing strategy per field type. Shared by
 * the text (PDF) and Excel mappers so both interpret values consistently.
 */
export function assignParsedValue(
  fields: ExtractedFields,
  key: keyof ExtractedFields,
  rawValue: string
): void {
  if (key === "quantity") {
    const parsed = parseQuantityWithUnit(rawValue);
    if (parsed.quantity !== undefined) fields.quantity = parsed.quantity;
    if (parsed.unit && !fields.unit) fields.unit = parsed.unit;
    return;
  }

  if (NUMERIC_FIELDS.has(key)) {
    const parsed = parseAmountWithCurrency(rawValue);
    if (parsed.amount !== undefined) {
      (fields[key] as number | undefined) = parsed.amount;
    }
    if (parsed.currency && !fields.currency) fields.currency = parsed.currency;
    return;
  }

  (fields[key] as string | undefined) = rawValue.trim();
}

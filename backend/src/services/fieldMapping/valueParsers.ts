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

/**
 * A value is only accepted for a numeric field if it looks like a number
 * with an optional currency symbol/code and unit suffix — "USD 10,000.00",
 * "$55.00", "4,046", "12.5 KG". This stops identifiers such as
 * "K009-902201072" (a VAT registration number) being squashed into a bogus
 * amount just because their label happened to contain "VAT".
 */
const NUMERIC_VALUE_PATTERN = /^(?:[A-Za-z]{3}\s+|[$€£¥៛]\s*)?-?\d[\d,]*(?:\.\d+)?\s*[^\d\s]{0,6}$/;

export function looksNumeric(raw: string): boolean {
  return NUMERIC_VALUE_PATTERN.test(raw.trim());
}

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

/** A date at the start of a value: 03-Sep-2026, 31.Aug.2026, 28/08/2026, 2026-08-28, Aug 28, 2026. */
const LEADING_DATE =
  /^(?:\d{1,2}[.\-/ ]?[A-Za-z]{3,9}[.\-/ ,]*\d{2,4}|\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}|[A-Za-z]{3,9}\.? \d{1,2},? \d{4})/;

/**
 * A date field must hold a date, not a table row that happens to contain the
 * word "DATE:" ("- MAWB 6185… DATE: 28-08-2026 1 $ 25.00 $ 25.00"). If figures
 * follow the date, the value is a row fragment, so it is refused. Values with
 * no recognisable leading date (Excel serials, ISO timestamps) are left alone.
 */
export function looksLikeDateValue(raw: string): boolean {
  const value = raw.trim();
  const lead = value.match(LEADING_DATE);
  if (lead) return !/\d/.test(value.slice(lead[0].length));
  return !/[$€£]/.test(value);
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
  if ((key === "quantity" || NUMERIC_FIELDS.has(key)) && !looksNumeric(rawValue)) {
    return; // not a number — leave the field unset rather than store a guess
  }

  if (key === "date" && !looksLikeDateValue(rawValue)) {
    return; // a row fragment, not a date — leave it for the layout reader or the user
  }

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

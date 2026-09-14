import { FieldComparisonResult, FieldStatus } from "../../types/comparison";

// Tolerate tiny floating point rounding (e.g. 9999.999999 vs 10000).
const NUMERIC_TOLERANCE = 0.01;

function valuesEqual(a: string | number | undefined, b: string | number | undefined): boolean {
  if (a === undefined || b === undefined) return false;
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) < NUMERIC_TOLERANCE;
  }
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function formatDifference(values: (string | number | undefined)[]): string | undefined {
  const numeric = values.filter((v): v is number => typeof v === "number");
  if (numeric.length < 2) return undefined;
  const diff = Math.max(...numeric) - Math.min(...numeric);
  return diff === 0 ? undefined : diff.toFixed(2).replace(/\.00$/, "");
}

/**
 * Compares one field's value across every document. Exact string/number
 * equality only — this is deliberately "normal programming logic", not AI,
 * per the project's architecture rule. AI-assisted semantic matching (e.g.
 * "Whole Star Anise" vs "Star Anise Whole") is added on top in Stage 11
 * without touching this function.
 */
export function compareFieldAcrossDocuments(
  fieldName: string,
  values: (string | number | undefined)[]
): FieldComparisonResult {
  const allPresent = values.every((v) => v !== undefined);
  const status: FieldStatus =
    allPresent && values.every((v) => valuesEqual(v, values[0])) ? "match" : "mismatch";

  return {
    field: fieldName,
    values,
    status,
    difference: status === "mismatch" ? formatDifference(values) : undefined,
  };
}

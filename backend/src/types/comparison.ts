import { CalculationIssue } from "./calculation";

export type FieldStatus = "match" | "mismatch" | "semantic-match";

export interface FieldComparisonResult {
  field: string;
  /** One value per document, in the same order documents were submitted. */
  values: (string | number | undefined)[];
  status: FieldStatus;
  /** Human-readable numeric difference, only set for numeric mismatches. */
  difference?: string;
  /**
   * Set when AI semantic comparison upgraded a "mismatch" to
   * "semantic-match" (Stage 11) — e.g. "Whole Star Anise" vs "Star Anise
   * Whole". Never set for genuine numeric mismatches.
   */
  aiExplanation?: string;
}

export interface LineItemComparisonResult {
  /** Position of this line item (0 = first product row in each document). */
  index: number;
  fields: FieldComparisonResult[];
}

export interface ComparisonSummary {
  documentsReviewed: number;
  fieldsChecked: number;
  matches: number;
  warnings: number;
  errors: number;
}

export interface ComparisonReport {
  summary: ComparisonSummary;
  documentFieldResults: FieldComparisonResult[];
  lineItemResults: LineItemComparisonResult[];
  calculationIssues: CalculationIssue[];
}

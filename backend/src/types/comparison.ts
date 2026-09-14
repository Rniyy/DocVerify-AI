export type FieldStatus = "match" | "mismatch";

export interface FieldComparisonResult {
  field: string;
  /** One value per document, in the same order documents were submitted. */
  values: (string | number | undefined)[];
  status: FieldStatus;
  /** Human-readable numeric difference, only set for numeric mismatches. */
  difference?: string;
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
}

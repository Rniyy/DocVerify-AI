export type CalculationScope = "lineItem" | "document";

export interface CalculationIssue {
  /** Index into the documents array submitted to /api/comparisons. */
  documentIndex: number;
  scope: CalculationScope;
  /** Set when scope is "lineItem" — which line item failed the check. */
  lineItemIndex?: number;
  rule: string;
  expected: number;
  actual: number;
  difference: number;
}

import { CalculationIssue } from "../../types/calculation";
import { ExtractedFields, StructuredDocument } from "../../types/fields";

const TOLERANCE = 0.01; // absorb float rounding, not genuine discrepancies

function roughlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < TOLERANCE;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** quantity × unit price should equal the line's total amount. */
function checkLineItemMath(item: ExtractedFields): { expected: number; actual: number } | null {
  if (item.quantity === undefined || item.unitPrice === undefined || item.totalAmount === undefined) {
    return null;
  }
  return { expected: item.quantity * item.unitPrice, actual: item.totalAmount };
}

/** subtotal + tax should equal the document's total amount. */
function checkDocumentMath(fields: ExtractedFields): { expected: number; actual: number } | null {
  if (fields.subtotal === undefined || fields.tax === undefined || fields.totalAmount === undefined) {
    return null;
  }
  return { expected: fields.subtotal + fields.tax, actual: fields.totalAmount };
}

/**
 * Sum of the line totals should equal the subtotal. Only meaningful when a
 * document really lists several products, so it's skipped for single-item
 * documents (where the "line item" may just mirror the document header) and
 * ignores summary rows that carry a total but no product information.
 */
function checkLineSumMath(doc: StructuredDocument): { expected: number; actual: number } | null {
  const { subtotal } = doc.documentFields;
  if (subtotal === undefined) return null;

  const productRows = doc.lineItems.filter(
    (item) => item.description !== undefined || item.quantity !== undefined
  );
  if (productRows.length < 2) return null;
  if (productRows.some((item) => item.totalAmount === undefined)) return null;

  const sum = productRows.reduce((acc, item) => acc + (item.totalAmount as number), 0);
  return { expected: sum, actual: subtotal };
}

/** Gross weight can never be lighter than net weight. */
function checkWeightLogic(fields: ExtractedFields): { expected: number; actual: number } | null {
  if (fields.grossWeight === undefined || fields.netWeight === undefined) return null;
  if (fields.grossWeight >= fields.netWeight - TOLERANCE) return null;
  // expected = the minimum plausible gross weight (the net weight)
  return { expected: fields.netWeight, actual: fields.grossWeight };
}

/**
 * Checks the arithmetic inside each document on its own — this never
 * compares one document against another (that's Stage 7's job). A
 * calculation error is a "warning" in the dashboard, distinct from a
 * cross-document "mismatch".
 */
export function validateCalculations(documents: StructuredDocument[]): CalculationIssue[] {
  const issues: CalculationIssue[] = [];

  documents.forEach((doc, documentIndex) => {
    doc.lineItems.forEach((item, lineItemIndex) => {
      const result = checkLineItemMath(item);
      if (result && !roughlyEqual(result.expected, result.actual)) {
        issues.push({
          documentIndex,
          scope: "lineItem",
          lineItemIndex,
          rule: "quantity × unit price = total amount",
          expected: round2(result.expected),
          actual: round2(result.actual),
          difference: round2(Math.abs(result.expected - result.actual)),
        });
      }
    });

    const documentResult = checkDocumentMath(doc.documentFields);
    if (documentResult && !roughlyEqual(documentResult.expected, documentResult.actual)) {
      issues.push({
        documentIndex,
        scope: "document",
        rule: "subtotal + tax = total amount",
        expected: round2(documentResult.expected),
        actual: round2(documentResult.actual),
        difference: round2(Math.abs(documentResult.expected - documentResult.actual)),
      });
    }

    const lineSum = checkLineSumMath(doc);
    if (lineSum && !roughlyEqual(lineSum.expected, lineSum.actual)) {
      issues.push({
        documentIndex,
        scope: "document",
        rule: "sum of line totals = subtotal",
        expected: round2(lineSum.expected),
        actual: round2(lineSum.actual),
        difference: round2(Math.abs(lineSum.expected - lineSum.actual)),
      });
    }

    const weights = checkWeightLogic(doc.documentFields);
    if (weights) {
      issues.push({
        documentIndex,
        scope: "document",
        rule: "gross weight ≥ net weight",
        expected: round2(weights.expected),
        actual: round2(weights.actual),
        difference: round2(Math.abs(weights.expected - weights.actual)),
      });
    }
  });

  return issues;
}

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
  });

  return issues;
}

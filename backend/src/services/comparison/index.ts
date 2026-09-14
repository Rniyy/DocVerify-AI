import { ComparisonReport, FieldComparisonResult, LineItemComparisonResult } from "../../types/comparison";
import { ExtractedFields, StructuredDocument } from "../../types/fields";
import { validateCalculations } from "../calculation/calculationValidator";
import { compareFieldAcrossDocuments } from "./exactComparator";

// Order controls how fields appear in the dashboard table.
const DOCUMENT_LEVEL_FIELD_ORDER: (keyof ExtractedFields)[] = [
  "invoiceNumber",
  "poNumber",
  "supplier",
  "customer",
  "date",
  "currency",
  "subtotal",
  "tax",
  "grossWeight",
  "netWeight",
  "containerNumber",
  "shippingTerms",
];

const LINE_ITEM_FIELD_ORDER: (keyof ExtractedFields)[] = [
  "description",
  "quantity",
  "unit",
  "unitPrice",
  "totalAmount",
  "hsCode",
];

function compareFieldSet(
  documents: StructuredDocument[],
  fieldOrder: (keyof ExtractedFields)[],
  getFields: (doc: StructuredDocument) => ExtractedFields
): FieldComparisonResult[] {
  return fieldOrder
    .map((field) => {
      const values = documents.map((doc) => getFields(doc)[field]);
      if (values.every((v) => v === undefined)) return null; // nobody has this field — nothing to compare
      return compareFieldAcrossDocuments(field, values);
    })
    .filter((result): result is FieldComparisonResult => result !== null);
}

export function compareDocuments(documents: StructuredDocument[]): ComparisonReport {
  const documentFieldResults = compareFieldSet(
    documents,
    DOCUMENT_LEVEL_FIELD_ORDER,
    (doc) => doc.documentFields
  );

  const maxLineItems = Math.max(0, ...documents.map((doc) => doc.lineItems.length));
  const lineItemResults: LineItemComparisonResult[] = [];

  for (let i = 0; i < maxLineItems; i++) {
    const fields = compareFieldSet(
      documents,
      LINE_ITEM_FIELD_ORDER,
      (doc) => doc.lineItems[i] ?? {}
    );
    lineItemResults.push({ index: i, fields });
  }

  const allResults = [...documentFieldResults, ...lineItemResults.flatMap((item) => item.fields)];
  const calculationIssues = validateCalculations(documents);

  const summary = {
    documentsReviewed: documents.length,
    fieldsChecked: allResults.length,
    matches: allResults.filter((r) => r.status === "match").length,
    warnings: calculationIssues.length,
    errors: allResults.filter((r) => r.status === "mismatch").length,
  };

  return { summary, documentFieldResults, lineItemResults, calculationIssues };
}

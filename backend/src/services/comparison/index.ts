import { CalculationIssue } from "../../types/calculation";
import { ComparisonReport, FieldComparisonResult, LineItemComparisonResult } from "../../types/comparison";
import { ExtractedFields, StructuredDocument } from "../../types/fields";
import { explainDiscrepancy, semanticCompare } from "../ai/pythonAiClient";
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

// Only free-text fields where a differently-worded-but-equivalent value is
// plausible. Never includes numeric fields — AI must not touch those.
const SEMANTIC_ELIGIBLE_FIELDS = new Set<string>(["description", "supplier", "customer"]);

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

/**
 * If a text field failed exact comparison, ask the AI whether the values
 * are actually the same thing worded differently. Only ever *upgrades* a
 * mismatch to "semantic-match" — never touches numeric fields, and a
 * failed/unavailable AI call just leaves the exact-match result as is.
 */
async function upgradeWithSemanticMatch(result: FieldComparisonResult): Promise<FieldComparisonResult> {
  if (result.status !== "mismatch" || !SEMANTIC_ELIGIBLE_FIELDS.has(result.field)) {
    return result;
  }

  const stringValues = result.values.filter((v): v is string => typeof v === "string");
  if (stringValues.length !== result.values.length || stringValues.length < 2) {
    return result; // some document is missing this field entirely — not a wording question
  }

  const aiResult = await semanticCompare(result.field, stringValues);
  if (aiResult?.match) {
    return { ...result, status: "semantic-match", aiExplanation: aiResult.explanation };
  }
  return result;
}

/** Fills in an AI-generated explanation for a field mismatch that's still a genuine mismatch. */
async function attachFieldExplanation(
  result: FieldComparisonResult,
  documentNames: string[]
): Promise<FieldComparisonResult> {
  if (result.status !== "mismatch") return result;

  const explanation = await explainDiscrepancy({
    field: result.field,
    documentNames,
    values: result.values,
    difference: result.difference,
    kind: "mismatch",
  });

  return explanation ? { ...result, aiExplanation: explanation } : result;
}

/** Same idea, for a calculation issue (quantity × price ≠ total, etc). */
async function attachCalculationExplanation(
  issue: CalculationIssue,
  documentNames: string[]
): Promise<CalculationIssue> {
  const docLabel = documentNames[issue.documentIndex] ?? `Document ${issue.documentIndex + 1}`;
  const scopeLabel =
    issue.scope === "lineItem" ? `line item ${(issue.lineItemIndex ?? 0) + 1}` : "document total";

  const explanation = await explainDiscrepancy({
    field: scopeLabel,
    documentNames: [docLabel],
    values: [issue.actual],
    difference: String(issue.difference),
    kind: "calculation",
    rule: issue.rule,
    expected: issue.expected,
    actual: issue.actual,
  });

  return explanation ? { ...issue, aiExplanation: explanation } : issue;
}

export async function compareDocuments(
  documents: StructuredDocument[],
  documentNames: string[] = documents.map((_, i) => `Document ${i + 1}`)
): Promise<ComparisonReport> {
  let documentFieldResults = compareFieldSet(
    documents,
    DOCUMENT_LEVEL_FIELD_ORDER,
    (doc) => doc.documentFields
  );

  const maxLineItems = Math.max(0, ...documents.map((doc) => doc.lineItems.length));
  let lineItemResults: LineItemComparisonResult[] = [];
  for (let i = 0; i < maxLineItems; i++) {
    const fields = compareFieldSet(documents, LINE_ITEM_FIELD_ORDER, (doc) => doc.lineItems[i] ?? {});
    lineItemResults.push({ index: i, fields });
  }

  // Stage 11a: let AI upgrade worded-differently text mismatches.
  documentFieldResults = await Promise.all(documentFieldResults.map(upgradeWithSemanticMatch));
  lineItemResults = await Promise.all(
    lineItemResults.map(async (item) => ({
      ...item,
      fields: await Promise.all(item.fields.map(upgradeWithSemanticMatch)),
    }))
  );

  const calculationIssues = await Promise.all(
    validateCalculations(documents).map((issue) => attachCalculationExplanation(issue, documentNames))
  );

  // Stage 11b: AI-generated explanations for whatever mismatches remain.
  documentFieldResults = await Promise.all(
    documentFieldResults.map((r) => attachFieldExplanation(r, documentNames))
  );
  lineItemResults = await Promise.all(
    lineItemResults.map(async (item) => ({
      ...item,
      fields: await Promise.all(item.fields.map((r) => attachFieldExplanation(r, documentNames))),
    }))
  );

  const allResults = [...documentFieldResults, ...lineItemResults.flatMap((item) => item.fields)];

  const summary = {
    documentsReviewed: documents.length,
    fieldsChecked: allResults.length,
    matches: allResults.filter((r) => r.status === "match" || r.status === "semantic-match").length,
    warnings: calculationIssues.length,
    errors: allResults.filter((r) => r.status === "mismatch").length,
  };

  return { summary, documentFieldResults, lineItemResults, calculationIssues };
}

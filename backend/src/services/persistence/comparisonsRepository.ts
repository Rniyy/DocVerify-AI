import { pool } from "../../config/db";
import { CalculationIssue } from "../../types/calculation";
import { ComparisonReport, ComparisonSummary, FieldComparisonResult } from "../../types/comparison";

export async function saveComparison(summary: ComparisonSummary, userId: number): Promise<number> {
  const [result] = await pool.execute(
    `INSERT INTO comparisons (documents_reviewed, fields_checked, matches, warnings, errors, user_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [summary.documentsReviewed, summary.fieldsChecked, summary.matches, summary.warnings, summary.errors, userId]
  );
  return (result as { insertId: number }).insertId;
}

export async function saveComparisonResults(comparisonId: number, report: ComparisonReport): Promise<void> {
  type Row = [
    number, // comparison_id
    string, // scope
    number | null, // line_item_index
    string, // field_name
    string, // status
    string | null, // values_json
    string | null, // difference
    string | null, // ai_explanation
    number | null, // document_index
    number | null, // expected_value
    number | null // actual_value
  ];

  const rows: Row[] = [];

  const pushFieldResult = (
    scope: "documentField" | "lineItem",
    lineItemIndex: number | null,
    result: FieldComparisonResult
  ) => {
    rows.push([
      comparisonId,
      scope,
      lineItemIndex,
      result.field,
      result.status,
      JSON.stringify(result.values),
      result.difference ?? null,
      result.aiExplanation ?? null,
      null,
      null,
      null,
    ]);
  };

  report.documentFieldResults.forEach((r) => pushFieldResult("documentField", null, r));
  report.lineItemResults.forEach((item) => item.fields.forEach((r) => pushFieldResult("lineItem", item.index, r)));

  const pushCalculationIssue = (issue: CalculationIssue) => {
    rows.push([
      comparisonId,
      "calculation",
      issue.lineItemIndex ?? null,
      issue.rule,
      "warning",
      null,
      String(issue.difference),
      issue.aiExplanation ?? null,
      issue.documentIndex,
      issue.expected,
      issue.actual,
    ]);
  };

  report.calculationIssues.forEach(pushCalculationIssue);

  if (rows.length === 0) return;

  const placeholders = rows.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
  const flatValues = rows.flat();

  await pool.execute(
    `INSERT INTO comparison_results
       (comparison_id, scope, line_item_index, field_name, status, values_json,
        difference, ai_explanation, document_index, expected_value, actual_value)
     VALUES ${placeholders}`,
    flatValues
  );
}

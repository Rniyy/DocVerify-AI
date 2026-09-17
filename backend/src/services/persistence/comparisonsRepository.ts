import { pool } from "../../config/db";
import { CalculationIssue } from "../../types/calculation";
import {
  ComparisonReport,
  ComparisonSummary,
  FieldComparisonResult,
  LineItemComparisonResult,
} from "../../types/comparison";
import { ComparisonDetail, ComparisonHistoryItem } from "../../types/history";

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

interface ComparisonListRow {
  id: number;
  created_at: string;
  documents_reviewed: number;
  fields_checked: number;
  matches: number;
  warnings: number;
  errors: number;
  document_names: string | null;
}

export async function listComparisonsForUser(userId: number): Promise<ComparisonHistoryItem[]> {
  const [rows] = await pool.execute(
    `SELECT c.id, c.created_at, c.documents_reviewed, c.fields_checked, c.matches, c.warnings, c.errors,
            GROUP_CONCAT(d.original_name ORDER BY d.id SEPARATOR '||') AS document_names
     FROM comparisons c
     LEFT JOIN documents d ON d.comparison_id = c.id
     WHERE c.user_id = ?
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
    [userId]
  );

  return (rows as ComparisonListRow[]).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    documentNames: row.document_names ? row.document_names.split("||") : [],
    documentsReviewed: row.documents_reviewed,
    fieldsChecked: row.fields_checked,
    matches: row.matches,
    warnings: row.warnings,
    errors: row.errors,
  }));
}

interface ComparisonResultRow {
  scope: "documentField" | "lineItem" | "calculation";
  line_item_index: number | null;
  field_name: string;
  status: "match" | "mismatch" | "semantic-match" | "warning";
  // mysql2 auto-parses JSON columns into JS values already — this is
  // whatever came back, not necessarily a string. See normalizeValuesJson.
  values_json: unknown;
  difference: string | null;
  ai_explanation: string | null;
  document_index: number | null;
  expected_value: string | null;
  actual_value: string | null;
}

/**
 * mysql2 returns JSON columns already parsed into JS values, but we guard
 * for the string case too (e.g. a different driver config, or the column
 * read via a raw query) so this never accidentally double-parses or
 * silently mis-serializes an array via a stray .toString().
 */
function normalizeValuesJson(raw: unknown): (string | number | undefined)[] {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Reconstructs a full ComparisonReport from its saved rows, scoped to its owner. */
export async function getComparisonDetail(comparisonId: number, userId: number): Promise<ComparisonDetail | null> {
  const [comparisonRows] = await pool.execute(
    `SELECT id, created_at, documents_reviewed, fields_checked, matches, warnings, errors
     FROM comparisons WHERE id = ? AND user_id = ?`,
    [comparisonId, userId]
  );
  const comparisonRow = (
    comparisonRows as {
      id: number;
      created_at: string;
      documents_reviewed: number;
      fields_checked: number;
      matches: number;
      warnings: number;
      errors: number;
    }[]
  )[0];
  if (!comparisonRow) return null;

  const [docRows] = await pool.execute(
    "SELECT original_name FROM documents WHERE comparison_id = ? ORDER BY id",
    [comparisonId]
  );
  const documentNames = (docRows as { original_name: string }[]).map((r) => r.original_name);

  const [resultRows] = await pool.execute(
    `SELECT scope, line_item_index, field_name, status, values_json, difference,
            ai_explanation, document_index, expected_value, actual_value
     FROM comparison_results WHERE comparison_id = ? ORDER BY id`,
    [comparisonId]
  );

  const documentFieldResults: FieldComparisonResult[] = [];
  const lineItemMap = new Map<number, FieldComparisonResult[]>();
  const calculationIssues: CalculationIssue[] = [];

  for (const row of resultRows as ComparisonResultRow[]) {
    if (row.scope === "calculation") {
      calculationIssues.push({
        documentIndex: row.document_index ?? 0,
        scope: row.line_item_index !== null ? "lineItem" : "document",
        lineItemIndex: row.line_item_index ?? undefined,
        rule: row.field_name,
        expected: Number(row.expected_value),
        actual: Number(row.actual_value),
        difference: Number(row.difference),
        aiExplanation: row.ai_explanation ?? undefined,
      });
      continue;
    }

    const fieldResult: FieldComparisonResult = {
      field: row.field_name,
      values: normalizeValuesJson(row.values_json),
      status: row.status as FieldComparisonResult["status"],
      difference: row.difference ?? undefined,
      aiExplanation: row.ai_explanation ?? undefined,
    };

    if (row.scope === "documentField") {
      documentFieldResults.push(fieldResult);
    } else {
      const idx = row.line_item_index ?? 0;
      const existing = lineItemMap.get(idx) ?? [];
      existing.push(fieldResult);
      lineItemMap.set(idx, existing);
    }
  }

  const lineItemResults: LineItemComparisonResult[] = [...lineItemMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, fields]) => ({ index, fields }));

  const summary: ComparisonSummary = {
    documentsReviewed: comparisonRow.documents_reviewed,
    fieldsChecked: comparisonRow.fields_checked,
    matches: comparisonRow.matches,
    warnings: comparisonRow.warnings,
    errors: comparisonRow.errors,
  };

  return {
    id: comparisonRow.id,
    createdAt: comparisonRow.created_at,
    documentNames,
    report: { summary, documentFieldResults, lineItemResults, calculationIssues },
  };
}

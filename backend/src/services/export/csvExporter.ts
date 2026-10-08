import { ComparisonReport } from "../../types/comparison";

type Cell = string | number | undefined | null;

/**
 * Cells that start with these characters are interpreted as formulas by
 * Excel/Sheets. Values in this app come from uploaded (untrusted) documents,
 * so text cells are prefixed with an apostrophe to keep them inert.
 * Numbers are written as-is, so negative amounts stay numeric.
 */
const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;

function escapeCell(cell: Cell): string {
  if (cell === undefined || cell === null) return "";
  let text = typeof cell === "number" ? String(cell) : cell;
  if (typeof cell === "string" && FORMULA_TRIGGERS.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toLine(cells: Cell[]): string {
  return cells.map(escapeCell).join(",");
}

/**
 * Flattens a comparison report into one CSV table:
 * Section | Line Item | Field / Rule | Status | Document | <one column per document> | Difference | Expected | Actual | Explanation
 *
 * Starts with a UTF-8 BOM so Excel opens non-ASCII document names correctly.
 */
export function reportToCsv(report: ComparisonReport, documentNames: string[]): string {
  const docCount = Math.max(documentNames.length, report.summary.documentsReviewed);
  const docColumns = Array.from({ length: docCount }, (_, i) => documentNames[i] ?? `Document ${i + 1}`);

  const header = [
    "Section",
    "Line Item",
    "Field / Rule",
    "Status",
    "Document",
    ...docColumns,
    "Difference",
    "Expected",
    "Actual",
    "Explanation",
  ];

  const padValues = (values: (string | number | undefined)[]): Cell[] =>
    Array.from({ length: docCount }, (_, i) => values[i]);

  const lines: string[] = [toLine(header)];

  for (const r of report.documentFieldResults) {
    lines.push(
      toLine(["Document field", "", r.field, r.status, "", ...padValues(r.values), r.difference, "", "", r.aiExplanation])
    );
  }

  for (const item of report.lineItemResults) {
    for (const r of item.fields) {
      lines.push(
        toLine([
          "Line item",
          item.index + 1,
          r.field,
          r.status,
          "",
          ...padValues(r.values),
          r.difference,
          "",
          "",
          r.aiExplanation,
        ])
      );
    }
  }

  for (const issue of report.calculationIssues) {
    lines.push(
      toLine([
        "Calculation check",
        issue.scope === "lineItem" ? (issue.lineItemIndex ?? 0) + 1 : "",
        issue.rule,
        "warning",
        docColumns[issue.documentIndex] ?? `Document ${issue.documentIndex + 1}`,
        ...padValues([]),
        issue.difference,
        issue.expected,
        issue.actual,
        issue.aiExplanation,
      ])
    );
  }

  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

import { describe, expect, it } from "vitest";
import { reportToCsv } from "../services/export/csvExporter";
import { ComparisonReport } from "../types/comparison";

const baseReport: ComparisonReport = {
  summary: { documentsReviewed: 2, fieldsChecked: 2, matches: 1, warnings: 1, errors: 1 },
  documentFieldResults: [
    { field: "invoiceNumber", values: ["INV-1", "INV-1"], status: "match" },
    { field: "totalAmount", values: [100, 90], status: "mismatch", difference: "10", aiExplanation: "Totals differ, please verify." },
  ],
  lineItemResults: [{ index: 0, fields: [{ field: "quantity", values: [5, 5], status: "match" }] }],
  calculationIssues: [
    { documentIndex: 1, scope: "document", rule: "subtotal + tax = total amount", expected: 110, actual: 90, difference: 20 },
  ],
};

const lines = (csv: string) => csv.replace(/^\uFEFF/, "").trim().split("\r\n");

describe("reportToCsv", () => {
  it("starts with a BOM and a header with one column per document", () => {
    const csv = reportToCsv(baseReport, ["invoice.pdf", "packing.xlsx"]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(lines(csv)[0]).toBe(
      "Section,Line Item,Field / Rule,Status,Document,invoice.pdf,packing.xlsx,Difference,Expected,Actual,Explanation"
    );
  });

  it("writes document fields, line items and calculation checks", () => {
    const rows = lines(reportToCsv(baseReport, ["a.pdf", "b.pdf"]));
    expect(rows).toHaveLength(5);
    expect(rows[1]).toBe("Document field,,invoiceNumber,match,,INV-1,INV-1,,,,");
    expect(rows[2]).toBe('Document field,,totalAmount,mismatch,,100,90,10,,,"Totals differ, please verify."');
    expect(rows[3]).toBe("Line item,1,quantity,match,,5,5,,,,");
    expect(rows[4]).toBe("Calculation check,,subtotal + tax = total amount,warning,b.pdf,,,20,110,90,");
  });

  it("quotes cells containing commas, quotes and newlines", () => {
    const report: ComparisonReport = {
      ...baseReport,
      documentFieldResults: [{ field: "supplier", values: ['ACME, "Best" Co', "Line1\nLine2"], status: "mismatch" }],
      lineItemResults: [],
      calculationIssues: [],
    };
    const csv = reportToCsv(report, ["a", "b"]);
    expect(csv).toContain('"ACME, ""Best"" Co"');
    expect(csv).toContain('"Line1\nLine2"');
  });

  it("neutralises spreadsheet formulas in text but leaves negative numbers alone", () => {
    const report: ComparisonReport = {
      ...baseReport,
      documentFieldResults: [{ field: "supplier", values: ["=HYPERLINK(\"http://evil\")", "-cmd"], status: "mismatch" }],
      lineItemResults: [{ index: 0, fields: [{ field: "quantity", values: [-5, -5], status: "match" }] }],
      calculationIssues: [],
    };
    const csv = reportToCsv(report, ["a", "b"]);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'-cmd");
    expect(csv).toContain("quantity,match,,-5,-5");
  });

  it("labels the missing-row finding in plain words and leaves absent documents blank", () => {
    const report: ComparisonReport = {
      ...baseReport,
      documentFieldResults: [],
      calculationIssues: [],
      lineItemResults: [{ index: 6, fields: [{ field: "lineItem", values: [undefined, "Chargable weight 396"], status: "mismatch" }] }],
    };
    expect(lines(reportToCsv(report, ["a.pdf", "b.pdf"]))[1]).toBe("Line item,7,Row present in,mismatch,,,Chargable weight 396,,,,");
  });

  it("falls back to generic document names", () => {
    expect(lines(reportToCsv(baseReport, []))[0]).toContain("Document 1,Document 2");
  });
});

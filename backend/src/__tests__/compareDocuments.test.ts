import { afterEach, describe, expect, it, vi } from "vitest";
import { explainDiscrepancy } from "../services/ai/pythonAiClient";
import { compareDocuments, MISSING_ROW_FIELD } from "../services/comparison";
import { StructuredDocument } from "../types/fields";

// No Python/AI service in unit tests: every AI call fails soft, exactly as
// it does in production when the service or API key is unavailable.
vi.mock("../services/ai/pythonAiClient", () => ({
  semanticCompare: vi.fn().mockResolvedValue(null),
  explainDiscrepancy: vi.fn().mockResolvedValue(null),
}));

afterEach(() => vi.clearAllMocks());

const invoice: StructuredDocument = {
  documentFields: { invoiceNumber: "INV-1", subtotal: 300, tax: 0, totalAmount: 300 },
  lineItems: [
    { description: "Star Anise", quantity: 10, unitPrice: 10, totalAmount: 100 },
    { description: "Cloves", quantity: 10, unitPrice: 20, totalAmount: 200 },
  ],
};

describe("compareDocuments", () => {
  it("does not raise mismatches when the second document lists the same products in another order", async () => {
    const packingList: StructuredDocument = {
      documentFields: { invoiceNumber: "INV-1", subtotal: 300, tax: 0, totalAmount: 300 },
      lineItems: [...invoice.lineItems].reverse(),
    };
    const report = await compareDocuments([invoice, packingList], ["invoice.pdf", "packing.xlsx"]);
    expect(report.summary.errors).toBe(0);
    expect(report.lineItemResults).toHaveLength(2);
    expect(report.lineItemResults[0].fields.find((f) => f.field === "description")?.values).toEqual([
      "Star Anise",
      "Star Anise",
    ]);
  });

  it("still catches a real quantity difference on an aligned row", async () => {
    const other: StructuredDocument = {
      ...invoice,
      lineItems: [
        { description: "Cloves", quantity: 8, unitPrice: 20, totalAmount: 160 },
        { description: "Star Anise", quantity: 10, unitPrice: 10, totalAmount: 100 },
      ],
    };
    const report = await compareDocuments([invoice, other]);
    const clovesRow = report.lineItemResults[1];
    const quantity = clovesRow.fields.find((f) => f.field === "quantity");
    expect(quantity).toMatchObject({ status: "mismatch", values: [10, 8], difference: "2" });
  });

  it("compares the grand total across documents", async () => {
    const other: StructuredDocument = { ...invoice, documentFields: { ...invoice.documentFields, totalAmount: 310 } };
    const report = await compareDocuments([invoice, other]);
    const total = report.documentFieldResults.find((f) => f.field === "totalAmount");
    expect(total).toMatchObject({ status: "mismatch", difference: "10" });
  });

  it("reports a product present in only one document as ONE finding, not one per field", async () => {
    const other: StructuredDocument = { ...invoice, lineItems: [invoice.lineItems[0]] };
    const report = await compareDocuments([invoice, other]);
    expect(report.lineItemResults).toHaveLength(2);

    const missingRow = report.lineItemResults[1];
    expect(missingRow.fields).toEqual([
      { field: MISSING_ROW_FIELD, values: ["Cloves", undefined], status: "mismatch" },
    ]);
    // 1 error for the whole missing row; the fully matching first row adds none.
    expect(report.summary.errors).toBe(1);
  });

  it("many missing rows stay one error each (INV-0312 style: 18 rows vs 1)", async () => {
    const many: StructuredDocument = {
      documentFields: {},
      lineItems: Array.from({ length: 18 }, (_, i) => ({ description: `Charge ${i}`, quantity: 1, unitPrice: 25, totalAmount: 25 })),
    };
    const one: StructuredDocument = { documentFields: {}, lineItems: [many.lineItems[0]] };
    const report = await compareDocuments([one, many]);
    expect(report.lineItemResults).toHaveLength(18);
    expect(report.summary.errors).toBe(17);
  });

  it("with three documents, a row missing from one is flagged once and still compared among the two that have it", async () => {
    const withRow = (quantity: number): StructuredDocument => ({
      documentFields: {},
      lineItems: [{ description: "Star Anise", quantity, unitPrice: 10, totalAmount: quantity * 10 }],
    });
    const without: StructuredDocument = { documentFields: {}, lineItems: [] };

    const report = await compareDocuments([withRow(10), without, withRow(8)]);
    const fields = report.lineItemResults[0].fields;

    expect(fields[0]).toMatchObject({ field: MISSING_ROW_FIELD, values: ["Star Anise", undefined, "Star Anise"] });
    // the quantity difference between documents 1 and 3 is still caught...
    expect(fields.find((f) => f.field === "quantity")).toMatchObject({ status: "mismatch", values: [10, undefined, 8], difference: "2" });
    // ...and the absent document is not blamed for matching fields
    expect(fields.find((f) => f.field === "unit")).toBeUndefined();
    expect(fields.find((f) => f.field === "description")).toMatchObject({ status: "match" });
  });

  it("does not ask the AI to explain the missing-row finding", async () => {
    const other: StructuredDocument = { ...invoice, lineItems: [invoice.lineItems[0]] };
    await compareDocuments([invoice, other]);
    const asked = vi.mocked(explainDiscrepancy).mock.calls.map((c) => c[0].field);
    expect(asked).not.toContain(MISSING_ROW_FIELD);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { compareDocuments } from "../services/comparison";
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

  it("reports products present in only one document", async () => {
    const other: StructuredDocument = { ...invoice, lineItems: [invoice.lineItems[0]] };
    const report = await compareDocuments([invoice, other]);
    expect(report.lineItemResults).toHaveLength(2);
    const missing = report.lineItemResults[1].fields.find((f) => f.field === "description");
    expect(missing).toMatchObject({ status: "mismatch", values: ["Cloves", undefined] });
  });
});

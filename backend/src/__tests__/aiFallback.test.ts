import { beforeEach, describe, expect, it, vi } from "vitest";
import { StructuredDocument } from "../types/fields";
import { ExtractionResult } from "../types/extraction";

const extractFieldsWithAi = vi.fn();
vi.mock("../services/ai/pythonAiClient", () => ({
  extractFieldsWithAi: (...args: unknown[]) => extractFieldsWithAi(...args),
}));

import {
  enrichWithAi,
  extractionWarning,
  groundCandidate,
  isSparse,
  mergeStructured,
} from "../services/fieldMapping/aiFallback";

const SOURCE = `INV-0310 TAX INVOICE
S2 Global Logistics Co., Ltd.   Date: 28.Aug.2026
Customs clearance export (weekly)   1   50.00   50.00
Subtotal 50.00   VAT 10%: 5.00   GRAND TOTAL USD: 55.00`;

const pdf = (text: string): ExtractionResult => ({ type: "pdf", pageCount: 1, text });

beforeEach(() => extractFieldsWithAi.mockReset());

describe("groundCandidate", () => {
  it("keeps values that appear in the text and drops invented or computed ones", () => {
    const grounded = groundCandidate(
      {
        documentFields: {
          invoiceNumber: "INV-0310",
          supplier: "S2 Global Logistics Co., Ltd.",
          date: "2026-08-28", // reformatted — not printed that way
          subtotal: 50,
          tax: 5,
          totalAmount: 55,
          grossWeight: 1200, // invented
        },
        lineItems: [{ description: "Customs clearance export (weekly)", quantity: 1, unitPrice: 50, totalAmount: 50 }],
      },
      SOURCE
    );

    expect(grounded.documentFields).toEqual({
      invoiceNumber: "INV-0310",
      supplier: "S2 Global Logistics Co., Ltd.",
      subtotal: 50,
      tax: 5,
      totalAmount: 55,
    });
    expect(grounded.lineItems).toEqual([
      { description: "Customs clearance export (weekly)", quantity: 1, unitPrice: 50, totalAmount: 50 },
    ]);
  });

  it("ignores whitespace and case differences when checking text", () => {
    const grounded = groundCandidate({ documentFields: { supplier: "s2 global   logistics co., ltd." } }, SOURCE);
    expect(grounded.documentFields.supplier).toBe("s2 global   logistics co., ltd.");
  });

  it("drops wrongly typed values (numbers as strings, strings as numbers)", () => {
    const grounded = groundCandidate({ documentFields: { totalAmount: "55.00", invoiceNumber: 310 } }, SOURCE);
    expect(grounded.documentFields).toEqual({});
  });

  it("drops negative numbers and unknown keys", () => {
    const grounded = groundCandidate({ documentFields: { tax: -5, favouriteColour: "blue" } }, SOURCE);
    expect(grounded.documentFields).toEqual({});
  });

  it.each([null, undefined, "text", 42, [], { lineItems: "nope" }])("survives a malformed candidate: %j", (candidate) => {
    expect(groundCandidate(candidate, SOURCE)).toEqual({ documentFields: {}, lineItems: [] });
  });

  it("discards line items that end up empty", () => {
    const grounded = groundCandidate({ lineItems: [{ description: "Not in the document" }] }, SOURCE);
    expect(grounded.lineItems).toEqual([]);
  });
});

describe("mergeStructured", () => {
  const ai: StructuredDocument = {
    documentFields: { invoiceNumber: "AI-VALUE", supplier: "ACME" },
    lineItems: [{ description: "A" }, { description: "B" }],
  };

  it("lets rule-based values win and fills the gaps from AI", () => {
    const merged = mergeStructured({ documentFields: { invoiceNumber: "RULE-VALUE" }, lineItems: [] }, ai);
    expect(merged.documentFields).toEqual({ invoiceNumber: "RULE-VALUE", supplier: "ACME" });
  });

  it("prefers AI line items over the single mirrored row, but not over a real rule-based table", () => {
    expect(mergeStructured({ documentFields: {}, lineItems: [{ description: "mirror" }] }, ai).lineItems).toHaveLength(2);
    const realTable = { documentFields: {}, lineItems: [{ description: "x" }, { description: "y" }, { description: "z" }] };
    expect(mergeStructured(realTable, ai).lineItems).toHaveLength(3);
  });

  it("works when rule-based extraction produced nothing at all", () => {
    expect(mergeStructured(null, ai).documentFields.supplier).toBe("ACME");
  });
});

describe("isSparse", () => {
  it("flags missing documents, few fields, and missing line items", () => {
    expect(isSparse(null)).toBe(true);
    expect(isSparse({ documentFields: { tax: 1 }, lineItems: [{}] })).toBe(true);
    expect(isSparse({ documentFields: { tax: 1, date: "d", supplier: "s" }, lineItems: [] })).toBe(true);
    expect(isSparse({ documentFields: { tax: 1, date: "d", supplier: "s" }, lineItems: [{ description: "x" }] })).toBe(false);
  });
});

describe("enrichWithAi", () => {
  const sparse: StructuredDocument = { documentFields: {}, lineItems: [] };

  it("does not call the AI when rule-based extraction looks complete", async () => {
    const complete: StructuredDocument = {
      documentFields: { invoiceNumber: "1", supplier: "s", date: "d" },
      lineItems: [{ description: "x" }],
    };
    const result = await enrichWithAi(pdf(SOURCE), complete);
    expect(extractFieldsWithAi).not.toHaveBeenCalled();
    expect(result).toEqual({ document: complete, method: "rules" });
  });

  it("does not call the AI for Excel files or near-empty text", async () => {
    await enrichWithAi({ type: "excel", sheets: [] }, sparse);
    await enrichWithAi(pdf("   "), sparse);
    expect(extractFieldsWithAi).not.toHaveBeenCalled();
  });

  it("falls back to the rule-based result when the AI is unavailable", async () => {
    extractFieldsWithAi.mockResolvedValue(null);
    expect(await enrichWithAi(pdf(SOURCE), sparse)).toEqual({ document: sparse, method: "rules" });
  });

  it("falls back when nothing the AI said can be verified", async () => {
    extractFieldsWithAi.mockResolvedValue({ documentFields: { totalAmount: 9999 }, lineItems: [] });
    expect(await enrichWithAi(pdf(SOURCE), sparse)).toEqual({ document: sparse, method: "rules" });
  });

  it("returns verified AI values and tags the method", async () => {
    extractFieldsWithAi.mockResolvedValue({
      documentFields: { invoiceNumber: "INV-0310", totalAmount: 55, grossWeight: 1200 },
      lineItems: [{ description: "Customs clearance export (weekly)", quantity: 1, unitPrice: 50, totalAmount: 50 }],
    });
    const { document, method } = await enrichWithAi(pdf(SOURCE), sparse);
    expect(method).toBe("rules+ai");
    expect(document?.documentFields).toEqual({ invoiceNumber: "INV-0310", totalAmount: 55 });
    expect(document?.lineItems).toHaveLength(1);
  });
});

describe("extractionWarning", () => {
  it("warns when very little could be read", () => {
    expect(extractionWarning({ documentFields: {}, lineItems: [] }, "rules")).toMatch(/Only 0 fields/);
    expect(extractionWarning({ documentFields: { tax: 1 }, lineItems: [] }, "rules")).toMatch(/Only 1 field /);
  });

  it("asks for a double-check on AI-assisted documents", () => {
    const doc: StructuredDocument = { documentFields: { tax: 1, date: "d", supplier: "s" }, lineItems: [] };
    expect(extractionWarning(doc, "rules+ai")).toMatch(/double-check/);
    expect(extractionWarning(doc, "rules")).toBeNull();
  });

  it("tells the user a scanned document was read with OCR, even when enough fields were found", () => {
    const doc = {
      documentFields: { invoiceNumber: "1", date: "2026", supplier: "A", customer: "B", totalAmount: 5 },
      lineItems: [],
    };
    expect(extractionWarning(doc, "rules", { ocr: true, ocrConfidence: 90 })).toMatch(/scanned document, read with OCR/);
    expect(extractionWarning(doc, "rules", { ocr: true, ocrConfidence: 90 })).not.toMatch(/quality is low/);
  });

  it("adds a quality note for low-confidence scans and mentions unread pages", () => {
    const doc = { documentFields: {}, lineItems: [] };
    const message = extractionWarning(doc, "rules", { ocr: true, ocrConfidence: 55, ocrSkippedPages: [4, 5] });
    expect(message).toMatch(/2 later pages were not read/);
    expect(message).toMatch(/quality is low/);
    expect(message).toMatch(/Only 0 fields/);
  });

  it("does not mention OCR for a normal PDF", () => {
    const doc = { documentFields: { a: 1 }, lineItems: [] } as never;
    expect(extractionWarning(doc, "rules", { ocr: false })).not.toMatch(/OCR/);
  });

  it("points out scanned rows that don't add up, without changing any value", () => {
    const doc = {
      documentFields: { invoiceNumber: "1", date: "d", supplier: "A", customer: "B", subtotal: 50 },
      lineItems: [
        { quantity: 1, unitPrice: 15, totalAmount: 15 },
        { quantity: 1, unitPrice: 35, totalAmount: 35.6 },
      ],
    };
    const message = extractionWarning(doc, "rules", { ocr: true, ocrConfidence: 90 });
    expect(message).toMatch(/1 row read from the scan doesn't add up/);
    expect(message).toMatch(/rows read add up to 50\.60 but the subtotal reads 50\.00/);
    expect(doc.lineItems[1].totalAmount).toBe(35.6);
  });

  it("adds no arithmetic notes for a scan whose numbers are consistent, or for a normal PDF", () => {
    const consistent = {
      documentFields: { invoiceNumber: "1", date: "d", supplier: "A", customer: "B", subtotal: 50 },
      lineItems: [{ quantity: 2, unitPrice: 25, totalAmount: 50 }],
    };
    expect(extractionWarning(consistent, "rules", { ocr: true, ocrConfidence: 90 })).not.toMatch(/add up/);
    const broken = { ...consistent, lineItems: [{ quantity: 1, unitPrice: 25, totalAmount: 60 }] };
    // A text PDF's arithmetic problems belong to the calculation checks, not this caution.
    expect(extractionWarning(broken, "rules")).toBeNull();
  });
});

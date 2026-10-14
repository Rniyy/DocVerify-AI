import { describe, expect, it, vi } from "vitest";
import { LayoutLine } from "../types/extraction";
import { mapLayoutLines, parseItemRow } from "../services/fieldMapping/layoutFieldMapper";
import { mapExtractionToFields } from "../services/fieldMapping";
import { validateCalculations } from "../services/calculation/calculationValidator";

/**
 * Builds a layout line. Words get synthetic left positions; `x1` (when given)
 * is the right edge of the LAST word — i.e. where an amount column would end.
 */
const L = (y: number, text: string, x1?: number): LayoutLine => {
  const tokens = text.split(" ");
  return {
    page: 1,
    y,
    text,
    words: tokens.map((t, i) => ({
      text: t,
      x0: i * 10,
      x1: i === tokens.length - 1 && x1 !== undefined ? x1 : i * 10 + 8,
    })),
  };
};

/** Lines (y and amount-column edge) exactly as the layout extractor produced them for the real INV-0310. */
const inv0310 = (): LayoutLine[] => [
  L(282.2, "Nº Description Qty Unit Price Amount"),
  L(316.3, "1 OT Clearance MAWB NO.: 61857542752 DATE: 23-08-2026 1 $ 50.00 $ 50.00", 592.8),
  L(526.2, "Note: All payment must be made by CHEQUE, TT or Deposit directly to: សរុប/​TOTAL: $ 50.00", 592.2),
  L(537.5, "Bank Name: Canadia Bank PLC អតប: VAT 10%:"),
  L(540.7, "$ 5.00", 592.2),
  L(547.5, "Account Name: S2 Global Logistics Co.,Ltd."),
  L(554.1, "តម្លៃ​សរុបជាដុល្លៃ រ:"),
  L(559.3, "Account No: 0060000503048 $ 55.00", 592.2),
  L(569.8, "Swift Code:CADIKHPP GRAND TOTAL USD:"),
  L(585.3, "តម្លៃ​សរុបជាររៀល:"),
  L(590.4, "*If discrepancy, kindly contact our Accounting Department within 3 days from the date of 222,530"),
  L(601.1, "this invoice, otherwise all charges are deemed to be correct. GRAND TOTAL RIEL:"),
];

/** Real INV-0255: its row has a number split by a PDF text gap ("$ 3 15.00" is $315.00). */
const inv0255 = (): LayoutLine[] => [
  L(266.3, "Nº Description Qty Unit Price Amount"),
  L(280.4, "1 5 $ 3 15.00 $ 1,575.00", 584.6),
  L(538.0, "Note: All payment must be made by CHEQUE, TT or Deposit directly to: សរុប/​TOTAL: $ 1,575.00", 583.9),
  L(548.3, "Bank Name: Canadia Bank PLC អតប: VAT 10%: $ 157.50", 583.9),
  L(561.8, "តម្លៃ​សរុបជាដុល្លៃ រ:"),
  L(568.6, "Account No: 0060000503048 $ 1,732.50", 583.9),
  L(578.0, "Swift Code:CADIKHPP GRAND TOTAL USD:"),
  L(599.1, "*If discrepancy, kindly contact our Accounting Department within 3 days from the date of 7,001,033"),
  L(609.0, "this invoice, otherwise all charges are deemed to be correct. GRAND TOTAL RIEL:"),
];

describe("parseItemRow", () => {
  it("reads a row with $ signs and an in-row description", () => {
    expect(parseItemRow("1 OT Clearance MAWB NO.: 61857542752 DATE: 23-08-2026 1 $ 50.00 $ 50.00")).toEqual({
      description: "OT Clearance MAWB NO.: 61857542752 DATE: 23-08-2026",
      quantity: 1,
      unitPrice: 50,
      totalAmount: 50,
    });
  });

  it("reads decimal quantities, thousands separators and no $ signs", () => {
    expect(parseItemRow("2 Star Anise Whole 12.5 1,200.00 15,000.00")).toEqual({
      description: "Star Anise Whole",
      quantity: 12.5,
      unitPrice: 1200,
      totalAmount: 15000,
    });
  });

  it("does not drop a row whose arithmetic is wrong", () => {
    expect(parseItemRow("1 Widget 1 $ 50.00 $ 60.00")).toMatchObject({ quantity: 1, unitPrice: 50, totalAmount: 60 });
  });

  it("refuses a row whose price was split by a gap in the PDF text, rather than reading qty 3 × $15", () => {
    expect(parseItemRow("1 5 $ 3 15.00 $ 1,575.00")).toBeNull();
  });

  it.each([
    "Bank Name: Canadia Bank PLC",
    "Account No: 0060000503048",
    "222,530",
    "28.Aug.2026",
    "Nº Description Qty Unit Price Amount",
    "1 Only a description and one amount 50.00",
  ])("ignores a line that isn't a table row: %j", (text) => {
    expect(parseItemRow(text)).toBeNull();
  });
});

describe("mapLayoutLines on real invoice layouts", () => {
  it("INV-0310: pairs labels with the amount column even when an amount shares a line with an account number", () => {
    const { documentFields, lineItems } = mapLayoutLines(inv0310());
    expect(documentFields).toEqual({ subtotal: 50, tax: 5, totalAmount: 55, currency: "USD" });
    expect(lineItems).toHaveLength(1);
  });

  it("INV-0255: reads the totals, and no row (its row can't be read reliably)", () => {
    const { documentFields, lineItems } = mapLayoutLines(inv0255());
    expect(documentFields).toEqual({ subtotal: 1575, tax: 157.5, totalAmount: 1732.5, currency: "USD" });
    expect(lineItems).toEqual([]);
  });

  it("ignores the riel restatement and an account number that isn't in the amount column", () => {
    const { documentFields } = mapLayoutLines(inv0310());
    expect(Object.values(documentFields)).not.toContain(222530);
    expect(Object.values(documentFields)).not.toContain(60000503048);
  });

  it("guesses nothing from the column when labels and amounts don't agree in number", () => {
    // 3 labels (TOTAL, VAT, GRAND TOTAL) but 4 amounts in the column: pairing by order would be a guess.
    const lines = [
      L(100, "TOTAL: $ 50.00", 500),
      L(110, "VAT 10%:"),
      L(120, "$ 5.00", 500),
      L(130, "$ 9.00", 500),
      L(140, "GRAND TOTAL USD:"),
      L(150, "$ 55.00", 500),
    ];
    const { documentFields } = mapLayoutLines(lines);
    expect(documentFields.tax).toBeUndefined();
    expect(documentFields.totalAmount).toBeUndefined();
    expect(documentFields.subtotal).toBe(50); // the amount printed on TOTAL's own line is still trusted
  });

  it("INV-0610 style: labels without colons, 'VAT10%', amounts printed slightly ABOVE their labels, riel line ignored", () => {
    const lines = [
      L(513.1, "$ 118.00", 560.7),
      L(521.6, "Sub Total"),
      L(541.9, "$ 11.80", 560.7),
      L(548.1, "Bank Name : Canadia Bank PLC VAT10%"),
      L(570.5, "$ 129.80", 560.7),
      L(574.6, "Account No : 0066955998888 Grand Total"),
      L(635.3, "date of this invoice, otherwise all charge are deemed to be correct. GRAND TOTAL IN RIEL"),
      L(631.2, "R 525,301"),
    ];
    expect(mapLayoutLines(lines).documentFields).toEqual({ subtotal: 118, tax: 11.8, totalAmount: 129.8 });
  });

  it("INV-0610 real lines: amounts split by a PDF gap ($ 1 1.80 = $11.80) are NOT read as 1.80", () => {
    const lines = [
      L(263.3, "1 ឈសវាថល រាទំនិញ​CFS HANDLING FEE 1 $ 17.00 $ 17.00", 561.2),
      L(513.1, "$ 118.00", 560.7),
      L(521.6, "Sub Total"),
      L(541.9, "$ 1 1.80", 560.7),
      L(548.1, "Bank Name : Canadia Bank PLC VAT10%"),
      L(570.5, "$ 1 29.80", 560.7),
      L(574.6, "Account No : 0066955998888 Grand Total"),
    ];
    const { documentFields } = mapLayoutLines(lines);
    expect(documentFields).toEqual({});
    expect(Object.values(documentFields)).not.toContain(1.8);
    expect(Object.values(documentFields)).not.toContain(29.8);
  });

  it("reads nothing from a form that has 'Total ...' labels but no grand total (customs declaration)", () => {
    const lines = [
      L(100, "$ 12.00", 400), L(104, "Total fees : 15,000.00 in Riels", 405.6),
      L(120, "Total: Total Declaration : 15,000.00 in Riels", 405.6),
      L(140, "Total Item No. 2 : Total Item No. 3 :"), L(150, "$ 5.00", 400), L(160, "$ 6.00", 400),
    ];
    expect(mapLayoutLines(lines).documentFields).toEqual({});
  });

  it("falls back to same-line values when there is no amount column", () => {
    const { documentFields } = mapLayoutLines([L(10, "SUBTOTAL $ 100.00"), L(20, "VAT 10%: $ 10.00"), L(30, "GRAND TOTAL USD: $ 110.00")]);
    expect(documentFields).toMatchObject({ subtotal: 100, tax: 10, totalAmount: 110, currency: "USD" });
  });

  it("returns nothing for a page with no table or totals", () => {
    expect(mapLayoutLines([L(10, "Hello"), L(20, "World")])).toEqual({ documentFields: {}, lineItems: [] });
  });
});

describe("mapExtractionToFields with layout lines", () => {
  it("replaces the single mirrored row with real table rows and adds totals (INV-0310)", () => {
    const doc = mapExtractionToFields({ type: "pdf", pageCount: 1, text: "VATIN: Exchange Rate 4,046", lines: inv0310() });
    expect(doc?.documentFields).toMatchObject({ subtotal: 50, tax: 5, totalAmount: 55, currency: "USD" });
    expect(doc?.lineItems).toEqual([expect.objectContaining({ quantity: 1, unitPrice: 50, totalAmount: 50 })]);
  });

  it("still reports an invoice whose totals really don't add up", () => {
    const lines = [
      L(100, "1 Widget 1 $ 50.00 $ 50.00", 500),
      L(300, "TOTAL: $ 50.00", 500),
      L(310, "VAT 10%: $ 5.00", 500),
      L(320, "GRAND TOTAL USD: $ 56.00", 500),
    ];
    const doc = mapExtractionToFields({ type: "pdf", pageCount: 1, text: "x", lines });
    const issues = validateCalculations([doc!]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ rule: "subtotal + tax = total amount", expected: 55, actual: 56 });
  });

  it("does not copy a layout-derived grand total into a fake line item", () => {
    const doc = mapExtractionToFields({ type: "pdf", pageCount: 1, text: "nothing useful here", lines: inv0255() });
    expect(doc?.documentFields.totalAmount).toBe(1732.5);
    expect(doc?.lineItems).toEqual([]);
  });

  it("keeps the previous behaviour when no layout lines are present", () => {
    const doc = mapExtractionToFields({ type: "pdf", pageCount: 1, text: "Invoice Number: INV-1\nSupplier: ACME" });
    expect(doc?.documentFields).toEqual({ invoiceNumber: "INV-1", supplier: "ACME" });
  });

  it("lets explicit 'Label: value' text beat a layout-derived value", () => {
    const doc = mapExtractionToFields({ type: "pdf", pageCount: 1, text: "Total Amount: 99.00", lines: inv0310() });
    expect(doc?.documentFields.totalAmount).toBe(99);
  });
});

describe("extractDocument PDF fallback", () => {
  it("uses the layout result when the Python service provides one, else plain pdf-parse", async () => {
    vi.resetModules();
    const layout = vi.fn();
    const plain = vi.fn().mockResolvedValue({ type: "pdf", pageCount: 1, text: "plain" });
    vi.doMock("../services/extraction/pythonServiceClient", () => ({
      extractPdfLayoutViaPython: layout,
      extractViaPythonService: vi.fn(),
    }));
    vi.doMock("../services/extraction/pdfExtractor", () => ({ extractPdf: plain }));
    const { extractDocument } = await import("../services/extraction");

    layout.mockResolvedValueOnce({ type: "pdf", pageCount: 1, text: "layout", lines: [] });
    expect(await extractDocument("/f.pdf", "a.pdf")).toMatchObject({ text: "layout" });
    expect(plain).not.toHaveBeenCalled();

    layout.mockResolvedValueOnce(null); // service down / failed
    expect(await extractDocument("/f.pdf", "a.pdf")).toMatchObject({ text: "plain" });
  });
});

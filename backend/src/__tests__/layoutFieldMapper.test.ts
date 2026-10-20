import { describe, expect, it, vi } from "vitest";
import { LayoutLine } from "../types/extraction";
import { isInvoiceNumberWord, isTableHeader, mapLayoutLines, parseItemRow, parseSplitRow } from "../services/fieldMapping/layoutFieldMapper";
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

/** Header lines exactly as the layout extractor produced them (Khmer labels are garbled legacy-font text). */
const headerLines = (rows: [number, string][]): LayoutLine[] => rows.map(([y, text]) => L(y, text));
const TABLE_HEADER = "Nº Description Qty Unit Price Amount";

describe("header fields from real invoice layouts", () => {
  it("INV-0310 (VTL template): number and date sit at the end of Khmer-labelled lines; customer is the Latin company line", () => {
    const lines = headerLines([
      [60.5, "វេស២ គ្បល ល៊ ឡជីសីកទ ឯ.ក"],
      [75.3, "S2 Global Logistics Co., Ltd."],
      [103.9, "House/Building No.:49Room A, Street P01, Phum Bayab, Sangkat Phnom PenhThmey,KhanSenSokPhnom Penh"],
      [126.0, "រលខ​អត​សត ញ្ញាណ្​ណ្កលម​អតប​VAT NO.:K009-902201072"],
      [163.9, "TAX INVOICE"],
      [191.1, "អ្ត្ិលិជន: វ ៀត វរតន លីង ហ្រវ័ វើឌីង (វេមបឌាូ )​ ឯ.ក លលខ​លរៀងវកិ កយ​បត្ត្​: 0310"],
      [200.5, "VIET TRANS LINK FORWARDING (CAMBODIA) CO ., LTD"],
      [223.3, "កាល​បរ​លិេេទ: 28.Aug.2026"],
      [229.0, "#104 Khamko Street, Toulonke Sangkat, Russey Keo District, Phnom Penh"],
      [246.7, "អតប​​​VATIN: K008-901639301 Exchange Rate 4,046"],
      [258.7, "Job No. IM-S2-320826"],
      [282.2, TABLE_HEADER],
      [547.5, "Account Name: S2 Global Logistics Co.,Ltd."],
    ]);
    expect(mapLayoutLines(lines).documentFields).toEqual({
      invoiceNumber: "0310",
      date: "28.Aug.2026",
      supplier: "S2 Global Logistics Co.,Ltd.",
      customer: "VIET TRANS LINK FORWARDING (CAMBODIA) CO ., LTD",
    });
  });

  it("INV-0255 (CHLL): the number precedes its label line, the date ends an English address line", () => {
    const lines = headerLines([
      [76.6, "S2 Global Logistics Co., Ltd."],
      [155.7, "TAX INVOICE"],
      [173.6, "ស៊ីអេចេិលេិល គ្លូប៊ល ឡូជ៊ីសកទ៊ី 0255"],
      [177.4, "អ្តិថ្ិជេ: នលខនរៀងវកិ ាយបត្ត:"],
      [184.7, "CHLL GLOBAL LOGISTIC CO.,LTD"],
      [209.8, "អា ស័យដ្ឋាេ: #Karnation BuildingE1, BoreySen Sok, 2nd floor, Street 598, Sangkat PhnomPenh Thmey, កាលបរនិឆេទ: 23.July.2026"],
      [233.6, "អតប ​​​VATIN: K009-901502009 ExchangeRate 4,041"],
      [245.0, "Job No. IM-S2-270626"],
      [257.8, "ល.រ បរយាិ យ បរមាិ ណ្ ថ្ថ្លឯកតា ថ្ថ្លទំេិញ"],
      [266.3, TABLE_HEADER],
    ]);
    // supplier falls back to the company named above the title (no Account Name line in this excerpt)
    expect(mapLayoutLines(lines).documentFields).toEqual({
      invoiceNumber: "0255",
      date: "23.July.2026",
      supplier: "S2 Global Logistics Co., Ltd.",
      customer: "CHLL GLOBAL LOGISTIC CO.,LTD",
    });
  });

  it("INV-0610 (MINEBEA): prefixed number, 'COMPANY NAME :' label stripped, Khmer tail dropped, Account Name typo tolerated", () => {
    const lines = headerLines([
      [66.6, "Dolphin Sea AirServices (Cambodia)Co., Ltd"],
      [112.9, "ទូរស័េហទ លខ៖ 0973903991"],
      [133.9, "TAX INVOICE"],
      [146.8, "ឈ្មោះក្រុមហ៊ុន​៖​ មឈី នឈ ៀ​(ឈេម ូឌា) ឈេេឈ ៀងវរិ យក ក្រ​៖​ DS26-0610"],
      [161.1, "COMPANY NAME : MINEBEA (CAMBODIA) CO.,LTD. កាេ ឈិឆទេ ​៖​ 0៣-រញ្ញា -២០២៦​​​​"],
      [178.7, "អាស័យដ្ឋាន៖​ Date : 03-Sep-2026"],
      [198.0, "#ROYAL GROUP PHNOMPENH SPECIAL ECONOMIC ZONE,N.R #.4,SANGKAT KHANTOUK,"],
      [226.8, "ឈេេអរសត ញ្ញា ណរម​មអរ ​/VATTIN :L001-901800396 Job No: IM-DOL-260903"],
      [250.2, "NO DESCRIPTION QUANTITY UNIT PRICE AMOUNT"],
      [560.4, "Accuount Name : Dolphin Sea Air Services (Cambodia) Co.,Ltd សរុប្រួល"],
    ]);
    expect(mapLayoutLines(lines).documentFields).toEqual({
      invoiceNumber: "DS26-0610",
      date: "03-Sep-2026",
      supplier: "Dolphin Sea Air Services (Cambodia) Co.,Ltd",
      customer: "MINEBEA (CAMBODIA) CO.,LTD.",
    });
  });

  it("does not treat a phone number, VAT id, exchange rate or job number as the invoice number", () => {
    for (const word of ["0973903991", "K009-902201072", "4,046", "IM-S2-320826", "28.Aug.2026", "12", "+85515686456"]) {
      expect(isInvoiceNumberWord(word)).toBe(false);
    }
    for (const word of ["0310", "0255", "DS26-0610", "INV-0310", "INV0611"]) {
      expect(isInvoiceNumberWord(word)).toBe(true);
    }
  });

  it("reads no number, date or customer without a title and a table header (nothing guessed)", () => {
    const lines = headerLines([[10, "VIET TRANS LINK FORWARDING (CAMBODIA) CO ., LTD"], [20, "Something 0310"], [30, "28.Aug.2026"]]);
    expect(mapLayoutLines(lines).documentFields).toEqual({});
  });

  it("never reports the supplier as the customer", () => {
    const lines = headerLines([
      [10, "TAX INVOICE"],
      [20, "S2 Global Logistics Co.,Ltd."],
      [30, "ACME TRADING CO., LTD"],
      [40, TABLE_HEADER],
      [50, "Account Name: S2 Global Logistics Co.,Ltd."],
    ]);
    expect(mapLayoutLines(lines).documentFields).toMatchObject({ supplier: "S2 Global Logistics Co.,Ltd.", customer: "ACME TRADING CO., LTD" });
  });

  it("explicit 'Label: value' text still beats the layout-derived header fields", () => {
    const lines = headerLines([[10, "TAX INVOICE"], [20, "0310"], [30, TABLE_HEADER]]);
    const doc = mapExtractionToFields({ type: "pdf", pageCount: 1, text: "Invoice Number: INV-777", lines });
    expect(doc?.documentFields.invoiceNumber).toBe("INV-777");
  });
});

describe("table rows beyond the simple one-line shape", () => {
  it("INV-0312: rows without a row number inside the table (two rows per item)", () => {
    const lines = [
      L(240, "NO DESCRIPTION QUANTITY UNIT PRICE AMOUNT"),
      L(270.1, "- MAWB NO.: 61855641950 DATE: 24-08-2026 (55cartons/396kgs) 1 $ 25.00 $ 25.00", 593.6),
      L(277.9, "1"),
      L(286.0, "- Chargable weight 396 $ 0.25 $ 99.00", 593.6),
      L(600, "Grand Total"),
    ];
    const { lineItems } = mapLayoutLines(lines);
    expect(lineItems).toEqual([
      { description: "- MAWB NO.: 61855641950 DATE: 24-08-2026 (55cartons/396kgs)", quantity: 1, unitPrice: 25, totalAmount: 25 },
      { description: "- Chargable weight", quantity: 396, unitPrice: 0.25, totalAmount: 99 },
    ]);
  });

  it("INV-0610: a row split over two lines (row no + qty, then description + prices)", () => {
    expect(parseSplitRow("2 1", "ថ្លឈៃ សវារមរម ៊ុងរឺទ័ ឈៅទីលាន TERMINAL HANDLING CHARGE $ 12.00 $ 12.00")).toEqual({
      description: "ថ្លឈៃ សវារមរម ៊ុងរឺទ័ ឈៅទីលាន TERMINAL HANDLING CHARGE",
      quantity: 1,
      unitPrice: 12,
      totalAmount: 12,
    });
    expect(parseSplitRow("2 1", "no prices here")).toBeNull();
    expect(parseSplitRow("not a head line", "DOCUMENT FEE $ 15.00 $ 15.00")).toBeNull();
  });

  it("INV-0610: reads a mix of one-line and split rows, and stops at the first total label", () => {
    const lines = [
      L(250.2, "NO DESCRIPTION QUANTITY UNIT PRICE AMOUNT"),
      L(263.3, "1 ឈសវាថល រាទំនិញ CFS HANDLING FEE 1 $ 17.00 $ 17.00", 561.2),
      L(276.0, "2 1"),
      L(279.6, "TERMINAL HANDLING CHARGE $ 12.00 $ 12.00", 561.2),
      L(294.2, "3 1"),
      L(297.9, "DELIVERY ORDER $ 25.00 $ 25.00", 561.2),
      L(513.1, "$ 118.00", 560.7),
      L(521.6, "Sub Total"),
      L(541.9, "$ 11.80", 560.7),
      L(548.1, "Bank Name : Canadia Bank PLC VAT10%"),
      L(570.5, "$ 129.80", 560.7),
      L(574.6, "Account No : 0066955998888 Grand Total"),
    ];
    const { lineItems, documentFields } = mapLayoutLines(lines);
    expect(lineItems.map((i) => [i.quantity, i.unitPrice, i.totalAmount])).toEqual([
      [1, 17, 17],
      [1, 12, 12],
      [1, 25, 25],
    ]);
    expect(documentFields).toEqual({ subtotal: 118, tax: 11.8, totalAmount: 129.8 });
  });

  it("does not read lines below the totals (e.g. bank details) as rows", () => {
    const lines = [
      L(100, "No Description Qty Unit Price Amount"),
      L(110, "1 Widget 2 $ 5.00 $ 10.00"),
      L(200, "SUBTOTAL $ 10.00"),
      L(300, "Ref 9 3 $ 1.00 $ 3.00"), // would parse as a row if it were inside the table
    ];
    expect(mapLayoutLines(lines).lineItems).toHaveLength(1);
  });

  it("without a table header, only strict numbered rows are read", () => {
    const lines = [L(110, "Widget 2 $ 5.00 $ 10.00"), L(120, "2 Gadget 3 $ 1.00 $ 3.00")];
    expect(mapLayoutLines(lines).lineItems).toEqual([{ description: "Gadget", quantity: 3, unitPrice: 1, totalAmount: 3 }]);
  });

  it("recognises a table header by its column names", () => {
    expect(isTableHeader("NO DESCRIPTION QUANTITY UNIT PRICE AMOUNT")).toBe(true);
    expect(isTableHeader("Nº Description Qty Unit Price Amount")).toBe(true);
    expect(isTableHeader("Description of goods")).toBe(false);
  });

  it("a row-number-less line is still refused if its price was split by a PDF gap", () => {
    expect(parseItemRow("- Fee 5 $ 3 15.00 $ 1,575.00", { requireRowNumber: false })).toBeNull();
  });
});

describe("mapLayoutLines on real invoice layouts", () => {
  it("INV-0310: pairs labels with the amount column even when an amount shares a line with an account number", () => {
    const { documentFields, lineItems } = mapLayoutLines(inv0310());
    expect(documentFields).toEqual({ supplier: "S2 Global Logistics Co.,Ltd.", subtotal: 50, tax: 5, totalAmount: 55, currency: "USD" });
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

describe("scanned pages (ocr option)", () => {
  it("reads a total only when its amount is on the same visual row", () => {
    const lines = [
      L(500, "Sub Total $ 118.00", 560),
      L(520, "VAT 10% $ 11.80", 560),
      L(540, "Grand Total $ 129.80", 560),
    ];
    expect(mapLayoutLines(lines, { ocr: true }).documentFields).toMatchObject({
      subtotal: 118,
      tax: 11.8,
      totalAmount: 129.8,
    });
  });

  it("does not pair leftover amounts with the wrong labels when OCR lost a row", () => {
    // Real INV-0610 scan: the "$ 118.00" amount was never recognised and the VAT label was
    // garbled, so two labels and two amounts remain. Pairing them by count would call the
    // VAT amount the subtotal.
    const lines = [
      L(500, "Sub Total"),
      L(520, "$ 11.80", 560),
      L(540, "Grand Total $ 129.80", 560),
    ];
    const fields = mapLayoutLines(lines, { ocr: true }).documentFields;
    expect(fields.totalAmount).toBe(129.8);
    expect(fields.subtotal).toBeUndefined();
    expect(fields.tax).toBeUndefined();
  });

  it("takes the right-most amount on a row (the amount column) when a unit price sits beside it", () => {
    const lines = [L(500, "Sub Total $ 50.00 $ 60.00", 560), L(540, "Grand Total $ 60.00", 560)];
    // x1 of the 50.00 word is 38 (synthetic), far left of the amount column at 560
    const fields = mapLayoutLines(lines, { ocr: true }).documentFields;
    expect(fields.totalAmount).toBe(60);
    expect(fields.subtotal).toBe(60);
  });
});

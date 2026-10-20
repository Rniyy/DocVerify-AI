import { describe, expect, it } from "vitest";
import { findFieldKeyForLabel } from "../services/fieldMapping/fieldDictionary";
import { mapTextToFields } from "../services/fieldMapping/textFieldMapper";
import { looksLikeDateValue, looksNumeric } from "../services/fieldMapping/valueParsers";

describe("findFieldKeyForLabel", () => {
  it.each([
    ["Invoice Number", "invoiceNumber"],
    ["INVOICE NO.:", "invoiceNumber"],
    ["Total Amount (USD)", "totalAmount"],
    ["Sub-Total", "subtotal"],
    ["Invoice Date", "date"],
    ["VAT", "tax"],
    ["Qty.", "quantity"],
    ["Consignee", "customer"],
  ])("maps %j to %s", (label, key) => {
    expect(findFieldKeyForLabel(label)).toBe(key);
  });

  it.each(["VAT (TIN) K009", "VAT NO.", "VATTIN", "VAT Reg No", "Tax TIN"])(
    "never treats the tax-registration label %j as an amount",
    (label) => {
      expect(findFieldKeyForLabel(label)).toBeNull();
    }
  );

  it("no longer reads a VAT registration number as tax (real MINEBEA invoice line)", () => {
    expect(mapTextToFields("VAT (TIN) K009-902500680").tax).toBeUndefined();
  });

  it.each(["VATIN", "Last update", "Community", "Exchange Rate", "Account No"])(
    "does not map %j just because it contains a known alias as a substring",
    (label) => {
      expect(findFieldKeyForLabel(label)).toBeNull();
    }
  );
});

describe("looksNumeric", () => {
  it.each(["55.00", "$55.00", "USD 10,000.00", "4,046", "-12.5", "12.5 KG", "500 CTN"])("accepts %j", (v) => {
    expect(looksNumeric(v)).toBe(true);
  });

  it.each(["K009-902201072", "N/A", "see attached", "INV-0310"])("rejects %j", (v) => {
    expect(looksNumeric(v)).toBe(false);
  });
});

describe("mapTextToFields", () => {
  it("no longer records a VAT registration number or exchange rate as tax", () => {
    const fields = mapTextToFields("VATIN: Exchange Rate 4,046\nVAT NO.: K009-902201072");
    expect(fields.tax).toBeUndefined();
  });

  it("still reads ordinary label: value lines", () => {
    const fields = mapTextToFields(
      "Invoice Number: INV-0310\nSupplier: ACME Co\nSubtotal: USD 50.00\nVAT: 5.00\nTotal Amount: USD 55.00\nGross Weight: 120.5 KG"
    );
    expect(fields).toMatchObject({
      invoiceNumber: "INV-0310",
      supplier: "ACME Co",
      subtotal: 50,
      tax: 5,
      totalAmount: 55,
      currency: "USD",
      grossWeight: 120.5,
    });
  });

  it("ignores non-numeric text under a numeric label", () => {
    expect(mapTextToFields("Quantity: as per attached").quantity).toBeUndefined();
  });
});

describe("date values", () => {
  it.each([
    ["03-Sep-2026", true],
    ["31.Aug.2026", true],
    ["28/08/2026", true],
    ["2026-08-28", true],
    ["Aug 28, 2026", true],
    ["46262", true], // Excel serial: no leading date pattern, left alone
    ["28-08-2026 1 $ 25.00] $ 25.00", false], // a table row, not a date
    ["24-08-2026 (55cartons/396kgs) 1", false],
    ["$ 25.00", false],
  ])("%s -> accepted: %s", (value, accepted) => {
    expect(looksLikeDateValue(value)).toBe(accepted);
  });

  it("does not take a row's 'DATE:' fragment as the invoice date", () => {
    const text = [
      "- MAWB 61857542730 DATE: 28-08-2026 1 $ 25.00 $ 25.00",
      "Invoice Date: 31.Aug.2026",
    ].join("\n");
    expect(mapTextToFields(text).date).toBe("31.Aug.2026");
  });

  it("leaves the date unset when only a row fragment is present", () => {
    expect(mapTextToFields("- MAWB 61857542730 DATE: 28-08-2026 1 $ 25.00 $ 25.00").date).toBeUndefined();
  });

  it("does not split a date at its own hyphen when OCR garbles the colon", () => {
    expect(mapTextToFields("Date ; 03-Sep-2026").date).toBeUndefined();
    expect(mapTextToFields("Date: 03-Sep-2026").date).toBe("03-Sep-2026");
  });
});

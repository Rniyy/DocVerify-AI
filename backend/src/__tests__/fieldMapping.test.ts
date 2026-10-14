import { describe, expect, it } from "vitest";
import { findFieldKeyForLabel } from "../services/fieldMapping/fieldDictionary";
import { mapTextToFields } from "../services/fieldMapping/textFieldMapper";
import { looksNumeric } from "../services/fieldMapping/valueParsers";

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

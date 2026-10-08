import { describe, expect, it } from "vitest";
import { validateCalculations } from "../services/calculation/calculationValidator";
import { StructuredDocument } from "../types/fields";

describe("validateCalculations", () => {
  it("flags quantity × unit price ≠ line total", () => {
    const issues = validateCalculations([
      { documentFields: {}, lineItems: [{ quantity: 10, unitPrice: 5, totalAmount: 60 }] },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ scope: "lineItem", expected: 50, actual: 60, difference: 10 });
  });

  it("flags subtotal + tax ≠ total", () => {
    const issues = validateCalculations([
      { documentFields: { subtotal: 100, tax: 10, totalAmount: 120 }, lineItems: [] },
    ]);
    expect(issues.map((i) => i.rule)).toEqual(["subtotal + tax = total amount"]);
  });

  describe("sum of line totals = subtotal", () => {
    const rows = (totals: number[]) => totals.map((totalAmount, i) => ({ description: `Item ${i}`, totalAmount }));

    it("flags a subtotal that doesn't add up", () => {
      const doc: StructuredDocument = { documentFields: { subtotal: 250 }, lineItems: rows([100, 100]) };
      const issues = validateCalculations([doc]);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ rule: "sum of line totals = subtotal", expected: 200, actual: 250, difference: 50 });
    });

    it("passes when it does add up", () => {
      expect(validateCalculations([{ documentFields: { subtotal: 200 }, lineItems: rows([100, 100]) }])).toEqual([]);
    });

    it("is skipped for a single line item (may just mirror the header)", () => {
      expect(validateCalculations([{ documentFields: { subtotal: 100 }, lineItems: rows([120]) }])).toEqual([]);
    });

    it("ignores summary rows that have a total but no product info", () => {
      const lineItems = [...rows([100, 100]), { totalAmount: 200 }];
      expect(validateCalculations([{ documentFields: { subtotal: 200 }, lineItems }])).toEqual([]);
    });

    it("is skipped when any product row has no total", () => {
      const lineItems = [{ description: "A", totalAmount: 100 }, { description: "B" }];
      expect(validateCalculations([{ documentFields: { subtotal: 500 }, lineItems }])).toEqual([]);
    });
  });

  describe("gross weight ≥ net weight", () => {
    it("flags gross lighter than net", () => {
      const issues = validateCalculations([{ documentFields: { grossWeight: 90, netWeight: 100 }, lineItems: [] }]);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ rule: "gross weight ≥ net weight", expected: 100, actual: 90, difference: 10 });
    });

    it("accepts equal and heavier gross weights", () => {
      expect(validateCalculations([{ documentFields: { grossWeight: 100, netWeight: 100 }, lineItems: [] }])).toEqual([]);
      expect(validateCalculations([{ documentFields: { grossWeight: 110, netWeight: 100 }, lineItems: [] }])).toEqual([]);
    });
  });
});

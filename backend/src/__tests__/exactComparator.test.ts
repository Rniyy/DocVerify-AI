import { describe, expect, it } from "vitest";
import { compareFieldAcrossDocuments } from "../services/comparison/exactComparator";

describe("compareFieldAcrossDocuments", () => {
  it("matches identical text, ignoring case and surrounding whitespace", () => {
    expect(compareFieldAcrossDocuments("supplier", ["ACME Ltd", "  acme ltd "]).status).toBe("match");
  });

  it("matches numbers within rounding tolerance", () => {
    expect(compareFieldAcrossDocuments("subtotal", [10000, 9999.999]).status).toBe("match");
  });

  it("reports a numeric mismatch with the difference", () => {
    const result = compareFieldAcrossDocuments("quantity", [500, 450]);
    expect(result.status).toBe("mismatch");
    expect(result.difference).toBe("50");
  });

  it("treats a field missing from one document as a mismatch", () => {
    expect(compareFieldAcrossDocuments("poNumber", ["PO-1", undefined]).status).toBe("mismatch");
  });
});

import { describe, expect, it } from "vitest";
import { alignLineItems, lineItemSimilarity } from "../services/comparison/lineItemAlignment";
import { StructuredDocument } from "../types/fields";

const doc = (...descriptions: string[]): StructuredDocument => ({
  documentFields: {},
  lineItems: descriptions.map((description) => ({ description })),
});

describe("lineItemSimilarity", () => {
  it("treats reordered words as the same product", () => {
    expect(lineItemSimilarity({ description: "Whole Star Anise" }, { description: "Star Anise Whole" })).toBe(1);
  });

  it("scores unrelated products low", () => {
    expect(lineItemSimilarity({ description: "Star Anise" }, { description: "Cinnamon Sticks" })).toBe(0);
  });

  it("uses a matching HS code when descriptions are missing", () => {
    expect(lineItemSimilarity({ hsCode: "0909.61" }, { hsCode: "090961" })).toBe(1);
  });
});

describe("alignLineItems", () => {
  it("keeps order when documents already agree", () => {
    const aligned = alignLineItems([doc("Star Anise", "Cloves"), doc("Star Anise", "Cloves")]);
    expect(aligned[1].map((i) => i?.description)).toEqual(["Star Anise", "Cloves"]);
  });

  it("re-orders a document whose products are listed in a different order", () => {
    const aligned = alignLineItems([doc("Star Anise", "Cloves", "Black Pepper"), doc("Black Pepper", "Star Anise", "Cloves")]);
    expect(aligned[1].map((i) => i?.description)).toEqual(["Star Anise", "Cloves", "Black Pepper"]);
  });

  it("falls back to position for items it can't match by content", () => {
    const aligned = alignLineItems([doc("Item A"), doc("Completely different")]);
    expect(aligned[1].map((i) => i?.description)).toEqual(["Completely different"]);
  });

  it("gives an extra product its own row, with the other document missing it", () => {
    const aligned = alignLineItems([doc("Star Anise"), doc("Star Anise", "Cloves")]);
    expect(aligned[0].map((i) => i?.description)).toEqual(["Star Anise", undefined]);
    expect(aligned[1].map((i) => i?.description)).toEqual(["Star Anise", "Cloves"]);
  });

  it("returns equal-length rows for every document, including three-way comparisons", () => {
    const aligned = alignLineItems([doc("A one", "B two"), doc("B two"), doc("C three", "A one")]);
    const lengths = aligned.map((rows) => rows.length);
    expect(new Set(lengths).size).toBe(1);
  });

  it("handles documents with no line items", () => {
    expect(alignLineItems([doc(), doc()])).toEqual([[], []]);
  });
});

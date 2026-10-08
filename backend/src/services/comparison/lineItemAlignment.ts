import { ExtractedFields, StructuredDocument } from "../../types/fields";

/** Minimum similarity for two line items to be treated as "the same product". */
const MATCH_THRESHOLD = 0.5;

function tokens(text: string | undefined): Set<string> {
  if (!text) return new Set();
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  a.forEach((t) => {
    if (b.has(t)) shared++;
  });
  return shared / (a.size + b.size - shared);
}

function normalizeHs(code: string | undefined): string {
  return (code ?? "").replace(/\D/g, "");
}

/**
 * How likely two line items describe the same product (0..1+). Purely
 * deterministic — word overlap on the description plus an HS-code bonus.
 * Never touches quantities or prices, so a numeric discrepancy can't be
 * "aligned away".
 */
export function lineItemSimilarity(a: ExtractedFields, b: ExtractedFields): number {
  const hsA = normalizeHs(a.hsCode);
  const hsB = normalizeHs(b.hsCode);
  const hsEqual = hsA !== "" && hsA === hsB;

  const descA = tokens(a.description);
  const descB = tokens(b.description);
  const haveDescriptions = descA.size > 0 && descB.size > 0;

  if (haveDescriptions) {
    return jaccard(descA, descB) + (hsEqual ? 0.5 : 0);
  }
  return hsEqual ? 1 : 0;
}

interface Row {
  cells: (ExtractedFields | undefined)[];
  /** First item placed in this row; later documents are matched against it. */
  representative: ExtractedFields;
}

/**
 * Lines up line items across documents so row N means "the same product in
 * every document", even when the documents list products in different
 * orders. Items that can't be matched by content fall back to positional
 * pairing (the pre-Stage-16 behaviour), and anything left over becomes its
 * own row with the other documents shown as missing.
 *
 * Returns one array per input document; every array has the same length.
 */
export function alignLineItems(documents: StructuredDocument[]): (ExtractedFields | undefined)[][] {
  const docCount = documents.length;
  const rows: Row[] = [];

  documents.forEach((doc, docIndex) => {
    const items = doc.lineItems;

    if (docIndex === 0) {
      items.forEach((item) => {
        const cells: (ExtractedFields | undefined)[] = new Array(docCount).fill(undefined);
        cells[0] = item;
        rows.push({ cells, representative: item });
      });
      return;
    }

    const rowAssigned = new Set<number>();
    const itemAssigned = new Set<number>();

    // 1) Best content matches first.
    const candidates: { row: number; item: number; score: number }[] = [];
    rows.forEach((row, r) => {
      items.forEach((item, i) => {
        const score = lineItemSimilarity(row.representative, item);
        if (score >= MATCH_THRESHOLD) candidates.push({ row: r, item: i, score });
      });
    });
    candidates.sort(
      (x, y) =>
        y.score - x.score ||
        Math.abs(x.row - x.item) - Math.abs(y.row - y.item) ||
        x.row - y.row ||
        x.item - y.item
    );
    for (const c of candidates) {
      if (rowAssigned.has(c.row) || itemAssigned.has(c.item)) continue;
      rows[c.row].cells[docIndex] = items[c.item];
      rowAssigned.add(c.row);
      itemAssigned.add(c.item);
    }

    // 2) Leftovers pair up by position, so wording differences that the AI
    //    semantic step can still resolve aren't split into two rows.
    const freeRows = rows.map((_, r) => r).filter((r) => !rowAssigned.has(r));
    const freeItems = items.map((_, i) => i).filter((i) => !itemAssigned.has(i));
    const paired = Math.min(freeRows.length, freeItems.length);
    for (let k = 0; k < paired; k++) {
      rows[freeRows[k]].cells[docIndex] = items[freeItems[k]];
    }

    // 3) Items with no counterpart get their own row.
    for (let k = paired; k < freeItems.length; k++) {
      const cells: (ExtractedFields | undefined)[] = new Array(docCount).fill(undefined);
      const item = items[freeItems[k]];
      cells[docIndex] = item;
      rows.push({ cells, representative: item });
    }
  });

  return documents.map((_, docIndex) => rows.map((row) => row.cells[docIndex]));
}

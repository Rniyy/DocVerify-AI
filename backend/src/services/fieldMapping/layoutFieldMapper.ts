import { LayoutLine } from "../../types/extraction";
import { ExtractedFields } from "../../types/fields";

/**
 * Stage 21 — reads invoice tables and totals out of position-ordered PDF
 * lines. Plain pattern matching, no AI.
 *
 * Deliberate design choice: rows and totals are recognised by *structure*
 * only. They are never accepted or rejected because their arithmetic works
 * out, since that would hide exactly the discrepancies this app exists to
 * report (a row saying 1 × $50.00 = $60.00 must reach the calculation
 * checks, not be silently dropped).
 */

const MONEY = String.raw`[\d,]+\.\d{2}`;

// "<row no> <description> <qty> [$] <unit price> [$] <amount>"
const ITEM_ROW = new RegExp(
  String.raw`^(\d{1,3})\s+(.*?)\s*(\d+(?:\.\d+)?)\s+[$€£]?\s*(${MONEY})\s*[$€£]?\s+[$€£]?\s*(${MONEY})\s*[$€£]?$`
);

const TRAILING_MONEY = new RegExp(String.raw`[$€£]?\s*(${MONEY})\s*[$€£]?$`);

const toNumber = (raw: string): number => Number(raw.replace(/,/g, ""));

export interface LayoutResult {
  documentFields: ExtractedFields;
  lineItems: ExtractedFields[];
}

/** Parses one table row; null when the line isn't shaped like an invoice row. */
export function parseItemRow(text: string): ExtractedFields | null {
  const match = text.trim().match(ITEM_ROW);
  if (!match) return null;

  const [, , description, qty, unitPrice, amount] = match;
  const item: ExtractedFields = {
    quantity: Number(qty),
    unitPrice: toNumber(unitPrice),
    totalAmount: toNumber(amount),
  };
  const cleaned = description.trim();
  // A currency symbol in the "description" means a number was split in two by
  // a gap in the PDF's text (e.g. "$ 3 15.00" for $315.00). Reading it would
  // yield a wrong quantity and price, so the row is refused instead.
  if (/[$€£]/.test(cleaned)) return null;
  if (cleaned) item.description = cleaned;
  return item;
}

type TotalKind = "subtotal" | "tax" | "totalAmount";

function classifyLabel(text: string): { kind: TotalKind; currency?: string } | null {
  const upper = text.toUpperCase();

  // The riel (KHR) restatement of the grand total is a conversion, not a second amount.
  if (/\bTOTAL\b.*\b(RIEL|KHR)\b/.test(upper)) return null;

  const grand = upper.match(/\bGRAND\s+TOTAL(?:\s+([A-Z]{3}))?\b/);
  if (grand) return { kind: "totalAmount", currency: grand[1] };

  if (/\bVAT\s*\d*\s*%|\bTAX\s*\(/.test(upper)) return { kind: "tax" };
  if (/(^|[^A-Z])TOTAL\s*:/.test(upper) || /\bSUB\s*-?\s*TOTAL\b/.test(upper)) return { kind: "subtotal" };
  return null;
}

const MONEY_WORD = new RegExp(String.raw`^[$€£]?${MONEY}$`);
/**
 * An amount may be printed a little above its label (different baselines in
 * separate columns), so the search starts this far above the first label.
 */
const ABOVE_LABEL_ALLOWANCE = 12;

/** Right edges of amounts in one column differ by well under this many points. */
const COLUMN_TOLERANCE = 2;
const MIN_COLUMN_SIZE = 3;

interface MoneyWord {
  page: number;
  y: number;
  x1: number;
  value: number;
}

/**
 * Amounts printed with a gap inside the number ("$ 1 1.80" for $11.80) reach
 * us as a stray digit group plus a partial amount ("1.80"). Reading the
 * partial amount would give a plausible but wrong number, so such amounts are
 * left out — the totals then fail the count check and nothing is guessed.
 */
function isSplitNumber(words: LayoutLine["words"], index: number): boolean {
  const before = words[index - 1];
  const beforeThat = words[index - 2];
  return !!before && !!beforeThat && /^\d{1,3}$/.test(before.text) && /^[$€£]$/.test(beforeThat.text);
}

function moneyWords(lines: LayoutLine[]): MoneyWord[] {
  return lines.flatMap((line) =>
    line.words.flatMap((w, i) =>
      MONEY_WORD.test(w.text) && !isSplitNumber(line.words, i)
        ? [{ page: line.page, y: line.y, x1: w.x1, value: toNumber(w.text.replace(/[$€£]/g, "")) }]
        : []
    )
  );
}

/**
 * The page's amount column: the right edge shared by the most amounts. Item
 * amounts and summary totals are right-aligned to the same edge, so this
 * separates them from other numbers (account numbers, prices in notes).
 */
function findAmountColumn(words: MoneyWord[]): number | null {
  let best: { x1: number; count: number } | null = null;
  for (const w of words) {
    const count = words.filter((o) => Math.abs(o.x1 - w.x1) <= COLUMN_TOLERANCE).length;
    if (count >= MIN_COLUMN_SIZE && (best === null || count > best.count)) best = { x1: w.x1, count };
  }
  return best?.x1 ?? null;
}

/**
 * Pairs total labels (TOTAL / VAT / GRAND TOTAL) with the amounts in the
 * amount column below the first label, top to bottom. Label text and amounts
 * are often on different visual lines (separate columns, different baselines),
 * so position order is used rather than same-line matching — but only when the
 * counts agree exactly; otherwise nothing is guessed. If no amount column can
 * be found, only values printed on the same line as their label are used.
 */
function parseTotals(lines: LayoutLine[]): ExtractedFields {
  const fields: ExtractedFields = {};

  const labels = lines
    .map((line) => ({ line, label: classifyLabel(line.text) }))
    .filter((entry): entry is { line: LayoutLine; label: NonNullable<ReturnType<typeof classifyLabel>> } => entry.label !== null);
  // An invoice summary always ends in a grand total. Forms that merely contain
  // "Total ..." labels (customs declarations: "Total fees", "Total Item No. 2")
  // are not invoice summaries, so nothing is read from them.
  if (!labels.some(({ label }) => label.kind === "totalAmount")) return fields;

  for (const { label } of labels) {
    if (label.currency && !fields.currency) fields.currency = label.currency;
  }

  const words = moneyWords(lines);
  const columnX = findAmountColumn(words);

  if (columnX !== null) {
    const first = labels[0].line;
    const values = words
      .filter((w) => Math.abs(w.x1 - columnX) <= COLUMN_TOLERANCE)
      .filter((w) => w.page > first.page || (w.page === first.page && w.y >= first.y - ABOVE_LABEL_ALLOWANCE))
      .sort((a, b) => a.page - b.page || a.y - b.y);

    if (values.length === labels.length) {
      labels.forEach(({ label }, i) => {
        if (fields[label.kind] === undefined) fields[label.kind] = values[i].value;
      });
      return fields;
    }
  }

  // Fallback: only an amount ending the very same line as its label.
  for (const { line, label } of labels) {
    const inline = line.text.match(TRAILING_MONEY);
    if (inline && fields[label.kind] === undefined) fields[label.kind] = toNumber(inline[1]);
  }
  return fields;
}

export function mapLayoutLines(lines: LayoutLine[]): LayoutResult {
  const ordered = [...lines].sort((a, b) => a.page - b.page || a.y - b.y);

  const lineItems = ordered
    .map((line) => parseItemRow(line.text))
    .filter((item): item is ExtractedFields => item !== null);

  return { documentFields: parseTotals(ordered), lineItems };
}

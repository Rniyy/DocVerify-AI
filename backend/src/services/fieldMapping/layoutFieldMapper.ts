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

const MONEY_TAIL = String.raw`[$€£]?\s*(${MONEY})\s*[$€£]?\s+[$€£]?\s*(${MONEY})\s*[$€£]?$`;

// "<row no> <description> <qty> [$] <unit price> [$] <amount>"
const ITEM_ROW_NUMBERED = new RegExp(String.raw`^(\d{1,3})\s+(.*?)\s*(\d+(?:\.\d+)?)\s+${MONEY_TAIL}`);
// Same, but the row number is optional (inside a recognised table, some rows have none).
const ITEM_ROW_UNNUMBERED = new RegExp(String.raw`^(?:(\d{1,3})\s+)?(.*?)\s*(\d+(?:\.\d+)?)\s+${MONEY_TAIL}`);
// A row split over two lines: "<row no> <qty>" then "<description> [$] <unit price> [$] <amount>".
const ROW_NO_AND_QTY = /^(\d{1,3})\s+(\d+(?:\.\d+)?)$/;
const DESCRIPTION_AND_PRICES = new RegExp(String.raw`^(.*?)\s*${MONEY_TAIL}`);
/** The second line of a split row sits this close (in points) below the first. */
const SPLIT_ROW_MAX_GAP = 12;

const TRAILING_MONEY = new RegExp(String.raw`[$€£]?\s*(${MONEY})\s*[$€£]?$`);

const toNumber = (raw: string): number => Number(raw.replace(/,/g, ""));

export interface LayoutResult {
  documentFields: ExtractedFields;
  lineItems: ExtractedFields[];
}

function buildItem(description: string, qty: number, unitPrice: string, amount: string): ExtractedFields | null {
  const cleaned = description.trim();
  // A currency symbol in the "description" means a number was split in two by
  // a gap in the PDF's text (e.g. "$ 3 15.00" for $315.00). Reading it would
  // yield a wrong quantity and price, so the row is refused instead.
  if (/[$€£]/.test(cleaned)) return null;

  const item: ExtractedFields = { quantity: qty, unitPrice: toNumber(unitPrice), totalAmount: toNumber(amount) };
  if (cleaned) item.description = cleaned;
  return item;
}

/**
 * Parses one single-line table row; null when the line isn't shaped like an
 * invoice row. `requireRowNumber: false` is for lines already known to be
 * inside a table, where some rows carry no row number.
 */
export function parseItemRow(text: string, options: { requireRowNumber?: boolean } = {}): ExtractedFields | null {
  const { requireRowNumber = true } = options;
  const line = text.trim();

  if (requireRowNumber) {
    const m = line.match(ITEM_ROW_NUMBERED);
    return m ? buildItem(m[2], Number(m[3]), m[4], m[5]) : null;
  }
  const m = line.match(ITEM_ROW_UNNUMBERED);
  return m ? buildItem(m[2], Number(m[3]), m[4], m[5]) : null;
}

/** Joins a "<row no> <qty>" line with the "<description> <price> <amount>" line below it. */
export function parseSplitRow(first: string, second: string): ExtractedFields | null {
  const head = first.trim().match(ROW_NO_AND_QTY);
  const tail = second.trim().match(DESCRIPTION_AND_PRICES);
  return head && tail ? buildItem(tail[1], Number(head[2]), tail[2], tail[3]) : null;
}

/** The table's header line: it names a description, a quantity and an amount column. */
export function isTableHeader(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes("description") && /\bqty\b|quantity/.test(lower) && lower.includes("amount");
}

function parseTableRows(region: LayoutLine[]): ExtractedFields[] {
  const items: ExtractedFields[] = [];
  for (let i = 0; i < region.length; i++) {
    const single = parseItemRow(region[i].text, { requireRowNumber: false });
    if (single) {
      items.push(single);
      continue;
    }
    const next = region[i + 1];
    if (next && next.page === region[i].page && next.y - region[i].y <= SPLIT_ROW_MAX_GAP) {
      const split = parseSplitRow(region[i].text, next.text);
      if (split) {
        items.push(split);
        i++;
      }
    }
  }
  return items;
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

  // With a recognisable header, rows are read only between it and the first
  // total label, and may lack a row number or span two lines. Without one,
  // fall back to strict single-line rows anywhere on the page.
  const headerIndex = ordered.findIndex((line) => isTableHeader(line.text));
  let lineItems: ExtractedFields[];
  if (headerIndex !== -1) {
    const after = ordered.slice(headerIndex + 1);
    const end = after.findIndex((line) => classifyLabel(line.text) !== null);
    lineItems = parseTableRows(end === -1 ? after : after.slice(0, end));
  } else {
    lineItems = ordered
      .map((line) => parseItemRow(line.text))
      .filter((item): item is ExtractedFields => item !== null);
  }

  return { documentFields: parseTotals(ordered), lineItems };
}

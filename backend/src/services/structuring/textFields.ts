import { StructuredFieldMap } from "../../types/structured";

// Standalone currency amounts (e.g. "125.40 USD") that appear without an
// adjacent colon-delimited label — common for "TOTAL" lines where the
// amount is printed before the word "TOTAL" rather than after a colon.
function findAmounts(line: string): string[] {
  const pattern = /\b([\d,]+\.\d{2})\s*(USD|VND|EUR|GBP|JPY|CNY)\b/gi;
  const found: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line)) !== null) {
    found.push(`${match[1]} ${match[2].toUpperCase()}`);
  }
  return found;
}

function normalizeKey(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.\t]+$/, "")
    .toLowerCase();
}

// A label must contain at least one letter — guards against a bare
// booking/reference number being mistaken for a field name when a colon
// sits between two data values rather than between a label and its value.
function looksLikeLabel(s: string | undefined): s is string {
  return !!s && /[a-zA-Z]/.test(s) && s.length <= 40 && !s.includes(":");
}

/**
 * Stage 6 — extracts label/value pairs from the raw text Stage 5's PDF
 * extractor produces. Multi-column freight documents get flattened into
 * one text stream by pdf-parse, but tab characters usually still mark the
 * original column boundaries — so each line is tokenized on tabs first,
 * and a handful of colon-position patterns are checked per token, rather
 * than requiring "label: value" to appear inside a single token:
 *   - "label:value"      both in one token
 *   - "label:"           label token, value in the next token
 *   - ": value"          colon+value together, label in the previous token
 *   - a token that is    label in the token 2 before OR value in the token
 *     just ":" alone     before, depending which side has a value
 *
 * This is deliberately heuristic, not a layout-aware parser — dense rows
 * with several colons close together (e.g. two blank reference fields in a
 * row) can still mispair a label with the wrong neighboring value. Fully
 * reliable extraction from jumbled multi-column PDF text needs real
 * positional data, which belongs to the layout-aware extractor planned for
 * the Python service (Stage 10), not this rule-based pass.
 */
export function extractTextFields(text: string): { fields: StructuredFieldMap; amounts: string[] } {
  const fields: StructuredFieldMap = {};
  const amounts: string[] = [];

  function addField(label: string | undefined, value: string | undefined) {
    if (!looksLikeLabel(label) || !value) return;
    const key = normalizeKey(label);
    const val = value.trim();
    if (key && val && !(key in fields)) fields[key] = val;
  }

  for (const rawLine of text.split("\n")) {
    const tokens = rawLine.split("\t").map((t) => t.trim());

    tokens.forEach((t, i) => {
      if (!t) return;
      const colonIdx = t.indexOf(":");

      if (colonIdx === -1) return; // no colon in this token at all

      if (colonIdx > 0 && colonIdx < t.length - 1) {
        // "label:value" together in one token
        addField(t.slice(0, colonIdx), t.slice(colonIdx + 1));
        return;
      }

      if (colonIdx === 0 && t.length > 1) {
        // ":value" — label is the previous token
        addField(tokens[i - 1], t.slice(1));
        return;
      }

      if (t === ":") {
        // bare colon marker — label/value could be split across either side
        addField(tokens[i - 1], tokens[i + 1]); // "label : value"
        addField(tokens[i - 2], tokens[i - 1]); // "label value :" (order jumbled)
        return;
      }

      if (colonIdx === t.length - 1) {
        // "label:" — value is the next token
        addField(t.slice(0, colonIdx), tokens[i + 1]);
      }
    });

    // Fallback for simple two-column lines with no colon at all
    // (e.g. "Shipper \t FISHER FOOTWEAR LLC").
    const nonEmpty = tokens.filter((t) => t.length > 0);
    if (nonEmpty.length === 2 && !rawLine.includes(":")) {
      addField(nonEmpty[0], nonEmpty[1]);
    }

    amounts.push(...findAmounts(rawLine));
  }

  return { fields, amounts: [...new Set(amounts)] };
}

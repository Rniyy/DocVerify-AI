import { ExtractionResult } from "../../types/extraction";
import { ExtractedFields, StructuredDocument } from "../../types/fields";
import { extractFieldsWithAi } from "../ai/pythonAiClient";

/**
 * Stage 20 — AI-assisted extraction for documents the rule-based mapper
 * can't read (e.g. PDFs whose text layer scrambles labels away from their
 * values, bilingual layouts). Safeguards that keep the "no AI in the numbers"
 * architecture rule intact:
 *
 *   1. It only runs when rule-based extraction came back sparse.
 *   2. Rule-based values always win; AI only fills gaps.
 *   3. Every AI value must literally appear in the document's text. Anything
 *      the model calculated, reformatted or invented is dropped.
 *   4. The upload response says which documents were AI-assisted, so a
 *      reviewer knows to double-check them.
 */

export type ExtractionMethod = "rules" | "rules+ai";

const DOCUMENT_STRING_FIELDS = ["invoiceNumber", "poNumber", "supplier", "customer", "date", "currency", "containerNumber", "shippingTerms"] as const;
const DOCUMENT_NUMBER_FIELDS = ["subtotal", "tax", "totalAmount", "grossWeight", "netWeight"] as const;
const LINE_STRING_FIELDS = ["description", "unit", "hsCode"] as const;
const LINE_NUMBER_FIELDS = ["quantity", "unitPrice", "totalAmount"] as const;

/** Below this many document-level fields (or with no line items) a document counts as "sparse". */
const MIN_DOCUMENT_FIELDS = 3;
/** Don't bother the AI with near-empty text (e.g. a scanned PDF with no text layer). */
const MIN_TEXT_LENGTH = 40;

export function isSparse(doc: StructuredDocument | null): boolean {
  if (!doc) return true;
  const found = Object.values(doc.documentFields).filter((v) => v !== undefined).length;
  return found < MIN_DOCUMENT_FIELDS || doc.lineItems.length === 0;
}

const compact = (s: string) => s.toLowerCase().replace(/\s+/g, "");
const numberKey = (n: number) => n.toFixed(6);

function numbersInText(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const value = Number(match[0].replace(/,/g, ""));
    if (Number.isFinite(value)) found.add(numberKey(value));
  }
  return found;
}

type Grounder = {
  text: (value: unknown) => string | undefined;
  number: (value: unknown) => number | undefined;
};

function makeGrounder(sourceText: string): Grounder {
  const haystack = compact(sourceText);
  const numbers = numbersInText(sourceText);
  return {
    text: (value) => {
      if (typeof value !== "string") return undefined;
      const trimmed = value.trim();
      return trimmed !== "" && haystack.includes(compact(trimmed)) ? trimmed : undefined;
    },
    number: (value) => {
      const n = typeof value === "number" ? value : NaN;
      // A negative number can't be checked against the unsigned digits found
      // in text, so only plain non-negative amounts are accepted.
      return Number.isFinite(n) && n >= 0 && numbers.has(numberKey(n)) ? n : undefined;
    },
  };
}

function groundFields(
  candidate: unknown,
  grounder: Grounder,
  stringKeys: readonly (keyof ExtractedFields)[],
  numberKeys: readonly (keyof ExtractedFields)[]
): ExtractedFields {
  const out: ExtractedFields = {};
  if (typeof candidate !== "object" || candidate === null) return out;
  const source = candidate as Record<string, unknown>;

  for (const key of stringKeys) {
    const v = grounder.text(source[key]);
    if (v !== undefined) (out[key] as string | undefined) = v;
  }
  for (const key of numberKeys) {
    const v = grounder.number(source[key]);
    if (v !== undefined) (out[key] as number | undefined) = v;
  }
  return out;
}

/**
 * Keeps only the parts of an AI candidate that can be traced back to the
 * source text, with types coerced to what the comparison code expects.
 */
export function groundCandidate(candidate: unknown, sourceText: string): StructuredDocument {
  const grounder = makeGrounder(sourceText);
  const raw = (typeof candidate === "object" && candidate !== null ? candidate : {}) as {
    documentFields?: unknown;
    lineItems?: unknown;
  };

  const documentFields = groundFields(raw.documentFields, grounder, DOCUMENT_STRING_FIELDS, DOCUMENT_NUMBER_FIELDS);
  const lineItems = (Array.isArray(raw.lineItems) ? raw.lineItems : [])
    .map((item) => groundFields(item, grounder, LINE_STRING_FIELDS, LINE_NUMBER_FIELDS))
    .filter((item) => Object.keys(item).length > 0);

  return { documentFields, lineItems };
}

/** Rule-based values win; AI fills in only what the rules didn't find. */
export function mergeStructured(rules: StructuredDocument | null, ai: StructuredDocument): StructuredDocument {
  const rulesDoc = rules ?? { documentFields: {}, lineItems: [] };
  return {
    documentFields: { ...ai.documentFields, ...rulesDoc.documentFields },
    // The text mapper can only ever produce one mirrored "line item"; a real
    // table read by the AI is more useful than that.
    lineItems: rulesDoc.lineItems.length > 1 || ai.lineItems.length === 0 ? rulesDoc.lineItems : ai.lineItems,
  };
}

const TEXT_TYPES = new Set(["pdf", "docx", "image"]);

/**
 * Returns the best structured view of a document: rule-based if it looks
 * complete, otherwise rule-based topped up with verified AI output.
 */
export async function enrichWithAi(
  extraction: ExtractionResult | null,
  rules: StructuredDocument | null
): Promise<{ document: StructuredDocument | null; method: ExtractionMethod }> {
  if (!extraction || !TEXT_TYPES.has(extraction.type) || !("text" in extraction)) {
    return { document: rules, method: "rules" };
  }
  if (!isSparse(rules) || extraction.text.trim().length < MIN_TEXT_LENGTH) {
    return { document: rules, method: "rules" };
  }

  const candidate = await extractFieldsWithAi(extraction.text);
  if (candidate === null) return { document: rules, method: "rules" };

  const grounded = groundCandidate(candidate, extraction.text);
  const gainedSomething =
    Object.keys(grounded.documentFields).length > 0 || grounded.lineItems.length > 0;
  if (!gainedSomething) return { document: rules, method: "rules" };

  return { document: mergeStructured(rules, grounded), method: "rules+ai" };
}

export interface ScanInfo {
  ocr?: boolean;
  ocrConfidence?: number | null;
  ocrSkippedPages?: number[];
}

/** Below this mean Tesseract confidence a scan is called out as poor quality. */
const LOW_OCR_CONFIDENCE = 70;

/**
 * Human-readable caution shown when a document needs a second look: it was
 * scanned (read with OCR), it is still thin after extraction, or AI helped.
 */
export function extractionWarning(
  doc: StructuredDocument | null,
  method: ExtractionMethod,
  scan: ScanInfo = {}
): string | null {
  if (!doc) return null;
  const found = Object.values(doc.documentFields).filter((v) => v !== undefined).length;
  const notes: string[] = [];

  if (scan.ocr) {
    const skipped = scan.ocrSkippedPages?.length ?? 0;
    notes.push(
      "This is a scanned document, read with OCR. Some rows, totals or digits may be missing or misread" +
        (skipped > 0 ? `, and ${skipped} later page${skipped === 1 ? " was" : "s were"} not read` : "") +
        " — please check the results against the original."
    );
    if (typeof scan.ocrConfidence === "number" && scan.ocrConfidence < LOW_OCR_CONFIDENCE) {
      notes.push("The scan quality is low, so errors are more likely. A sharper or higher-resolution scan will read better.");
    }
  }
  if (found < MIN_DOCUMENT_FIELDS) {
    notes.push(
      `Only ${found} field${found === 1 ? "" : "s"} could be read from this document, so the comparison may be incomplete.`
    );
  } else if (method === "rules+ai") {
    notes.push("Some fields were read with AI assistance — please double-check them against the original.");
  }
  return notes.length > 0 ? notes.join(" ") : null;
}

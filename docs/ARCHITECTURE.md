# Architecture Notes

## Why split Node.js and Python?

- **Node.js/Express (TypeScript)** is good at: HTTP APIs, auth, file handling,
  talking to MySQL, and running deterministic business logic (comparisons,
  math checks) quickly and predictably. This is where we want **no AI
  involved** — exact numeric comparisons and totals must be 100% reliable,
  so they're plain TypeScript functions, unit-testable, and never touch an
  LLM.
- **Python** is the natural home for OCR/document parsing libraries
  (pdfplumber, python-docx, openpyxl, pytesseract, etc.) and for calling an
  AI model for the fuzzy parts of the job (semantic description matching,
  human-readable discrepancy explanations). Python never does the exact
  numeric comparison — it only extracts data and, later, adds semantic
  judgment on top of results that TypeScript already computed.

## Data flow (target end-state, built up over the stages)

1. User uploads documents via the frontend → Node.js backend.
2. Node.js stores the files (secure storage) and file metadata in MySQL,
   then calls the Python service's `/extract` endpoint with the file(s).
3. Python service extracts structured JSON per document and returns it.
4. Node.js stores extracted fields in `document_fields` and runs:
   - Exact comparison (string/number equality per field)
   - Calculation validation (quantity × unit price = total, subtotal + tax
     = grand total, etc.)
5. For fields that fail exact comparison but might just be phrased
   differently (e.g. descriptions), Node.js calls the Python service's
   `/semantic-compare` endpoint, which calls the AI model and returns a
   match/no-match judgment **that cannot override a numeric mismatch**.
6. Node.js calls Python's `/explain` endpoint to get a plain-language
   explanation for each discrepancy, strictly grounded in the actual
   extracted values (no invented data).
7. Node.js persists results in `comparisons` / `comparison_results` and
   returns the full comparison payload to the frontend, which renders the
   dashboard.

## API keys

Any AI API key (e.g. `ANTHROPIC_API_KEY`) lives only in the Python
service's environment (`python-service/.env`, not committed to git). The
Node.js backend never sees or forwards it, and the frontend never touches
it — the frontend only ever talks to the Node.js backend.

## Stage 20 — AI-assisted extraction (and why it doesn't break the "no AI in the numbers" rule)

Rule-based extraction (`fieldMapping/`) reads `Label: value` text and Excel
headers. Real PDFs — especially bilingual layouts — often scramble the text
layer so that labels and values are lines apart, and the rules find almost
nothing. For those documents only, the backend asks the Python service
(`POST /ai/extract-fields`) for a *candidate* structured document, then:

1. **Rules win.** `mergeStructured` only uses AI values for fields the rules
   left empty.
2. **Everything is verified.** `groundCandidate` keeps a value only if it
   literally appears in the document's text (numbers are checked against the
   numbers actually printed there). Calculated, reformatted or invented values
   are dropped before they can reach a comparison.
3. **It's visible.** The upload response carries `extractionMethod`
   (`rules` | `rules+ai`) and an `extractionWarning`; the results page shows
   a caution so a reviewer double-checks AI-assisted documents.
4. **It's optional.** No API key, no Python service, or an unusable reply all
   fall back to the rule-based result.

Comparison, calculation checks and line-item alignment remain plain,
unit-tested TypeScript.

## Line-item alignment (Stage 16)

Line items are matched across documents by content (description word overlap
plus HS code) before comparison, so row N is the same product everywhere even
when documents list products in different orders. Unmatched items fall back
to positional pairing (the original behaviour); items with no counterpart get
their own row and show as missing in the other documents. Because rows are
aligned, "Line item N" in the comparison table is the aligned row, which can
differ from a document's own row number.

## Layout-aware PDF extraction (Stage 21)

`pdf-parse` returns a PDF's text in stream order. For some generators —
notably bilingual Khmer/English invoices — that order scrambles labels away
from their values and splits table rows across many lines. The Python service
now offers `POST /extract?layout=true` (pdfplumber), which clusters words by
vertical position into visual lines and returns each word's x-range. The Node
backend prefers it for PDFs and falls back to `pdf-parse` if it is unavailable.

`fieldMapping/layoutFieldMapper.ts` then reads two things, by structure only:

- **Table rows:** read only between the table's header line (one naming
  Description, Qty and Amount) and the first total label. Handles
  `<no> <description> <qty> <unit price> <amount>`, rows with no row number, and
  rows split over two lines (`<no> <qty>` then `<description> <price> <amount>`).
  Without a recognisable header, only strict numbered one-line rows are read.
- **Totals:** labels (`TOTAL`, `VAT 10%`, `GRAND TOTAL USD`) paired, top to
  bottom, with the amounts in the page's *amount column* (the right edge shared
  by the most amounts). Pairing happens only when the label and amount counts
  agree exactly and a `GRAND TOTAL` label exists; the riel restatement is ignored.

Two rules keep this from corrupting the comparison:

1. **Arithmetic is never used to accept or reject a value.** A row saying
   1 × $50 = $60 must reach the calculation checks, not be silently dropped.
2. **When a number can't be read reliably, nothing is read.** If an amount
   still looks split (`$ 1 1.80`), that row/amount is refused rather than read
   as `1.80`.

Why amounts used to look split: some invoice generators emit a literal space
character positioned *inside* the first digit of a right-aligned amount, so the
text stream says `1 1.80` although the page shows `11.80`. The Python extractor
drops spaces that overlap a neighbouring glyph (`drop_overlapped_spaces`) before
forming words; spaces with visible room around them are kept.

Explicit `Label: value` text still wins over layout-derived values, and the
AI fallback (Stage 20) now sees the better text too.

### Header fields (invoice number, date, supplier, customer)

The labels for these are Khmer in a legacy font and extract as garbage, so they
cannot be matched by label. `parseHeader` uses structure instead, anchored on
the English "TAX INVOICE" title and the table header:

- **Invoice number:** the last word of the first line below the title that has
  an invoice-number shape (3–6 digits, optional short prefix such as `DS26-`;
  never a phone-length digit run, VAT id, exchange rate or job number).
- **Date:** the first date-shaped word between the title and the table.
- **Supplier:** the bank beneficiary ("Account Name: …", typo-tolerant) — the
  seller; otherwise the first company-suffix line above the title.
- **Customer:** the first company-suffix line (`CO.,LTD`, `LLC`, …) between the
  title and the table that isn't the supplier. A leading "COMPANY NAME :" label
  and glued-on Khmer text are stripped; the name is otherwise kept as printed.

These rules were derived from and are tested against three real invoice
layouts (five documents). They are heuristics: a layout that differs may leave a
field empty (never filled with a guess from outside the region), and explicit
`Label: value` text and the Stage 20 AI fallback still take over where they apply.

Cross-check used during development: on the five real invoices in the sample
set, the rows read from each table sum exactly to that invoice's separately
read subtotal, and quantity × unit price equals the amount on every row.

## Missing rows (Stage 24)

After line items are aligned across documents, a row that exists in only some of
them produces a single `lineItem` finding (`MISSING_ROW_FIELD`) whose values are
the row's description per document and `undefined` where it is absent. It counts
as one error, gets no AI explanation (the UI words it itself), and is exported to
CSV as "Row present in". If the row exists in at least two documents, its fields
are still compared among just those documents (absent ones are not blamed), so a
real quantity or price difference is not hidden. Known limit: the AI semantic
step only runs when every document has the field, so a reworded description on a
partially present row stays a plain mismatch.

## Scanned PDFs (Stage 26)

A scanned PDF has no text layer: every page is a picture. The layout extractor
(`python-service/app/extraction/pdf_layout.py`) detects a page with fewer than
5 words, rasterises it at 300 dpi and runs Tesseract (`pdf_ocr.py`,
`image_to_data`, `--psm 6`). Each recognised word is converted to PDF points
(`x * 72 / dpi`), so OCR'd pages produce the **same line/word shape** as text
pages and flow through the same mapper. The response adds `ocr`, `ocrPages`,
`ocrSkippedPages` and `ocrConfidence`.

What is different for OCR'd documents, and why:

- **Never guess a digit.** Words Tesseract itself scores below 40 are dropped,
  and a row whose number is not clean (`17.c0`) is refused by the existing
  numeric rules. A missing row is visible to the user; a misread amount is not.
- **Totals pair by row, not by count.** On text PDFs a total label and its
  amount are paired by order when the counts agree. On a scan, OCR can lose a
  label *and* an amount, and equal counts then pair the wrong ones (a real case:
  the VAT amount was read as the subtotal). With `mapLayoutLines(lines,
  { ocr: true })` a total is read only when its amount is on the same visual row
  (within 5 pt, right-most amount, claimed by one label only).
- **Always a caution.** `extractionWarning` tells the user the document was
  scanned and that rows, totals or digits may be missing or misread; it adds a
  note for low-confidence scans (mean confidence < 70) and for pages beyond the
  OCR limit.
- **Limits.** At most 3 pages per document are OCR'd (about 8 s per page); the
  rest are reported, not silently ignored. The backend allows 120 s for the
  layout request. Only English is installed by default (`OCR_LANGS`), so Khmer
  text in a scan is not recognised, which matters little for the numeric and
  Latin fields the mapper reads.

Two fixes to the text mapper came out of testing on scans, and apply to every
PDF: a `date` value must be a date (a table row such as `DATE: 28-08-2026 1 $
25.00` is refused), and a date label never contains digits (`Date ; 03-Sep-2026`
must not become the label `Date ; 03` with the value `Sep-2026`).


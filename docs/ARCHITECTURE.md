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

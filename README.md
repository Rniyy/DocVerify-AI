# AI Document Comparison Assistant (DocVerify-AI)

A full-stack app that lets a user upload two or more business documents
(Commercial Invoice, Packing List, Purchase Order, Bill of Lading, etc.),
extracts structured data from them, and checks whether key fields are
correct and consistent across documents — both by exact/mathematical
rules and by AI-assisted semantic matching.

**Current stage: 25.** See [What's new](#whats-new-in-stages-1625) and `docs/ROADMAP.md`.

## Features

- **Upload** 2–10 documents per comparison: PDF, Excel (`.xlsx`, `.xls`), Word (`.docx`), JPG, PNG — up to 15 MB each (`MAX_UPLOAD_SIZE_MB`).
- **Extraction** of invoice number, PO number, date, supplier, customer, currency, subtotal, tax, total, weights, HS code, container number, shipping terms, and line items (description, quantity, unit, unit price, amount).
- **Exact comparison** of every field across documents (numbers within 0.01; text trimmed and case-insensitive), with line items aligned by content so a different product order is not a mismatch.
- **Calculation checks** per document: quantity × unit price = amount, subtotal + tax = total, sum of line amounts = subtotal, gross weight ≥ net weight.
- **AI help, kept in its lane:** judges whether two *wordings* mean the same thing and writes a one-sentence explanation of each discrepancy. It never decides numbers.
- **Accounts and history:** register / log in (JWT), and every comparison is saved and can be reopened.
- **CSV export** of any comparison.

## Architecture

```
┌─────────────┐      REST       ┌───────────────────┐      REST       ┌────────────────────┐
│  Frontend   │ ───────────────▶│  Node.js/Express   │ ───────────────▶│  Python service     │
│  (HTML/JS)  │◀─────────────── │  (TypeScript)      │◀───────────────│  (OCR/extraction/AI)│
└─────────────┘                 └─────────┬──────────┘                └────────────────────┘
                                           │
                                           ▼
                                     ┌───────────┐
                                     │   MySQL   │
                                     └───────────┘
```

**Responsibility split** (kept strict on purpose, see `docs/ARCHITECTURE.md`):

| Layer | Responsibility |
|---|---|
| Node.js / Express (TypeScript) | Auth, REST API, file management, database, business logic |
| Python service | OCR, PDF layout reading, Word parsing, AI calls |
| AI (called from Python) | Semantic understanding, description matching, discrepancy explanations, fallback field extraction |
| TypeScript | Exact comparison, mathematical validation, business rules |

**No AI in the numbers.** Exact comparison and arithmetic run in plain
TypeScript. AI can only upgrade a *text* mismatch to "semantic match" and
explain a finding that was already made. The AI API key lives only in the
Python service. Every optional integration fails soft: if the Python service,
the AI, or the database is unavailable, the app still returns a result.

### How a comparison runs

1. **Upload** (`POST /api/documents`) — multer validates type and size and stores each file under a random name.
2. **Extract** — PDF: layout-aware reading via the Python service (falls back to `pdf-parse`); Excel: read directly; Word and images: Python service (python-docx, Tesseract OCR).
3. **Map to fields** — `Label: value` text and Excel headers go through a label dictionary; PDF layouts are read by position (table rows, totals, header fields).
4. **AI top-up** (optional) — if a document is still sparse and `ANTHROPIC_API_KEY` is set, AI suggests the missing fields, and every value must literally appear in the document text. Rule-based values always win.
5. **Compare** (`POST /api/comparisons`) — align line items, compare fields exactly, validate each document's math, then (optionally) AI semantic upgrade and explanations.
6. **Save and show** — stored per user in MySQL, shown on the results page, exportable as CSV.

## API

All routes are under `/api`. Everything except `health` and `auth` needs `Authorization: Bearer <token>`.

| Method | Route | Purpose |
|---|---|---|
| GET | `/health` | Backend health check |
| POST | `/auth/register`, `/auth/login` | Create account / get a JWT (rate-limited) |
| POST | `/documents` | Multipart upload (field name `documents`, 2–10 files); returns extracted structured data per file |
| POST | `/comparisons` | Compare structured documents; returns the report and `comparisonId` |
| GET | `/comparisons` | Your comparison history |
| GET | `/comparisons/:id` | One saved comparison |
| GET | `/comparisons/:id/export` | Download it as CSV |

## Folder structure

```
DocVerify-AI/
├── frontend/            # Static HTML/CSS/JS client (index, results, history, login)
│   └── Dockerfile
├── backend/             # Node.js + Express + TypeScript API
│   ├── src/
│   │   ├── routes/ controllers/ middleware/ config/ types/ utils/
│   │   ├── services/    # extraction, fieldMapping, comparison, calculation, ai, export, persistence
│   │   └── __tests__/   # Vitest tests
│   └── Dockerfile
├── python-service/      # Python FastAPI service for OCR, PDF layout and AI
│   ├── app/
│   ├── tests/
│   └── Dockerfile
├── database/            # SQL schema
├── docs/                # ARCHITECTURE.md, ROADMAP.md
├── docker-compose.yml   # Runs the whole stack together
└── .env.example         # docker-compose variables
```

## What's new in Stages 16–25

| Stage | What it adds |
|---|---|
| 25 | **Legacy Excel (`.xls`) uploads** are accepted alongside `.xlsx` (backend filter, extractor, and the upload page). `.xlsm` and `.csv` are still not accepted. |
| 24 | **Quieter results for missing rows** — a line item that exists in only some documents is now one finding ("row appears in only some documents") instead of a mismatch on every field. Its other fields are still compared among the documents that do have it. On the real INV-0310 vs INV-0312 pair this cut 76 errors to 25. |
| 21–23 | **Layout-aware PDF reading** — the Python service (`POST /extract?layout=true`, pdfplumber) rebuilds lines from word positions, so a table row is one line again and totals are paired with the amount column. Reads line items (including rows with no row number and rows split over two lines) and subtotal / VAT / grand total from real invoices that the text-stream parser could not, repairs amounts that the PDF's text stream splits (`$ 1 1.80` is really $11.80), and reads invoice number, date, supplier and customer from bilingual invoice headers by structure rather than by (garbled) Khmer labels (see `docs/ARCHITECTURE.md`). Falls back to the old extraction if the Python service is down. Also: VAT/TIN registration numbers are no longer read as a tax amount. |
| 20 | **AI-assisted extraction** for PDFs the rule-based mapper can't read, with every AI value verified against the document text before use (see `docs/ARCHITECTURE.md`). Needs `ANTHROPIC_API_KEY`; without it, behaviour is unchanged. |
| 19 | **Tests** — see [Testing](#testing). |
| 18 | **Hardening** — rate limiting on `/auth` (10 attempts / 15 min / IP), `CORS_ORIGIN` to restrict allowed origins, a startup warning for placeholder `JWT_SECRET` in production, and `ANTHROPIC_MODEL` to choose the AI model without code changes. |
| 17 | **CSV export** — `GET /api/comparisons/:id/export`, plus *Export CSV* buttons on the results and history pages. Cells from documents are neutralised against spreadsheet formula injection. |
| 16 | **Smarter comparison** — line items are aligned across documents (different product order no longer causes false mismatches), grand totals are compared, and two new checks run: *sum of line totals = subtotal* and *gross weight ≥ net weight*. Label matching now requires whole words (`VATIN` is no longer read as `VAT`) and numeric fields reject non-numeric text, which fixes silent bogus values such as a VAT registration number stored as `tax`. |

Stages 1–15 built the original app: static frontend, Express backend,
upload, PDF/Excel extraction, field mapping, exact comparison, calculation
validation, results UI, the Python service (Word and OCR), AI semantic
comparison and explanations, MySQL, authentication, history, and Docker Compose.

Also fixed along the way: `npm run build` (and therefore the Docker build) failed
on a type error left by Stage 10, and *History → View details* could not load
because `results.html` never included `api.js`.

## Running with Docker

The whole stack — MySQL, the Python service, the Node backend, and the
static frontend — runs with one command, no local MySQL/Tesseract/Node
install required.

```bash
cp .env.example .env
# edit .env: set real passwords and JWT_SECRET, and ANTHROPIC_API_KEY if you
# want AI semantic comparison, explanations and AI-assisted extraction.
# Everything else works without the key.

docker compose up --build
```

Then open:
- **http://localhost:8080** — the app itself
- **http://localhost:4000/api/health** — backend health check
- **http://localhost:8000/health** — Python service health check
- MySQL is reachable on **localhost:3306** if you want to inspect it with a client

The database schema (`database/schema.sql`) loads automatically the first
time the `mysql` container starts (an empty data volume). Uploaded files
persist in `./backend/uploads` on your host via a bind mount, and MySQL
data persists in a named Docker volume (`mysql-data`), so `docker compose
down` (without `-v`) keeps everything intact for next time.

To stop everything: `docker compose down` (add `-v` to also wipe the
database volume and start completely fresh).

## Running locally without Docker

You need Node 20+, Python 3.11+, MySQL 8, and Tesseract (for image OCR).

```bash
# 1. Database: create a database and user, then load database/schema.sql

# 2. Python service (http://localhost:8000)
cd python-service
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 3. Backend (http://localhost:4000)
cd backend
cp .env.example .env      # fill in DB_* and JWT_SECRET
npm install
npm run dev

# 4. Frontend: serve the frontend/ folder with any static server
cd frontend
npx serve -l 8080
```

The backend works with the Python service or MySQL down, with reduced
features: PDFs fall back to plain text reading, Word/image files cannot be
read, and comparisons are not saved to history.

## Configuration

Docker reads `.env` in the project root (see `.env.example`). When running
the backend by itself, the same names go in `backend/.env`.

| Variable | Default | Purpose |
|---|---|---|
| `JWT_SECRET` | `dev_only_change_me` | Signs login tokens. **Set a long random value in production**; the backend warns if it is left as the placeholder. |
| `ANTHROPIC_API_KEY` | — | Enables AI comparison, explanations and AI-assisted extraction (Python service only). |
| `ANTHROPIC_MODEL` | `claude-sonnet-5` | Model used for those AI features. |
| `CORS_ORIGIN` | any origin | Comma-separated browser origins allowed to call the API. Set it before deploying. |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | `localhost`, `3306`, `doccompare`, —, `doccompare` | MySQL connection. |
| `MAX_UPLOAD_SIZE_MB` | `15` | Per-file upload limit. |
| `PYTHON_SERVICE_URL` | `http://localhost:8000` | Where the backend finds the Python service. |

## Testing

```bash
# Backend (Vitest): comparison, alignment, validators, CSV, field mapping,
# layout reading, AI grounding, .xls support, and HTTP-level API tests
cd backend && npm install && npm test

# Python service (pytest)
cd python-service && pip install -r requirements-dev.txt && python -m pytest
# Set DOCVERIFY_SAMPLES=<folder with INV-0310_VTL.pdf> to include the
# real-invoice test.
```

## Known limitations

- **Tuned on three invoice layouts.** The PDF layout rules were built from real bilingual (Khmer/English) invoices. An unfamiliar layout may leave fields empty rather than wrong; it will not invent values.
- **Excel files** need headers the reader recognises (Description, Qty, Unit Price, Amount, Total…). The table/header logic added for PDFs does not apply to Excel yet.
- **Scanned (image-only) PDFs** are not supported. Standalone JPG/PNG files are read with OCR.
- **Customs forms and delivery notes** are read poorly; the layout reader deliberately returns nothing from forms without a grand-total label.
- **The AI fallback** (Stage 20) has not been run against the live model in this repository's tests; it needs `ANTHROPIC_API_KEY`.
- **Uploaded files are kept forever** in `backend/uploads`.

## Security notes

- Never commit `.env` files or real business documents (`backend/uploads/`). If they were ever shared or committed, rotate the secrets they contain.
- Set `JWT_SECRET`, database passwords and `CORS_ORIGIN` before exposing the app beyond your own machine.
- The login routes are rate-limited in memory per server instance.

See `docs/ROADMAP.md` for what's next, and `docs/ARCHITECTURE.md` for why the system is split this way.

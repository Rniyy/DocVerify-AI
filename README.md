# AI Document Comparison Assistant

A full-stack app that lets a user upload two or more business documents
(Commercial Invoice, Packing List, Purchase Order, Bill of Lading, etc.),
extracts structured data from them, and checks whether key fields are
correct and consistent across documents — both by exact/mathematical
rules and by AI-assisted semantic matching.

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
| Python service | OCR, document parsing, data extraction, AI calls |
| AI (called from Python) | Semantic understanding, description matching, discrepancy explanations |
| TypeScript | Exact comparison, mathematical validation, business rules |

## Folder structure

```
ai-document-comparison-assistant/
├── frontend/            # Static HTML/CSS/JS client
│   └── Dockerfile
├── backend/             # Node.js + Express + TypeScript API
│   ├── src/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── config/
│   │   ├── types/
│   │   └── utils/
│   └── Dockerfile
├── python-service/      # Python FastAPI service for OCR + AI
│   ├── app/
│   └── Dockerfile
├── database/            # SQL schema & migrations
├── docs/                # Architecture & design notes
├── docker-compose.yml   # Runs the whole stack together (Stage 15)
└── .env.example         # docker-compose variables
```

## Running with Docker (Stage 15)

The whole stack — MySQL, the Python service, the Node backend, and the
static frontend — runs with one command, no local MySQL/Tesseract/Node
install required.

```bash
cp .env.example .env
# edit .env: at minimum set ANTHROPIC_API_KEY if you want AI semantic
# comparison/explanations (Stage 11); everything else works without it.

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

**Note:** this replaces running each service manually (`npm run dev`,
`uvicorn ...`, a local MySQL server) from Stages 1–14 — it's an
alternative way to run the same app, not a different app. Local
development without Docker still works exactly as before if you prefer it.

See `docs/ARCHITECTURE.md` for more detail on why the system is split this way.

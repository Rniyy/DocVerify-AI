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
├── frontend/            # Static HTML/CSS/JS client (Stage 2+)
├── backend/             # Node.js + Express + TypeScript API (Stage 3+)
│   └── src/
│       ├── routes/
│       ├── controllers/
│       ├── middleware/
│       ├── config/
│       ├── types/
│       └── utils/
├── python-service/      # Python FastAPI/Flask service for OCR + AI (Stage 10+)
│   └── app/
├── database/            # SQL schema & migrations (Stage 12+)
├── docs/                # Architecture & design notes
└── docker-compose.yml   # Added in Stage 15
```

## Build stages

This project is being built incrementally. Current stage: **Stage 1 — Project structure**.

1. Project structure (this stage)
2. Frontend upload page
3. Node.js/Express backend skeleton
4. File upload handling
5. Extract text/data from PDF and Excel
6. Convert extracted data to structured JSON
7. Exact field comparison
8. Calculation validation
9. Comparison results UI
10. Python document-processing service
11. AI semantic comparison
12. MySQL integration
13. Authentication
14. Comparison history
15. Docker
16. Test with realistic business documents

See `docs/ARCHITECTURE.md` for more detail on why the system is split this way.

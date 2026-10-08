# Roadmap

Ideas for after Stage 20, roughly in order of value.

1. **Scanned PDFs.** `pdf-parse` returns no text for image-only PDFs. Rasterise
   pages in the Python service and OCR them (Tesseract is already there for
   images), then feed the text into the same mapping + AI fallback.
2. **Layout-aware table extraction.** Use pdfplumber (coordinates) in Python to
   rebuild invoice tables, so line items don't depend on the AI fallback.
3. **Single-line-item mirroring.** For text documents the mapper copies header
   fields into one "line item", so `quantity × unit price = total` can warn
   spuriously when tax is included. Real tables (item 2) fix this properly.
4. **Persist extraction notices** with the comparison so history views show the
   same cautions as a fresh run.
5. **Date and currency normalisation** (`28.Aug.2026` vs `2026-08-28`, KHR vs
   USD with a printed exchange rate) as deterministic TypeScript.
6. **Upload retention.** Uploaded files are kept forever in `backend/uploads`;
   add a retention period or delete-after-extraction option.
7. **Housekeeping.** `backend/src/services/structuring/` and
   `backend/src/types/{structured,fields.types}.ts` are unused, and
   `frontend/upload.js` / `frontend/styles.css` duplicate the copies under
   `js/` and `css/`.

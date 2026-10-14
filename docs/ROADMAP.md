# Roadmap

Ideas for after Stage 21, roughly in order of value.

1. **Header fields on bilingual invoices.** Invoice number, date, supplier and
   customer are often printed under Khmer-only labels, so the English-label
   dictionary misses them. Options: add Khmer label aliases to
   `fieldDictionary.ts`, or rely on the Stage 20 AI fallback (needs
   `ANTHROPIC_API_KEY`).
2. **Scanned PDFs.** Image-only PDFs have no text layer. Rasterise pages in the
   Python service and OCR them (Tesseract is already installed for images).
3. **Non-invoice documents.** Customs declarations and delivery notes are read
   poorly (garbled `(cid:0)` glyphs, headers glued into one value). They need
   their own mappers or the AI fallback.
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

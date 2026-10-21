# Roadmap

Ideas for after Stage 27, roughly in order of value.

1. **Scans, round three.** Remaining weak spots: pages rotated 90° or upside down
   (needs Tesseract orientation detection), rows OCR still can't read (a second
   pass on just the failed rows, cropped and enlarged), Khmer language data,
   and testing on real phone photos and flatbed scans, since the measurements so
   far use renderings of two PDFs.
2. **Non-invoice documents.** Customs declarations and delivery notes are read
   poorly (garbled `(cid:0)` glyphs, headers glued into one value). They need
   their own mappers or the AI fallback.
3. **Persist extraction notices** with the comparison so history views show the
   same cautions as a fresh run.
4. **Date and currency normalisation** (`28.Aug.2026` vs `2026-08-28`, KHR vs
   USD with a printed exchange rate) as deterministic TypeScript.
5. **Upload retention.** Uploaded files are kept forever in `backend/uploads`;
   add a retention period or delete-after-extraction option.
6. **Housekeeping.** `backend/src/services/structuring/` and
   `backend/src/types/{structured,fields.types}.ts` are unused, and
   `frontend/upload.js` / `frontend/styles.css` duplicate the copies under
   `js/` and `css/`.

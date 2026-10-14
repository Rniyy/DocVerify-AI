# Roadmap

Ideas for after Stage 21, roughly in order of value.

1. **Header fields on bilingual invoices.** Invoice number, date, supplier and
   customer are often printed under Khmer-only labels, so the English-label
   dictionary misses them. Options: add Khmer label aliases to
   `fieldDictionary.ts`, or rely on the Stage 20 AI fallback (needs
   `ANTHROPIC_API_KEY`).
2. **Repair split numbers.** Stage 21 refuses amounts split by a PDF text gap
   (`$ 1 1.80`, `$ 3 15.00`) instead of misreading them. Some real sample
   invoices contain such amounts, so their rows or totals go unread. Recovering
   them safely needs glyph-level positions (merge digits only when the visual
   gap is smaller than a space), not guesswork.
3. **Multi-line table rows.** Some invoices put the description on one line and
   the numbers on the next. Stage 21 reads single-line rows only.
4. **Scanned PDFs.** Image-only PDFs have no text layer. Rasterise pages in the
   Python service and OCR them (Tesseract is already installed for images).
5. **Non-invoice documents.** Customs declarations and delivery notes are read
   poorly (garbled `(cid:0)` glyphs, headers glued into one value). They need
   their own mappers or the AI fallback.
6. **Persist extraction notices** with the comparison so history views show the
   same cautions as a fresh run.
7. **Date and currency normalisation** (`28.Aug.2026` vs `2026-08-28`, KHR vs
   USD with a printed exchange rate) as deterministic TypeScript.
8. **Upload retention.** Uploaded files are kept forever in `backend/uploads`;
   add a retention period or delete-after-extraction option.
9. **Housekeeping.** `backend/src/services/structuring/` and
   `backend/src/types/{structured,fields.types}.ts` are unused, and
   `frontend/upload.js` / `frontend/styles.css` duplicate the copies under
   `js/` and `css/`.

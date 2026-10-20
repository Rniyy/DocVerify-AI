import pdfplumber

from app.extraction.pdf_ocr import OCR_DPI, needs_ocr, ocr_words

# Words whose vertical centres are within this many points are treated as
# sitting on the same visual line. Generous enough for baseline jitter between
# Latin and Khmer glyphs, small enough not to merge neighbouring rows.
LINE_TOLERANCE = 3.0

# Safety valve for very long documents: the mapper only needs invoice-sized input.
MAX_PAGES = 10

# OCR is slow (seconds per page), so scanned documents are read for at most this
# many pages. Pages beyond it are reported in `ocrSkippedPages`.
MAX_OCR_PAGES = 3


def drop_overlapped_spaces(chars: list[dict]) -> list[dict]:
    """Removes space characters that sit inside a neighbouring glyph's box.

    Some invoice generators emit a literal space whose position overlaps the
    first digit of a right-aligned amount (e.g. a space at x=542.2 inside a
    "1" spanning 541.8-545.9). The text stream says "1 1.80", but on the page
    there is no gap: it reads $11.80. Spaces that no glyph gap separates are
    not word breaks, so they are dropped before words are formed. Genuine
    spaces (those with visible room around them) are kept.
    """
    glyphs = [c for c in chars if c["text"].strip()]

    def overlapped(space: dict) -> bool:
        centre = (space["top"] + space["bottom"]) / 2
        return any(
            g["x0"] - 0.01 <= space["x0"] < g["x1"] - 0.01 and g["top"] <= centre <= g["bottom"]
            for g in glyphs
        )

    return [c for c in chars if c["text"].strip() or not overlapped(c)]


def group_words_into_lines(words: list[dict], tolerance: float = LINE_TOLERANCE) -> list[list[dict]]:
    """Clusters words by vertical centre, then orders each cluster left to right."""
    ordered = sorted(words, key=lambda w: (w["top"] + w["bottom"]) / 2)
    clusters: list[list[dict]] = []
    centres: list[float] = []

    for word in ordered:
        centre = (word["top"] + word["bottom"]) / 2
        if clusters and abs(centre - centres[-1]) <= tolerance:
            clusters[-1].append(word)
            # running mean keeps the cluster centred as words join it
            centres[-1] = sum((w["top"] + w["bottom"]) / 2 for w in clusters[-1]) / len(clusters[-1])
        else:
            clusters.append([word])
            centres.append(centre)

    return [sorted(cluster, key=lambda w: w["x0"]) for cluster in clusters]


def extract_pdf_layout(path: str) -> dict:
    """Reads a PDF using word coordinates instead of the file's text stream.

    PDFs made by some generators (notably bilingual Khmer/English invoices)
    store text in an order that scrambles labels away from their values.
    Rebuilding lines from positions puts a table row back on one line.

    Pages with no text layer (scans) are rasterised and OCR'd instead (Stage 26);
    their words are converted to the same shape, so everything downstream is
    unchanged. OCR results are flagged so the UI can ask for a double-check.

    Returns {"type": "pdf", "pageCount", "text", "lines": [{"page", "y", "text",
    "words": [{"text", "x0", "x1"}]}], "ocr": bool, "ocrPages": [int],
    "ocrSkippedPages": [int], "ocrConfidence": float | None}. `text` is the lines
    joined with newlines, a drop-in replacement for the plain text extraction.
    """
    lines: list[dict] = []
    ocr_pages: list[int] = []
    ocr_skipped: list[int] = []
    confidences: list[float] = []

    with pdfplumber.open(path) as pdf:
        page_count = len(pdf.pages)
        for page_number, page in enumerate(pdf.pages[:MAX_PAGES], start=1):
            kept = {id(c) for c in drop_overlapped_spaces(page.chars)}
            words = page.filter(lambda obj: obj.get("object_type") != "char" or id(obj) in kept).extract_words(
                x_tolerance=2, y_tolerance=3
            )
            if needs_ocr(len(words)):
                if len(ocr_pages) >= MAX_OCR_PAGES:
                    ocr_skipped.append(page_number)
                    continue
                words, confidence = ocr_words(page.to_image(resolution=OCR_DPI).original, OCR_DPI)
                ocr_pages.append(page_number)
                if words:
                    confidences.append(confidence)
            for cluster in group_words_into_lines(words):
                lines.append(
                    {
                        "page": page_number,
                        "y": round(sum((w["top"] + w["bottom"]) / 2 for w in cluster) / len(cluster), 1),
                        "text": " ".join(w["text"] for w in cluster),
                        "words": [
                            {"text": w["text"], "x0": round(w["x0"], 1), "x1": round(w["x1"], 1)}
                            for w in cluster
                        ],
                    }
                )

    return {
        "type": "pdf",
        "pageCount": page_count,
        "text": "\n".join(line["text"] for line in lines).strip(),
        "lines": lines,
        "ocr": bool(ocr_pages),
        "ocrPages": ocr_pages,
        "ocrSkippedPages": ocr_skipped,
        "ocrConfidence": round(sum(confidences) / len(confidences), 1) if confidences else None,
    }

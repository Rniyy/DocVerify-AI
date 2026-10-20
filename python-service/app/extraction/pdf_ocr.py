"""OCR for scanned (image-only) PDF pages.

Output words use the same shape as pdfplumber's (`text`, `x0`, `x1`, `top`,
`bottom`, in PDF points), so scanned pages flow through exactly the same
line-grouping and field-mapping code as text PDFs.
"""

import os

import pytesseract
from pytesseract import Output

# Tesseract language(s). Only "eng" ships with the Docker image; install more
# traineddata packs (e.g. khm) and set OCR_LANGS=eng+khm to use them.
OCR_LANGS = os.environ.get("OCR_LANGS", "eng")

# Rasterise at 300 dpi: the usual sweet spot for printed business documents.
OCR_DPI = 300

# Words Tesseract itself is unsure about are dropped rather than guessed at —
# a missing number is visible to the user, a misread one is not.
MIN_WORD_CONFIDENCE = 40

# "Uniform block of text": best for invoice tables; the default page
# segmentation tends to reorder columns.
TESSERACT_CONFIG = "--psm 6"

# A pdf page with fewer words than this has no usable text layer.
MIN_WORDS_FOR_TEXT_PAGE = 5

# Per-page cap so a large scan cannot hold the request open.
OCR_TIMEOUT_SECONDS = 40


# Ruled table borders are read as stray glyphs ("|", "_", "=") that would split
# or poison a row. They are never meaningful text on an invoice, so they are
# removed. (A lone "-" is kept: it is a bullet on some invoices.)
BORDER_GLYPHS = "|¦_=~"


def clean_ocr_text(text: str) -> str:
    return text.strip().strip(BORDER_GLYPHS).strip()


def needs_ocr(word_count: int) -> bool:
    return word_count < MIN_WORDS_FOR_TEXT_PAGE


def ocr_words(image, dpi: int = OCR_DPI) -> tuple[list[dict], float]:
    """Returns (words in PDF points, mean confidence 0-100) for one page image."""
    data = pytesseract.image_to_data(
        image,
        lang=OCR_LANGS,
        config=TESSERACT_CONFIG,
        output_type=Output.DICT,
        timeout=OCR_TIMEOUT_SECONDS,
    )
    scale = 72.0 / dpi
    words: list[dict] = []
    confidences: list[float] = []

    for i, raw in enumerate(data["text"]):
        text = clean_ocr_text(raw or "")
        confidence = float(data["conf"][i])
        if not text or confidence < MIN_WORD_CONFIDENCE:
            continue
        left, top = data["left"][i], data["top"][i]
        words.append(
            {
                "text": text,
                "x0": left * scale,
                "x1": (left + data["width"][i]) * scale,
                "top": top * scale,
                "bottom": (top + data["height"][i]) * scale,
            }
        )
        confidences.append(confidence)

    mean = sum(confidences) / len(confidences) if confidences else 0.0
    return words, mean

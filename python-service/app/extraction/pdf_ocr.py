"""OCR for scanned (image-only) PDF pages.

Output words use the same shape as pdfplumber's (`text`, `x0`, `x1`, `top`,
`bottom`, in PDF points), so scanned pages flow through exactly the same
line-grouping and field-mapping code as text PDFs.
"""

import os
import re

import pytesseract
from PIL import Image, ImageOps
from pytesseract import Output

# Tesseract language(s). Only "eng" ships with the Docker image; install more
# traineddata packs (e.g. khm) and set OCR_LANGS=eng+khm to use them.
OCR_LANGS = os.environ.get("OCR_LANGS", "eng")

# Rasterise at 300 dpi: the usual sweet spot for printed business documents.
OCR_DPI = 300

# Words Tesseract itself is unsure about are dropped rather than guessed at —
# a missing number is visible to the user, a misread one is not.
MIN_WORD_CONFIDENCE = 40

# "Single column of text of variable sizes". Measured on scans of real invoices
# (see docs/ARCHITECTURE.md) it recovered clearly more table rows than the
# "uniform block" mode (22 vs 18 of 24) without admitting wrong values.
TESSERACT_CONFIG = "--psm 4"

# Contrast stretching must never clip the dark end: ink is a tiny share of a page
# (well under 1% of pixels on a short document), so a symmetric cutoff treats the
# text itself as noise and washes it out. Only the bright end (paper) is trimmed.
BRIGHT_ONLY_CUTOFF = (0, 1)

# Pages scanned slightly crooked are straightened before OCR. Skew is searched
# within this many degrees; smaller tilts than MIN_SKEW_DEGREES are left alone.
MAX_SKEW_DEGREES = 5.0
MIN_SKEW_DEGREES = 0.3

# A pdf page with fewer words than this has no usable text layer.
MIN_WORDS_FOR_TEXT_PAGE = 5

# Per-page cap so a large scan cannot hold the request open.
OCR_TIMEOUT_SECONDS = 40


# Ruled table borders are read as stray glyphs ("|", "_", "=") that would split
# or poison a row. They are never meaningful text on an invoice, so they are
# removed. (A lone "-" is kept: it is a bullet on some invoices.)
BORDER_GLYPHS = "|¦_=~"


NUMBER_WITH_BORDER = re.compile(r"[$€£]?[\d][\d.,]*\]")


def clean_ocr_text(text: str) -> str:
    """Fixes the two systematic OCR confusions seen on invoices, nothing else.

    - a lone "§" is a dollar sign ("§ 25.00" for "$ 25.00"); an invoice never
      uses a section sign, and the digits that follow are left exactly as read;
    - a "]" stuck to the end of a number ("0.25]") is the table border.
    Characters inside words, and the digits themselves, are never altered.
    """
    cleaned = text.strip().strip(BORDER_GLYPHS).strip()
    if cleaned == "§":
        return "$"
    if NUMBER_WITH_BORDER.fullmatch(cleaned):
        return cleaned[:-1]
    return cleaned


def _row_sharpness(gray: Image.Image, angle: float) -> float:
    """Variance of the row-wise mean brightness: highest when text lines are horizontal."""
    rotated = gray.rotate(angle, resample=Image.BILINEAR, fillcolor=255)
    rows = rotated.resize((1, rotated.height), Image.BOX)
    values = list(rows.get_flattened_data() if hasattr(rows, "get_flattened_data") else rows.getdata())
    mean = sum(values) / len(values)
    return sum((v - mean) ** 2 for v in values) / len(values)


def estimate_skew(gray: Image.Image) -> float:
    """Tilt in degrees (counter-clockwise positive) that makes text lines horizontal.

    Projection-profile search on a small copy: coarse steps over the allowed
    range, then a fine search around the best coarse angle.
    """
    scale = 600 / max(gray.size)
    small = gray.resize((max(1, int(gray.width * scale)), max(1, int(gray.height * scale))), Image.BILINEAR)
    small = ImageOps.autocontrast(small, cutoff=BRIGHT_ONLY_CUTOFF).point(lambda p: 255 if p > 160 else 0)

    coarse = [a / 2 for a in range(int(-2 * MAX_SKEW_DEGREES), int(2 * MAX_SKEW_DEGREES) + 1)]
    best = max(coarse, key=lambda a: _row_sharpness(small, a))
    fine = [best + d / 10 for d in range(-4, 5)]
    return max(fine, key=lambda a: _row_sharpness(small, a))


def preprocess(image: Image.Image) -> Image.Image:
    """Greyscale, stretch contrast and straighten a page image before OCR."""
    gray = ImageOps.autocontrast(image.convert("L"), cutoff=BRIGHT_ONLY_CUTOFF)
    angle = estimate_skew(gray)
    if abs(angle) >= MIN_SKEW_DEGREES:
        gray = gray.rotate(angle, resample=Image.BICUBIC, fillcolor=255)
    return gray


def needs_ocr(word_count: int) -> bool:
    return word_count < MIN_WORDS_FOR_TEXT_PAGE


def ocr_words(image, dpi: int = OCR_DPI) -> tuple[list[dict], float]:
    """Returns (words in PDF points, mean confidence 0-100) for one page image."""
    data = pytesseract.image_to_data(
        preprocess(image),
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

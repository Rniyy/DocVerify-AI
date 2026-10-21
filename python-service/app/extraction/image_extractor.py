from PIL import Image, ImageOps

from app.extraction.pdf_layout import words_to_lines
from app.extraction.pdf_ocr import ocr_words

# Coordinates are reported in "A4 points" whatever the image's pixel size or
# DPI (photos carry neither reliably), so the mapper's position tolerances mean
# the same thing for a phone photo and a flatbed scan.
A4_WIDTH_INCHES = 8.27

# Tesseract reads small text poorly below roughly 200 dpi at A4 width.
MIN_OCR_WIDTH_PX = 2000


def extract_image(path: str) -> dict:
    """Runs OCR on a JPG/PNG and returns text plus positioned lines.

    A photo or scan of a shipping document is read through the same pipeline
    as a scanned PDF page (Stage 27): contrast and skew clean-up, confidence
    filtering, and lines rebuilt from word positions, so the layout mapper can
    read table rows and totals. `text` is those lines joined, for the plain
    label/value mapper.
    """
    image = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    if image.width < MIN_OCR_WIDTH_PX:
        factor = MIN_OCR_WIDTH_PX / image.width
        image = image.resize((MIN_OCR_WIDTH_PX, round(image.height * factor)), Image.LANCZOS)

    words, confidence = ocr_words(image, dpi=image.width / A4_WIDTH_INCHES)
    lines = words_to_lines(words, page_number=1)
    return {
        "type": "image",
        "text": "\n".join(line["text"] for line in lines).strip(),
        "lines": lines,
        "ocr": True,
        "ocrConfidence": round(confidence, 1) if words else None,
    }

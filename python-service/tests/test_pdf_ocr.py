import shutil

import pytest
from PIL import Image, ImageDraw, ImageFont

from app.extraction import pdf_layout
from app.extraction.pdf_layout import extract_pdf_layout
from app.extraction.pdf_ocr import clean_ocr_text, needs_ocr

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
needs_tesseract = pytest.mark.skipif(
    shutil.which("tesseract") is None, reason="tesseract is not installed"
)


def test_needs_ocr_only_when_the_page_has_no_text_layer():
    assert needs_ocr(0)
    assert needs_ocr(4)
    assert not needs_ocr(5)
    assert not needs_ocr(300)


def test_table_border_glyphs_are_removed_but_bullets_and_decimals_survive():
    assert clean_ocr_text("|") == ""
    assert clean_ocr_text("17.00|") == "17.00"
    assert clean_ocr_text("_TOTAL_") == "TOTAL"
    assert clean_ocr_text("-") == "-"
    assert clean_ocr_text("12.50") == "12.50"


def scanned_invoice_pdf(path, pages=1):
    """An image-only PDF (no text layer): an invoice rendered as a picture."""
    font = ImageFont.truetype(FONT, 34)
    images = []
    for _ in range(pages):
        img = Image.new("RGB", (1654, 2339), "white")  # A4 at 200 dpi
        draw = ImageDraw.Draw(img)
        rows = [
            (200, "TAX INVOICE"),
            (300, "Invoice No: INV-0042"),
            (360, "Date: 15-Oct-2026"),
            (520, "No Description Qty Unit Price Amount"),
            (600, "1 Customs clearance 2 $ 25.00 $ 50.00"),
            (680, "2 Handling fee 1 $ 40.00 $ 40.00"),
            (900, "Sub Total $ 90.00"),
            (960, "VAT 10% $ 9.00"),
            (1020, "Grand Total $ 99.00"),
        ]
        for y, text in rows:
            draw.text((150, y), text, fill="black", font=font)
        images.append(img)
    images[0].save(path, "PDF", resolution=200, save_all=True, append_images=images[1:])


@needs_tesseract
def test_scanned_pdf_is_read_with_ocr_into_normal_layout_lines(tmp_path):
    pdf = tmp_path / "scan.pdf"
    scanned_invoice_pdf(pdf)

    result = extract_pdf_layout(str(pdf))

    assert result["ocr"] is True
    assert result["ocrPages"] == [1]
    assert result["ocrConfidence"] and result["ocrConfidence"] > 60
    texts = [line["text"] for line in result["lines"]]
    assert any("INV-0042" in t for t in texts)
    assert any(t.startswith("Grand Total") and "99.00" in t for t in texts)
    # Same shape as a text PDF: words carry PDF-point x edges for the mapper.
    words = result["lines"][0]["words"]
    assert {"text", "x0", "x1"} <= set(words[0])
    assert 0 < words[0]["x1"] < 612


@needs_tesseract
def test_ocr_is_limited_to_a_few_pages_and_the_rest_are_reported(tmp_path, monkeypatch):
    pdf = tmp_path / "long_scan.pdf"
    scanned_invoice_pdf(pdf, pages=3)
    monkeypatch.setattr(pdf_layout, "MAX_OCR_PAGES", 1)

    result = extract_pdf_layout(str(pdf))

    assert result["ocrPages"] == [1]
    assert result["ocrSkippedPages"] == [2, 3]
    assert {line["page"] for line in result["lines"]} == {1}


def test_a_blank_scan_returns_empty_but_flagged_result(tmp_path, monkeypatch):
    # No tesseract needed: stub the OCR step to "found nothing".
    pdf = tmp_path / "blank.pdf"
    Image.new("RGB", (800, 1000), "white").save(pdf, "PDF", resolution=100)
    monkeypatch.setattr(pdf_layout, "ocr_words", lambda image, dpi: ([], 0.0))

    result = extract_pdf_layout(str(pdf))

    assert result["ocr"] is True
    assert result["lines"] == []
    assert result["ocrConfidence"] is None

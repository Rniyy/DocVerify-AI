import shutil

import pytest
from PIL import Image, ImageDraw, ImageFont

from app.extraction import pdf_layout
from app.extraction.pdf_layout import extract_pdf_layout
from app.extraction.image_extractor import extract_image
from app.extraction.pdf_ocr import clean_ocr_text, estimate_skew, needs_ocr, preprocess

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


def test_systematic_ocr_confusions_are_fixed_and_nothing_else_is_touched():
    assert clean_ocr_text("§") == "$"  # "§ 25.00" is "$ 25.00"
    assert clean_ocr_text("0.25]") == "0.25"  # table border stuck to a number
    assert clean_ocr_text("$25.00]") == "$25.00"
    # digits and words are never altered, and a section sign inside text stays
    assert clean_ocr_text("§5") == "§5"
    assert clean_ocr_text("[ABC]") == "[ABC]"
    assert clean_ocr_text("(92cartons)") == "(92cartons)"


def text_page(width=1654, height=2339):
    img = Image.new("L", (width, height), 255)
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT, 34)
    for i in range(30):
        draw.text((150, 150 + i * 60), f"Line {i} description qty 2 $ 25.00 $ 50.00", fill=0, font=font)
    return img


@pytest.mark.parametrize("tilt", [0.0, 1.5, -2.5, 4.0])
def test_skew_is_estimated_within_a_third_of_a_degree(tilt):
    page = text_page().rotate(tilt, resample=Image.BICUBIC, fillcolor=255)
    # the estimate is the correction to apply: the opposite of the tilt
    assert abs(estimate_skew(page) + tilt) <= 0.3


def test_straight_pages_are_not_rotated():
    page = text_page()
    assert preprocess(page).size == page.size
    assert estimate_skew(page) == 0.0


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


def invoice_image(width=1654):
    img = Image.new("RGB", (1654, 2339), "white")
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT, 34)
    for y, text in [
        (300, "Invoice No: INV-0042"),
        (520, "No Description Qty Unit Price Amount"),
        (600, "1 Customs clearance 2 $ 25.00 $ 50.00"),
        (900, "Grand Total $ 50.00"),
    ]:
        draw.text((150, y), text, fill="black", font=font)
    return img if width == 1654 else img.resize((width, round(2339 * width / 1654)))


@needs_tesseract
def test_photo_of_an_invoice_is_read_into_positioned_lines(tmp_path):
    path = tmp_path / "photo.jpg"
    invoice_image().rotate(1.5, resample=Image.BICUBIC, fillcolor=(255, 255, 255)).save(path, quality=70)

    result = extract_image(str(path))

    assert result["type"] == "image" and result["ocr"] is True
    assert "INV-0042" in result["text"]
    assert any(line["text"].startswith("1 Customs clearance") and "50.00" in line["text"] for line in result["lines"])
    # positions are reported in A4 points whatever the pixel size
    assert all(0 < w["x1"] <= 595 for line in result["lines"] for w in line["words"])


@needs_tesseract
def test_small_images_are_enlarged_before_ocr(tmp_path):
    path = tmp_path / "small.png"
    invoice_image(width=1000).save(path)
    result = extract_image(str(path))
    assert "INV-0042" in result["text"]
    assert all(w["x1"] <= 595 for line in result["lines"] for w in line["words"])


def test_preprocessing_keeps_a_sparse_pages_ink_dark():
    # A short document: ink is a tiny fraction of the pixels. A symmetric contrast
    # cutoff once washed it out entirely, so nothing could be read.
    page = Image.new("L", (1000, 1400), 255)
    ImageDraw.Draw(page).text((100, 100), "TOTAL $ 50.00", fill=0, font=ImageFont.truetype(FONT, 40))
    assert min(preprocess(page).getdata()) == 0

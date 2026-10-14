import glob
import os

import pytest
from fastapi.testclient import TestClient

from app.extraction.pdf_layout import drop_overlapped_spaces, group_words_into_lines
from app.main import app


def word(text, x0, top, height=10):
    return {"text": text, "x0": x0, "x1": x0 + 5 * len(text), "top": top, "bottom": top + height}


def test_words_on_one_visual_line_are_joined_left_to_right():
    # Stream order is scrambled (value before label) and baselines jitter by 2pt.
    words = [word("$", 200, 102), word("55.00", 210, 100), word("TOTAL:", 100, 101)]
    (line,) = group_words_into_lines(words)
    assert " ".join(w["text"] for w in line) == "TOTAL: $ 55.00"


def test_distant_rows_stay_separate_and_ordered_top_to_bottom():
    words = [word("second", 10, 60), word("first", 10, 20), word("third", 10, 100)]
    lines = group_words_into_lines(words)
    assert [l[0]["text"] for l in lines] == ["first", "second", "third"]


def test_empty_page_gives_no_lines():
    assert group_words_into_lines([]) == []


def glyph(text, x0, width=4.14, top=100, bottom=107):
    return {"text": text, "x0": x0, "x1": x0 + width, "top": top, "bottom": bottom}


def test_space_overlapping_a_digit_is_dropped_so_the_amount_stays_whole():
    # Real INV-0610 geometry: a space at x=542.2 sits inside the "1" spanning 541.8-545.9.
    chars = [glyph("1", 541.8), glyph(" ", 542.2, width=2.1), glyph("1", 546.0), glyph(".", 550.2, 2.07), glyph("8", 552.3), glyph("0", 556.5)]
    kept = drop_overlapped_spaces(chars)
    assert "".join(c["text"] for c in kept) == "11.80"


def test_real_spaces_with_visible_room_are_kept():
    chars = [glyph("$", 490), glyph(" ", 495, width=2.1), glyph("5", 500), glyph("0", 504.2)]
    assert [c["text"] for c in drop_overlapped_spaces(chars)] == ["$", " ", "5", "0"]


def test_leading_padding_spaces_before_an_amount_are_kept():
    chars = [glyph(" ", 530.6, 2.1), glyph(" ", 532.8, 2.1), glyph("1", 541.8)]
    assert len(drop_overlapped_spaces(chars)) == 3


SAMPLES = glob.glob(os.environ.get("DOCVERIFY_SAMPLES", "/nonexistent") + "/*INV-0310_VTL.pdf")


@pytest.mark.skipif(not SAMPLES, reason="set DOCVERIFY_SAMPLES to a folder with the sample invoices")
def test_real_invoice_row_is_rebuilt_on_one_line_via_the_http_endpoint():
    client = TestClient(app)
    with open(SAMPLES[0], "rb") as fh:
        res = client.post("/extract?layout=true", files={"file": ("INV-0310_VTL.pdf", fh, "application/pdf")})
    assert res.status_code == 200
    body = res.json()
    assert body["type"] == "pdf" and body["pageCount"] == 1
    assert any("1 $ 50.00 $ 50.00" in line["text"] for line in body["lines"])
    assert all("$ 1 1.80" not in line["text"] for line in body["lines"])
    assert all({"page", "y", "text", "words"} <= set(line) for line in body["lines"])


def test_default_extract_still_rejects_pdf_so_existing_behaviour_is_unchanged():
    client = TestClient(app)
    res = client.post("/extract", files={"file": ("a.pdf", b"%PDF-1.4", "application/pdf")})
    assert res.status_code == 400


MINEBEA = glob.glob(os.environ.get("DOCVERIFY_SAMPLES", "/nonexistent") + "/*INV-0610_MINEBEA.pdf")


@pytest.mark.skipif(not MINEBEA, reason="set DOCVERIFY_SAMPLES to a folder with the sample invoices")
def test_real_minebea_invoice_amounts_are_not_split_by_a_stray_space():
    from app.extraction.pdf_layout import extract_pdf_layout

    text = extract_pdf_layout(MINEBEA[0])["text"]
    assert "$ 11.80" in text and "$ 129.80" in text
    assert "$ 1 1.80" not in text and "$ 1 29.80" not in text

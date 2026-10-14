import glob
import os

import pytest
from fastapi.testclient import TestClient

from app.extraction.pdf_layout import group_words_into_lines
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
    assert all({"page", "y", "text", "words"} <= set(line) for line in body["lines"])


def test_default_extract_still_rejects_pdf_so_existing_behaviour_is_unchanged():
    client = TestClient(app)
    res = client.post("/extract", files={"file": ("a.pdf", b"%PDF-1.4", "application/pdf")})
    assert res.status_code == 400

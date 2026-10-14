import pdfplumber

# Words whose vertical centres are within this many points are treated as
# sitting on the same visual line. Generous enough for baseline jitter between
# Latin and Khmer glyphs, small enough not to merge neighbouring rows.
LINE_TOLERANCE = 3.0

# Safety valve for very long documents: the mapper only needs invoice-sized input.
MAX_PAGES = 10


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

    Returns {"type": "pdf", "pageCount", "text", "lines": [{"page", "y", "text",
    "words": [{"text", "x0", "x1"}]}]}. `text` is the lines joined with newlines,
    a drop-in replacement for the plain text extraction.
    """
    lines: list[dict] = []

    with pdfplumber.open(path) as pdf:
        page_count = len(pdf.pages)
        for page_number, page in enumerate(pdf.pages[:MAX_PAGES], start=1):
            words = page.extract_words(x_tolerance=2, y_tolerance=3)
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
    }

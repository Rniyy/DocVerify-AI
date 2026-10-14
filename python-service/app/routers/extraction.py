import os
import pathlib
import tempfile

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.extraction.docx_extractor import extract_docx
from app.extraction.image_extractor import extract_image
from app.extraction.pdf_layout import extract_pdf_layout

router = APIRouter()

HANDLERS = {
    "docx": extract_docx,
    "jpg": extract_image,
    "jpeg": extract_image,
    "png": extract_image,
}

# Opt-in handler: the Node backend asks for it explicitly, so /extract's
# original behaviour (docx + images only) is unchanged for existing callers.
LAYOUT_HANDLERS = {"pdf": extract_pdf_layout}


@router.post("")
async def extract(file: UploadFile = File(...), layout: bool = False):
    extension = pathlib.Path(file.filename or "").suffix.lstrip(".").lower()
    handler = (LAYOUT_HANDLERS if layout else HANDLERS).get(extension)

    if handler is None:
        raise HTTPException(
            status_code=400,
            detail=f'Unsupported file type ".{extension}". This service handles: {", ".join(sorted(set(LAYOUT_HANDLERS if layout else HANDLERS)))}.',
        )

    contents = await file.read()
    with tempfile.NamedTemporaryFile(delete=False, suffix=f".{extension}") as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        return handler(tmp_path)
    except Exception as exc:  # noqa: BLE001 — surface as a clean 500 to the caller
        raise HTTPException(status_code=500, detail=f"Failed to extract file contents: {exc}") from exc
    finally:
        os.unlink(tmp_path)

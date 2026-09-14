import os
import pathlib
import tempfile

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.extraction.docx_extractor import extract_docx
from app.extraction.image_extractor import extract_image

router = APIRouter()

HANDLERS = {
    "docx": extract_docx,
    "jpg": extract_image,
    "jpeg": extract_image,
    "png": extract_image,
}


@router.post("")
async def extract(file: UploadFile = File(...)):
    extension = pathlib.Path(file.filename or "").suffix.lstrip(".").lower()
    handler = HANDLERS.get(extension)

    if handler is None:
        raise HTTPException(
            status_code=400,
            detail=f'Unsupported file type ".{extension}". This service handles: {", ".join(sorted(set(HANDLERS)))}.',
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

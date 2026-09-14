from PIL import Image
import pytesseract


def extract_image(path: str) -> dict:
    """Runs OCR on a JPG/PNG and returns the recognized text.

    This is where scanned invoices/photos of shipping documents get turned
    into text a downstream field-mapper can read — no OCR was possible in
    the Node/TypeScript side, which is exactly why this belongs here.
    """
    image = Image.open(path)
    text = pytesseract.image_to_string(image)
    return {"type": "image", "text": text.strip()}

FROM python:3.11-slim
WORKDIR /app

# tesseract-ocr is the system binary pytesseract shells out to (Stage 10) —
# without it, image/OCR extraction fails even with the pip package installed.
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

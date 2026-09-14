from fastapi import FastAPI

from app.routers.extraction import router as extraction_router

app = FastAPI(title="AI Document Comparison Assistant — Python Service")

app.include_router(extraction_router, prefix="/extract")


@app.get("/health")
def health():
    return {"status": "ok", "service": "python-extraction-service"}

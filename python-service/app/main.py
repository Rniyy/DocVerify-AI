from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI  # noqa: E402

from app.routers.ai import router as ai_router  # noqa: E402
from app.routers.extraction import router as extraction_router  # noqa: E402

app = FastAPI(title="AI Document Comparison Assistant — Python Service")

app.include_router(extraction_router, prefix="/extract")
app.include_router(ai_router, prefix="/ai")


@app.get("/health")
def health():
    return {"status": "ok", "service": "python-extraction-service"}

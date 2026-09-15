from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.ai.explainer import explain_discrepancy
from app.ai.semantic_matcher import compare_descriptions_semantically

router = APIRouter()


class SemanticCompareRequest(BaseModel):
    field: str
    values: list[str]


class ExplainRequest(BaseModel):
    field: str
    documentNames: list[str]
    values: list
    difference: Optional[str] = None
    kind: str  # "mismatch" | "calculation"
    rule: Optional[str] = None
    expected: Optional[float] = None
    actual: Optional[float] = None


@router.post("/semantic-compare")
def semantic_compare(payload: SemanticCompareRequest):
    try:
        return compare_descriptions_semantically(payload.values)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 — surface any SDK/API error cleanly
        raise HTTPException(status_code=502, detail=f"AI semantic comparison failed: {exc}") from exc


@router.post("/explain")
def explain(payload: ExplainRequest):
    try:
        explanation = explain_discrepancy(payload.model_dump(exclude_none=True))
        return {"explanation": explanation}
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"AI explanation failed: {exc}") from exc

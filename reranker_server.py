from __future__ import annotations

import os
from typing import List

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator
from sentence_transformers import CrossEncoder


MODEL_NAME = os.getenv("RERANKER_MODEL", "BAAI/bge-reranker-v2-m3")
MAX_LENGTH = int(os.getenv("RERANKER_MAX_LENGTH", "512"))
HOST = os.getenv("RERANKER_HOST", "0.0.0.0")
PORT = int(os.getenv("RERANKER_PORT", "8008"))

app = FastAPI(title="Reranker API", version="1.0.0")
model = CrossEncoder(MODEL_NAME, max_length=MAX_LENGTH)


class RerankRequest(BaseModel):
    # 批量文本对: [[query, candidate], ...]
    pairs: List[List[str]] = Field(..., min_length=1, description="Text pairs for scoring")

    @field_validator("pairs")
    @classmethod
    def validate_pairs(cls, value: List[List[str]]) -> List[List[str]]:
        for index, pair in enumerate(value):
            if len(pair) != 2:
                raise ValueError(f"pairs[{index}] must contain exactly 2 strings: [query, candidate]")
            if not isinstance(pair[0], str) or not isinstance(pair[1], str):
                raise ValueError(f"pairs[{index}] must be [str, str]")
        return value


class RerankResponse(BaseModel):
    scores: List[float]


@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True, "model": MODEL_NAME, "max_length": MAX_LENGTH}


@app.post("/rerank", response_model=RerankResponse)
def rerank(req: RerankRequest) -> RerankResponse:
    try:
        scores = model.predict(req.pairs)
        return RerankResponse(scores=[float(score) for score in scores.tolist()])
    except Exception as error:  # pragma: no cover - runtime/model errors
        raise HTTPException(status_code=500, detail=f"rerank failed: {error}") from error


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=HOST, port=PORT)

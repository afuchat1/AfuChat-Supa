"""AfuSearch real vision-language embedding service.

Loads a pretrained OpenCLIP model and emits normalized 512-dimensional vectors.
This service does not store images, captions, or user data. Protect it behind a
private network or gateway and set AFUSEARCH_INFERENCE_KEY before deployment.
"""
from __future__ import annotations

import io
import os
import secrets
from contextlib import asynccontextmanager
from typing import Any

import open_clip
import torch
from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field

MODEL_NAME = os.getenv("AFUSEARCH_MODEL", "ViT-B-32")
PRETRAINED = os.getenv("AFUSEARCH_PRETRAINED", "laion2b_s34b_b79k")
API_KEY = os.getenv("AFUSEARCH_INFERENCE_KEY", "")
MAX_IMAGE_BYTES = int(os.getenv("AFUSEARCH_MAX_IMAGE_BYTES", str(8 * 1024 * 1024)))
MAX_PIXELS = int(os.getenv("AFUSEARCH_MAX_PIXELS", "24000000"))
DEVICE = "cuda" if torch.cuda.is_available() and os.getenv("AFUSEARCH_DEVICE", "auto") != "cpu" else "cpu"

model: Any = None
preprocess: Any = None
tokenizer: Any = None
model_device: str = DEVICE
model_version = f"open_clip:{MODEL_NAME}:{PRETRAINED}"


@asynccontextmanager
async def lifespan(_: FastAPI):
    global model, preprocess, tokenizer, model_device
    model, _, preprocess = open_clip.create_model_and_transforms(
        MODEL_NAME, pretrained=PRETRAINED, device=DEVICE
    )
    tokenizer = open_clip.get_tokenizer(MODEL_NAME)
    model.eval()
    model_device = DEVICE
    yield
    model = None
    preprocess = None
    tokenizer = None


app = FastAPI(
    title="AfuSearch Vision Retrieval",
    version="1.0.0",
    description="Private OpenCLIP embedding service for AfuSearch hybrid retrieval.",
    docs_url=None,
    redoc_url=None,
    lifespan=lifespan,
)


async def require_key(x_afusearch_key: str | None = Header(default=None)) -> None:
    if not API_KEY:
        raise HTTPException(status_code=503, detail="Inference service authentication is not configured")
    if not x_afusearch_key or not secrets.compare_digest(x_afusearch_key, API_KEY):
        raise HTTPException(status_code=401, detail="Unauthorized")


class TextEmbeddingRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


def normalized(vector: torch.Tensor) -> list[float]:
    vector = vector / vector.norm(dim=-1, keepdim=True).clamp(min=1e-12)
    return [round(float(value), 8) for value in vector[0].detach().cpu().tolist()]


def image_from_bytes(raw: bytes) -> Image.Image:
    try:
        with Image.open(io.BytesIO(raw)) as source:
            width, height = source.size
            if width < 1 or height < 1 or width * height > MAX_PIXELS:
                raise HTTPException(status_code=413, detail="Image dimensions exceed the supported limit")
            source = ImageOps.exif_transpose(source)
            return source.convert("RGB").copy()
    except UnidentifiedImageError as exc:
        raise HTTPException(status_code=415, detail="Unsupported or invalid image") from exc
    except (OSError, Image.DecompressionBombError) as exc:
        raise HTTPException(status_code=415, detail="Image could not be decoded safely") from exc


@app.get("/healthz")
async def healthz():
    return {
        "status": "ready" if model is not None else "loading",
        "model": model_version,
        "device": model_device,
        "embedding_dimensions": 512,
    }


@app.post("/v1/embed/image", dependencies=[Depends(require_key)])
async def embed_image(file: UploadFile = File(...)):
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail="Upload a JPEG, PNG, or WebP image")
    raw = await file.read(MAX_IMAGE_BYTES + 1)
    if not raw:
        raise HTTPException(status_code=400, detail="Image is empty")
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the 8 MB limit")
    if model is None or preprocess is None:
        raise HTTPException(status_code=503, detail="Vision model is loading")
    image = image_from_bytes(raw)
    tensor = preprocess(image).unsqueeze(0).to(model_device)
    with torch.inference_mode():
        vector = model.encode_image(tensor)
    return {
        "embedding": normalized(vector),
        "dimensions": int(vector.shape[-1]),
        "model": model_version,
        "normalized": True,
    }


@app.post("/v1/embed/text", dependencies=[Depends(require_key)])
async def embed_text(payload: TextEmbeddingRequest):
    if model is None or tokenizer is None:
        raise HTTPException(status_code=503, detail="Vision model is loading")
    tokens = tokenizer([payload.text]).to(model_device)
    with torch.inference_mode():
        vector = model.encode_text(tokens)
    return {
        "embedding": normalized(vector),
        "dimensions": int(vector.shape[-1]),
        "model": model_version,
        "normalized": True,
    }

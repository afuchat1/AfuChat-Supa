# AfuSearch Vision Retrieval Service

Private inference service for AfuSearch's learned visual and text-to-image retrieval. It uses a real pretrained OpenCLIP model and returns normalized 512-dimensional embeddings. It does not retain uploaded images.

## Architecture

- `POST /v1/embed/image`: JPEG, PNG, or WebP image bytes -> normalized image embedding.
- `POST /v1/embed/text`: query/OCR text -> embedding in the same OpenCLIP space.
- `GET /healthz`: readiness and model version.
- Supabase stores image vectors and uses pgvector HNSW cosine search.
- Existing dHash and OCR retrieval remain complementary candidate generators.

The Edge Function calls this service only when both `AFUSEARCH_VISION_URL` and `AFUSEARCH_VISION_KEY` are configured. If the service is absent or unavailable, the existing dHash/OCR paths remain usable.

## Run locally

Python 3.11 is recommended. Install dependencies and set a strong private key:

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
export AFUSEARCH_INFERENCE_KEY='replace-with-a-long-random-secret'
uvicorn app:app --host 127.0.0.1 --port 8080 --workers 1
```

The first start downloads pretrained model weights. Keep the service behind a private network, service gateway, or TLS reverse proxy; do not expose an unauthenticated inference endpoint to the public internet.

## Container deployment

```bash
docker build -t afusearch-vision services/afusearch-vision
docker run --rm -p 8080:8080 \
  -e AFUSEARCH_INFERENCE_KEY='replace-with-a-long-random-secret' \
  afusearch-vision
```

The model is downloaded on first startup and needs network access and sufficient memory. CPU inference works but may be slower; a compatible CUDA runtime can be configured for GPU hosting.

## Required configuration

Set these Supabase Edge Function secrets after deploying the service:

- `AFUSEARCH_VISION_URL`: private HTTPS base URL for the inference service, without a trailing slash.
- `AFUSEARCH_VISION_KEY`: same secret as `AFUSEARCH_INFERENCE_KEY`.

Do not commit either secret. Rotate the key if it is exposed.

## Database and rollout

1. Review and apply `artifacts/mobile/supabase/migrations/20261022000000_afusearch_vector_retrieval.sql`.
2. Deploy this service and confirm `/healthz` reports `status=ready`.
3. Set the Edge Function secrets and deploy `visual-image-search`.
4. Run an authorized end-to-end search with an image already in the public index.
5. Verify that embedding rows are populated and semantic/near-duplicate results are returned. Backfill existing images gradually; do not trigger a full synchronous corpus reindex on a user request.
6. Compare retrieval quality and latency against a labeled image/query set before enabling the feature broadly.

## Production caveats

- The current integration creates embeddings during image-index warmup and on query. This is an initial vertical slice, not yet a dedicated durable background queue. Large-scale deployment should move ingestion into a retryable worker queue and batch inference.
- The current HNSW function returns candidates above a configurable cosine-similarity threshold. Tune that threshold from measured recall/precision, not guesswork.
- The default model is `ViT-B-32 / laion2b_s34b_b79k`. Validate model-card terms, intended use, data handling, latency, and accuracy before production use. Store the exact model version and re-embed consistently when changing models.
- OCR language support is currently inherited from the existing OCR implementation; multi-language OCR and per-language retrieval evaluation remain follow-up work.
- Object detection and region-level embeddings are a separate extension point and are not falsely represented as implemented by this service yet.
- The repository change has not been deployed or end-to-end tested against the production Supabase project.

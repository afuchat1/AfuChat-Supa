# AfuSearch OCR Worker

Cloudflare Workers AI-backed text extraction for AfuSearch image search.

## Runtime configuration

- Worker name: `afusearch-ocr`
- AI binding: `AI`
- Model: `@cf/llava-hf/llava-1.5-7b-hf`
- Supabase URL and publishable key are public client configuration and are supplied as Worker variables in `wrangler.toml`.
- Requests must include a valid signed-in Supabase user access token in the Authorization header.
- Accepts raw JPEG/PNG image bytes up to 3 MiB; returns `{ text, model }`.
- OCR output is capped at 5,000 characters. Failed inference returns HTTP 502.

## Deploy

From the repository root with Wrangler authenticated to the AfuChat Cloudflare account:

```sh
npx wrangler deploy --config services/afusearch-ocr/wrangler.toml
```

The Supabase `visual-image-search` Edge Function calls the deployed worker. The Worker must remain available at `https://afusearch-ocr.afuchatgroup.workers.dev` and keep the AI binding enabled.

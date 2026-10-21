# AfuSearch OCR Worker

Cloudflare Worker that runs Tesseract OCR through the portable Kreuzberg WASM runtime. This replaces vision-language captioning with actual OCR for text inside public AfuChat images.

## Runtime

- Worker: `afusearch-ocr`
- OCR backend: Tesseract WASM, English model
- Accepts raw JPEG, PNG, or WebP bytes up to 3 MiB
- Requires a valid signed-in Supabase user access token
- Returns only recognized text (up to 5,000 characters); errors fail closed
- Supabase URL and publishable key are public client configuration provided through Wrangler variables

## Deploy

From the repository root with Wrangler authenticated to the AfuChat Cloudflare account:

```sh
cd services/afusearch-ocr
npm install
npx wrangler deploy --config wrangler.toml
```

The Supabase `visual-image-search` Edge Function calls `https://afusearch-ocr.afuchatgroup.workers.dev`.

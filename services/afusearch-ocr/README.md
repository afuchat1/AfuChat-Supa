# AfuSearch OCR Worker

Cloudflare Worker running Tesseract OCR through WebAssembly. The worker receives decoded RGBA pixels from the Supabase Edge Function, so it does not depend on vision-language captioning or guess text from image descriptions.

## Runtime

- Worker: `afusearch-ocr`
- OCR engine: `tesseract-wasm@0.11.0`
- English recognition data: `tessdata_fast`
- Accepts RGBA pixel bytes plus width/height headers; maximum 8 megapixels
- Requires a valid signed-in Supabase user access token
- Returns recognized text only (up to 5,000 characters)
- WASM and language model binaries are cached per warm Worker isolate and fetched from pinned/known public asset locations

## Deploy

From the repository root with Wrangler authenticated to the AfuChat Cloudflare account:

```sh
cd services/afusearch-ocr
npm install
npx wrangler deploy --config wrangler.toml
```

The Supabase `visual-image-search` Edge Function calls `https://afusearch-ocr.afuchatgroup.workers.dev`.

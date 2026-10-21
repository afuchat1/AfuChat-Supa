import { createOCREngine, supportsFastBuild } from "tesseract-wasm";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/tesseract-wasm@0.11.0/dist";
const MODEL_URL = "https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_fast@main/eng.traineddata";
const MAX_PIXELS = 8_000_000;
const MAX_OCR_PIXELS = 1_500_000;
let wasmPromise;
let modelPromise;

async function fetchBinary(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`OCR asset fetch failed (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}

function loadWasm() {
  if (!wasmPromise) {
    const file = supportsFastBuild() ? "tesseract-core.wasm" : "tesseract-core-fallback.wasm";
    wasmPromise = fetchBinary(`${WASM_BASE}/${file}`).catch((error) => { wasmPromise = undefined; throw error; });
  }
  return wasmPromise;
}

function loadModel() {
  if (!modelPromise) modelPromise = fetchBinary(MODEL_URL).catch((error) => { modelPromise = undefined; throw error; });
  return modelPromise;
}


function resizeRgbaIfNeeded(source, width, height) {
  const pixelCount = width * height;
  if (pixelCount <= MAX_OCR_PIXELS) return { data: source, width, height, resized: false };
  const scale = Math.sqrt(MAX_OCR_PIXELS / pixelCount);
  const targetWidth = Math.max(1, Math.floor(width * scale));
  const targetHeight = Math.max(1, Math.floor(height * scale));
  const target = new Uint8Array(targetWidth * targetHeight * 4);
  // Bilinear resampling preserves text strokes better than dropping pixels.
  for (let y = 0; y < targetHeight; y++) {
    const sy = (y + 0.5) * height / targetHeight - 0.5;
    const y0 = Math.max(0, Math.floor(sy)), y1 = Math.min(height - 1, Math.max(0, Math.floor(sy) + 1));
    const fy = Math.max(0, sy - y0);
    for (let x = 0; x < targetWidth; x++) {
      const sx = (x + 0.5) * width / targetWidth - 0.5;
      const x0 = Math.max(0, Math.floor(sx)), x1 = Math.min(width - 1, Math.max(0, Math.floor(sx) + 1));
      const fx = Math.max(0, sx - x0);
      const a = (y0 * width + x0) * 4, b = (y0 * width + x1) * 4;
      const d = (y0 * width + x0) * 4, e = (y1 * width + x1) * 4;
      const out = (y * targetWidth + x) * 4;
      for (let ch = 0; ch < 4; ch++) {
        const top = source[a + ch] * (1 - fx) + source[b + ch] * fx;
        const bottom = source[d + ch] * (1 - fx) + source[e + ch] * fx;
        target[out + ch] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }
  return { data: target, width: targetWidth, height: targetHeight, resized: true };
}

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, content-type, x-image-width, x-image-height, x-image-mime-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });

    const authorization = request.headers.get("authorization") || "";
    if (!authorization.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
    }
    try {
      const authResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization },
      });
      if (!authResponse.ok) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
    } catch {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
    }

    let stage = "validate-image";
    try {
      let pixels = new Uint8Array(await request.arrayBuffer());
      const width = Number(request.headers.get("x-image-width"));
      const height = Number(request.headers.get("x-image-height"));
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
          width * height > MAX_PIXELS || pixels.length !== width * height * 4) {
        return new Response(JSON.stringify({ error: "Invalid RGBA image dimensions or size" }), { status: 400, headers: cors });
      }

      stage = "resize-image";
      const originalPixels = width * height;
      const image = resizeRgbaIfNeeded(pixels, width, height);
      pixels = image.data;
      stage = "fetch-assets";
      const [wasmBinary, model] = await Promise.all([loadWasm(), loadModel()]);
      console.log("[afusearch-ocr] assets loaded", { wasmBytes: wasmBinary.byteLength, modelBytes: model.byteLength, originalPixels, width: image.width, height: image.height, pixelBytes: pixels.byteLength, resized: image.resized });
      stage = "initialize-engine";
      const engine = await createOCREngine({ wasmBinary });
      try {
        stage = "load-model";
        engine.loadModel(model);
        stage = "load-image";
        engine.loadImage({ width: image.width, height: image.height, data: new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, pixels.byteLength) });
        stage = "recognize-text";
        const text = engine.getText().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ").trim().slice(0, 5000);
        console.log("[afusearch-ocr] OCR completed", { textLength: text.length, width: image.width, height: image.height });
        return new Response(JSON.stringify({ text, engine: "tesseract-wasm" }), { headers: cors });
      } finally {
        engine.destroy();
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("[afusearch-ocr] OCR failed", { stage: typeof stage === "string" ? stage : "unknown", detail });
      return new Response(JSON.stringify({ error: "OCR inference failed" }), { status: 502, headers: cors });
    }
  },
};

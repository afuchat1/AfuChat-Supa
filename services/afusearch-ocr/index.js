import { createOCREngine, supportsFastBuild } from "tesseract-wasm";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/tesseract-wasm@0.11.0/dist";
const MODEL_URL = "https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_fast@main/eng.traineddata";
const MAX_PIXELS = 8_000_000;
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
    wasmPromise = fetchBinary(`${WASM_BASE}/${file}`);
  }
  return wasmPromise;
}

function loadModel() {
  if (!modelPromise) modelPromise = fetchBinary(MODEL_URL);
  return modelPromise;
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

    try {
      const pixels = new Uint8Array(await request.arrayBuffer());
      const width = Number(request.headers.get("x-image-width"));
      const height = Number(request.headers.get("x-image-height"));
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
          width * height > MAX_PIXELS || pixels.length !== width * height * 4) {
        return new Response(JSON.stringify({ error: "Invalid RGBA image dimensions or size" }), { status: 400, headers: cors });
      }

      const [wasmBinary, model] = await Promise.all([loadWasm(), loadModel()]);
      const engine = await createOCREngine({ wasmBinary });
      try {
        engine.loadModel(model);
        engine.loadImage({ width, height, data: new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, pixels.byteLength) });
        const text = engine.getText().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ").trim().slice(0, 5000);
        return new Response(JSON.stringify({ text, engine: "tesseract-wasm" }), { headers: cors });
      } finally {
        engine.destroy();
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("[afusearch-ocr] OCR failed", detail);
      return new Response(JSON.stringify({ error: "OCR inference failed" }), { status: 502, headers: cors });
    }
  },
};

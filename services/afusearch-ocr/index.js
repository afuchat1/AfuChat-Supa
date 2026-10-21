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
      "Access-Control-Allow-Headers": "authorization, content-type, x-image-width, x-image-height, x-image-mime-type, x-ocr-test-secret",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });

    const testAuthorized = Boolean(env.OCR_TEST_SECRET) && request.headers.get("x-ocr-test-secret") === env.OCR_TEST_SECRET;
    const authorization = request.headers.get("authorization") || "";
    if (!testAuthorized) {
      if (!authorization.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
      try {
        const authResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
          headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization },
        });
        if (!authResponse.ok) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
      } catch {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
      }
    }

    try {
      let pixels;
      let width;
      let height;
      if (testAuthorized && (request.headers.get("content-type") || "").includes("application/json")) {
        const testBody = await request.json();
        if (typeof testBody.text === "string") {
          const glyphs = {
            A: ["01110","10001","10001","11111","10001","10001","10001"],
            F: ["11111","10000","10000","11110","10000","10000","10000"],
            U: ["10001","10001","10001","10001","10001","10001","01110"],
            C: ["01111","10000","10000","10000","10000","10000","01111"],
            H: ["10001","10001","10001","11111","10001","10001","10001"],
            T: ["11111","00100","00100","00100","00100","00100","00100"],
            " ": ["00000","00000","00000","00000","00000","00000","00000"],
          };
          const scale = 4;
          const chars = testBody.text.toUpperCase().slice(0, 20).split("");
          width = 24 + chars.length * 6 * scale;
          height = 24 + 7 * scale;
          pixels = new Uint8Array(width * height * 4);
          for (let i = 0; i < pixels.length; i += 4) {
            pixels[i] = 255; pixels[i + 1] = 255; pixels[i + 2] = 255; pixels[i + 3] = 255;
          }
          chars.forEach((char, index) => {
            const glyph = glyphs[char];
            if (!glyph) return;
            glyph.forEach((row, y) => {
              for (let x = 0; x < 5; x++) {
                if (row[x] !== "1") continue;
                for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
                  const px = 12 + index * 6 * scale + x * scale + sx;
                  const py = 12 + y * scale + sy;
                  const offset = (py * width + px) * 4;
                  pixels[offset] = 0; pixels[offset + 1] = 0; pixels[offset + 2] = 0; pixels[offset + 3] = 255;
                }
              }
            });
          });
        } else {
          if (typeof testBody.pixelsBase64 !== "string" || testBody.pixelsBase64.length > 500_000) {
            return new Response(JSON.stringify({ error: "Invalid test pixel payload" }), { status: 400, headers: cors });
          }
          const binary = atob(testBody.pixelsBase64);
          pixels = Uint8Array.from(binary, (char) => char.charCodeAt(0));
          width = Number(testBody.width);
          height = Number(testBody.height);
        }
      } else {
        pixels = new Uint8Array(await request.arrayBuffer());
        width = Number(request.headers.get("x-image-width"));
        height = Number(request.headers.get("x-image-height"));
      }
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
      return new Response(JSON.stringify({ error: testAuthorized ? detail : "OCR inference failed" }), { status: 502, headers: cors });
    }
  },
};

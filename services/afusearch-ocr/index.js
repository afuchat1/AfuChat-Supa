import { enableOcr, extractBytes, initWasm } from "@kreuzberg/wasm";

let ocrInitialization;

async function initializeOcr() {
  if (!ocrInitialization) {
    ocrInitialization = (async () => {
      await initWasm("https://cdn.jsdelivr.net/npm/@kreuzberg/wasm@4.10.2/dist/pkg/kreuzberg_wasm_bg.wasm");
      await enableOcr();
    })();
  }
  await ocrInitialization;
}

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, content-type, x-image-mime-type, x-ocr-test-secret",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });

    const authorization = request.headers.get("authorization") || "";
    const testAuthorized = Boolean(env.OCR_TEST_SECRET) && request.headers.get("x-ocr-test-secret") === env.OCR_TEST_SECRET;
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

      let bytes;
      let mimeType;
      if (testAuthorized && (request.headers.get("content-type") || "").includes("application/json")) {
        const testBody = await request.json();
        if (typeof testBody.base64 !== "string" || testBody.base64.length > 4_500_000) {
          return new Response(JSON.stringify({ error: "Invalid test image payload" }), { status: 400, headers: cors });
        }
        const binary = atob(testBody.base64);
        bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        mimeType = testBody.mimeType || "image/png";
      } else {
        bytes = new Uint8Array(await request.arrayBuffer());
        mimeType = request.headers.get("x-image-mime-type") || request.headers.get("content-type") || "";
      }
      if (bytes.length < 8 || bytes.length > 3145728) {
        return new Response(JSON.stringify({ error: "Image must be between 8 bytes and 3 MB" }), { status: 400, headers: cors });
      }
      if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType.split(";")[0].trim().toLowerCase())) {
        return new Response(JSON.stringify({ error: "Unsupported image type" }), { status: 415, headers: cors });
      }

      await initializeOcr();
      const result = await extractBytes(bytes, mimeType.split(";")[0].trim().toLowerCase(), {
        ocr: { backend: "tesseract", language: "eng" },
      });
      const text = String(result.content || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ").trim().slice(0, 5000);
      return new Response(JSON.stringify({ text, engine: "tesseract-wasm" }), { headers: cors });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("[afusearch-ocr] OCR failed", detail);
      return new Response(JSON.stringify({ error: testAuthorized ? detail : "OCR inference failed" }), { status: 502, headers: cors });
    }
  },
};

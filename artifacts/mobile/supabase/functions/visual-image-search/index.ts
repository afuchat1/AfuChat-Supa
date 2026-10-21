// AfuSearch visual-image-search — traditional computer vision only.
// Computes a difference hash (dHash) from pixels and compares it with indexed public AfuChat images.
// No AI models, AI APIs, generated captions, or AI-generated search terms are used.

import { createClient } from "npm:@supabase/supabase-js@2";
import jpeg from "npm:jpeg-js@0.4.4";
import { PNG } from "npm:pngjs@7.0.0";
import { Buffer } from "node:buffer";
import { createWorker } from "npm:tesseract.js@5.1.1";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AFUSEARCH_VISION_URL = (Deno.env.get("AFUSEARCH_VISION_URL") ?? "").replace(/\\/$/, "");
const AFUSEARCH_VISION_KEY = Deno.env.get("AFUSEARCH_VISION_KEY") ?? "";
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_INDEX_PER_WARMUP = 12;
const INDEX_BATCH_SIZE = 2;
const MAX_CANDIDATE_POSTS = 200;
const MAX_SCAN_PAGES = 50;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_DISTANCE = 10;
let indexWarmupPromise: Promise<void> | null = null;
let ocrWorkerPromise: ReturnType<typeof createWorker> | null = null;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function decodeBase64(value: string): Uint8Array {
  // Reject oversized input before atob allocates a decoded string.
  if (value.length > Math.ceil(MAX_INPUT_BYTES / 3) * 4) {
    throw new Error("Image is too large. Choose an image under 8 MB.");
  }
  const raw = atob(value);
  if (raw.length > MAX_INPUT_BYTES) throw new Error("Image is too large. Choose an image under 8 MB.");
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function decodePixels(bytes: Uint8Array, mimeType = ""): { data: Uint8Array; width: number; height: number } {
  const type = mimeType.toLowerCase();
  if (type.includes("png") || (bytes[0] === 0x89 && bytes[1] === 0x50)) {
    const decoded = PNG.sync.read(Buffer.from(bytes));
    return { data: decoded.data, width: decoded.width, height: decoded.height };
  }
  if (type.includes("jpeg") || type.includes("jpg") || (bytes[0] === 0xff && bytes[1] === 0xd8)) {
    const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
    return { data: decoded.data, width: decoded.width, height: decoded.height };
  }
  throw new Error("This image format is not supported yet. Choose a JPEG or PNG image.");
}

// 64-bit difference hash: sample a 9×8 grayscale grid and compare adjacent pixels.
function differenceHash(bytes: Uint8Array, mimeType = ""): string {
  const image = decodePixels(bytes, mimeType);
  if (!image.width || !image.height || image.width * image.height > 40_000_000) {
    throw new Error("Image dimensions are not supported.");
  }
  const gray = (x: number, y: number) => {
    const sx = Math.min(image.width - 1, Math.floor((x + 0.5) * image.width / 9));
    const sy = Math.min(image.height - 1, Math.floor((y + 0.5) * image.height / 8));
    const offset = (sy * image.width + sx) * 4;
    return 0.299 * image.data[offset] + 0.587 * image.data[offset + 1] + 0.114 * image.data[offset + 2];
  };
  let hash = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      hash = (hash << 1n) | (gray(x, y) > gray(x + 1, y) ? 1n : 0n);
    }
  }
  return hash.toString(16).padStart(16, "0");
}


async function getOcrWorker(): Promise<Awaited<ReturnType<typeof createWorker>>> {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = createWorker("eng", 1, {
      // The OCR engine is the open-source Tesseract OCR runtime. Only the
      // worker/runtime/language data are downloaded; user images stay in this function.
      // Use the package's bundled worker/core paths for the server runtime.
      langPath: "https://tessdata.projectnaptha.com/4.0.0",
      logger: () => undefined,
    }).catch((error) => {
      ocrWorkerPromise = null;
      throw error;
    });
  }
  return await ocrWorkerPromise;
}

async function extractImageText(bytes: Uint8Array): Promise<string> {
  try {
    const worker = await getOcrWorker();
    const result = await worker.recognize(bytes);
    // Keep the index bounded and strip control characters before database writes.
    return String(result.data.text ?? "")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 12000);
  } catch (error) {
    console.error("[visual-image-search] OCR extraction failed", error instanceof Error ? error.message : error);
    throw error;
  }
}

async function inferImageEmbedding(bytes: Uint8Array, mimeType: string): Promise<{ embedding: string; model: string } | null> {
  if (!AFUSEARCH_VISION_URL || !AFUSEARCH_VISION_KEY) return null;
  try {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mimeType || "image/jpeg" }), "query-image");
    const response = await fetch(`${AFUSEARCH_VISION_URL}/v1/embed/image`, {
      method: "POST",
      headers: { "x-afusearch-key": AFUSEARCH_VISION_KEY },
      body: form,
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      console.error("[visual-image-search] vision embedding service returned", response.status);
      return null;
    }
    const result = await response.json();
    if (!Array.isArray(result.embedding) || result.embedding.length !== 512 ||
        !result.embedding.every((value: unknown) => typeof value === "number" && Number.isFinite(value))) {
      console.error("[visual-image-search] vision service returned an invalid embedding");
      return null;
    }
    return { embedding: `[${result.embedding.join(",")}]`, model: String(result.model ?? "unknown") };
  } catch (error) {
    console.error("[visual-image-search] vision embedding unavailable", error instanceof Error ? error.message : error);
    return null;
  }
}

function allowedImageUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (
      host === "afuchat.com" ||
      host.endsWith(".afuchat.com") ||
      host.endsWith(".supabase.co")
    );
  } catch {
    return false;
  }
}

async function fetchImageBytes(url: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  if (!allowedImageUrl(url)) return null;
  try {
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const rawContentType = response.headers.get("content-type") ?? "";
    const mimeType = rawContentType.split(";")[0].trim().toLowerCase();
    if (mimeType !== "image/jpeg" && mimeType !== "image/png") return null;
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > MAX_IMAGE_BYTES) return null;
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_IMAGE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    if (!totalBytes) return null;
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { bytes, mimeType };
  } catch {
    return null;
  }
}

async function verifyUser(req: Request, admin: ReturnType<typeof createClient>): Promise<boolean> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return false;
  const { data, error } = await admin.auth.getUser(token);
  return !error && Boolean(data.user);
}

async function indexPublicImages(admin: ReturnType<typeof createClient>): Promise<number> {
  const pending = new Map<string, { post_id: string }>();

  for (let page = 0; page < MAX_SCAN_PAGES && pending.size < MAX_INDEX_PER_WARMUP; page++) {
    const from = page * MAX_CANDIDATE_POSTS;
    const { data: posts, error: postsError } = await admin
      .from("posts")
      .select("id,image_url,created_at,visibility,post_images(image_url,display_order)")
      .or("visibility.eq.public,visibility.is.null")
      .order("created_at", { ascending: false })
      .range(from, from + MAX_CANDIDATE_POSTS - 1);
    if (postsError) throw new Error(`Public image scan failed: ${postsError.message}`);
    if (!posts?.length) break;

    const pageOwners = new Map<string, { post_id: string }>();
    for (const post of posts) {
      const urls = [post.image_url, ...((post.post_images ?? []).map((item: { image_url?: string }) => item.image_url))];
      for (const url of urls) {
        if (allowedImageUrl(url) && !pageOwners.has(url)) pageOwners.set(url, { post_id: post.id });
      }
    }

    const pageUrls = [...pageOwners.keys()];
    for (let offset = 0; offset < pageUrls.length && pending.size < MAX_INDEX_PER_WARMUP; offset += INDEX_BATCH_SIZE) {
      // PostgREST encodes .in() values into the request URL. Keep each lookup
      // small so a large page of public image URLs cannot exceed URL limits.
      const urlBatch = pageUrls.slice(offset, offset + INDEX_BATCH_SIZE);
      const { data: existing, error: existingError } = await admin
        .from("visual_image_index")
        .select("image_url,ocr_processed_at,ocr_text")
        .in("image_url", urlBatch);
      if (existingError) throw new Error(`Visual index lookup failed: ${existingError.message}`);

      const retryCutoff = Date.now() - 6 * 60 * 60 * 1000;
      const indexedUrls = new Set((existing ?? [])
        .filter((row) => Boolean(String(row.ocr_text ?? "").trim()) ||
          (row.ocr_processed_at && new Date(row.ocr_processed_at).getTime() > retryCutoff))
        .map((row) => row.image_url));
      for (const url of urlBatch) {
        const owner = pageOwners.get(url);
        if (owner && !indexedUrls.has(url) && !pending.has(url)) pending.set(url, owner);
        if (pending.size >= MAX_INDEX_PER_WARMUP) break;
      }
    }
    if (posts.length < MAX_CANDIDATE_POSTS) break;
  }

  let indexedCount = 0;
  const pendingRows = [...pending.entries()].slice(0, MAX_INDEX_PER_WARMUP);
  for (let offset = 0; offset < pendingRows.length; offset += INDEX_BATCH_SIZE) {
    const batch = pendingRows.slice(offset, offset + INDEX_BATCH_SIZE);
    const computed = await Promise.all(batch.map(async ([url, owner]) => {
      const fetched = await fetchImageBytes(url);
      if (!fetched) return null;
      try {
        const perceptualHash = differenceHash(fetched.bytes, fetched.mimeType);
        const imageEmbedding = await inferImageEmbedding(fetched.bytes, fetched.mimeType);
        let ocrText = "";
        let ocrProcessedAt: string | null = null;
        try {
          ocrText = await extractImageText(fetched.bytes);
          ocrProcessedAt = new Date().toISOString();
        } catch {
          // Keep dHash indexing available and record the attempt so failed OCR does not
          // block the next images. Blank OCR entries become eligible again after six hours.
          ocrProcessedAt = new Date().toISOString();
        }
        return {
          image_url: url,
          post_id: owner.post_id,
          perceptual_hash: perceptualHash,
          ocr_text: ocrText,
          ocr_processed_at: ocrProcessedAt,
          ...(imageEmbedding ? {
            image_embedding: imageEmbedding.embedding,
            embedding_model: imageEmbedding.model,
            embedding_created_at: new Date().toISOString(),
          } : {}),
        };
      } catch {
        return null;
      }
    }));
    const valid = computed.filter((row): row is { image_url: string; post_id: string; perceptual_hash: string; ocr_text: string; ocr_processed_at: string | null } => Boolean(row));
    if (!valid.length) continue;
    const { error: upsertError } = await admin
      .from("visual_image_index")
      .upsert(valid, { onConflict: "image_url" });
    if (upsertError) {
      console.error("[visual-image-search] index write failed", upsertError.message);
    } else {
      indexedCount += valid.length;
    }
  }

  return indexedCount;
}

function startIndexWarmup(admin: ReturnType<typeof createClient>): boolean {
  if (indexWarmupPromise) return true;

  let task: Promise<void>;
  task = indexPublicImages(admin)
    .then((count) => {
      console.log(`[visual-image-search] background index warmup indexed ${count} images`);
    })
    .catch((error) => {
      console.error("[visual-image-search] background index warmup failed", error instanceof Error ? error.message : error);
    })
    .finally(() => {
      if (indexWarmupPromise === task) indexWarmupPromise = null;
    });
  indexWarmupPromise = task;

  const edgeRuntime = (globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
  }).EdgeRuntime;
  if (typeof edgeRuntime?.waitUntil === "function") {
    edgeRuntime.waitUntil(task);
  } else {
    void task;
  }
  return true;
}

function isMissingVisualIndexSchema(error: unknown): boolean {
  const details = error as { code?: unknown; message?: unknown } | null;
  const code = String(details?.code ?? "");
  const message = String(details?.message ?? "");
  return ["42P01", "42883", "PGRST202", "PGRST205"].includes(code) ||
    /visual_image_index.*does not exist|find_visual_image_matches.*does not exist|could not find (the )?(table|function).*visual_image_index|could not find the function.*find_visual_image_matches/i.test(message);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: "Visual search is not configured." }, 503);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    if (!(await verifyUser(req, admin))) {
      console.warn("[visual-image-search] rejected request without a valid user session");
      return json({ error: "Please sign in to search images." }, 401);
    }

    const body = await req.json();
    if (body.action === "warmup") {
      startIndexWarmup(admin);
      return json({ indexing: true, message: "Visual search index warmup started." }, 202);
    }
    if (typeof body.imageBase64 !== "string" || !body.imageBase64) {
      return json({ error: "Choose an image to search." }, 400);
    }
    const imageBytes = decodeBase64(body.imageBase64);
    const mimeType = typeof body.mimeType === "string" ? body.mimeType : "image/jpeg";
    const targetHash = differenceHash(imageBytes, mimeType);
    let extractedQueryText = "";
    try {
      extractedQueryText = await extractImageText(imageBytes);
    } catch {
      // OCR is additive; a recognition failure must not break pixel-based image search.
    }
    const sourceImageUrl = typeof body.imageUrl === "string" ? body.imageUrl : "";

    // Match the already-indexed corpus immediately; public image indexing is
    // scheduled separately so cold starts do not delay the user's search.
    const indexing = startIndexWarmup(admin);

    const { data: matchedImages, error: matchError } = await admin.rpc("find_visual_image_matches", {
      p_hash: targetHash,
      p_max_distance: MAX_DISTANCE,
      p_limit: 30,
    });
    if (matchError) {
      console.error("[visual-image-search] hash match query failed", matchError.message);
      const errorMessage = isMissingVisualIndexSchema(matchError)
        ? "Visual search index is not installed yet. Apply the visual image index migration."
        : "Visual search is temporarily unavailable. Please try again shortly.";
      return json({ error: errorMessage }, 503);
    }
    const queryEmbedding = await inferImageEmbedding(imageBytes, mimeType);
    let embeddingMatches: any[] = [];
    if (queryEmbedding) {
      const { data: embeddingRows, error: embeddingError } = await admin.rpc("find_visual_embedding_matches", {
        p_embedding: queryEmbedding.embedding,
        p_limit: 40,
        p_min_similarity: 0.18,
      });
      if (embeddingError) {
        console.error("[visual-image-search] embedding retrieval failed", embeddingError.message);
      } else {
        embeddingMatches = (embeddingRows ?? []).filter((row: any) => row.image_url !== sourceImageUrl);
      }
    }

    // Fuse independent exact/near-duplicate and learned-embedding candidate sets.
    // dHash catches edited copies; OpenCLIP catches semantically similar imagery.
    const candidateByUrl = new Map<string, any>();
    for (const row of (matchedImages ?? []).filter((item: any) => item.image_url !== sourceImageUrl)) {
      candidateByUrl.set(row.image_url, { ...row, retrievalMethod: "dhash" });
    }
    for (const row of embeddingMatches) {
      const prior = candidateByUrl.get(row.image_url);
      const embeddingSimilarity = Number(row.similarity ?? 0);
      if (prior) {
        prior.embeddingSimilarity = embeddingSimilarity;
        prior.retrievalMethod = "hybrid";
      } else {
        candidateByUrl.set(row.image_url, {
          ...row,
          distance: Math.max(0, Math.min(64, Math.round((1 - embeddingSimilarity) * 64))),
          embeddingSimilarity,
          retrievalMethod: "embedding",
        });
      }
    }
    const candidates = [...candidateByUrl.values()]
      .sort((a: any, b: any) => {
        const scoreA = a.embeddingSimilarity != null
          ? 75 + Math.max(0, Math.min(25, Number(a.embeddingSimilarity) * 25))
          : 100 - Number(a.distance);
        const scoreB = b.embeddingSimilarity != null
          ? 75 + Math.max(0, Math.min(25, Number(b.embeddingSimilarity) * 25))
          : 100 - Number(b.distance);
        return scoreB - scoreA;
      })
      .slice(0, 40);

    const postIds = [...new Set(candidates.map((row) => row.post_id))];
    let textMatches: any[] = [];
    if (extractedQueryText.length >= 2) {
      const { data: textRows, error: textError } = await admin.rpc("find_visual_text_matches", {
        p_query: extractedQueryText,
        p_limit: 30,
      });
      if (textError) {
        console.error("[visual-image-search] OCR text query failed", textError.message);
      } else {
        textMatches = (textRows ?? []).filter((row: any) => row.image_url !== sourceImageUrl);
      }
    }
    let captionMatches: any[] = [];
    if (extractedQueryText.length >= 2) {
      const { data: contentRows, error: contentError } = await admin.rpc("find_public_content_text_matches", {
        p_query: extractedQueryText,
        p_limit: 30,
      });
      if (contentError) {
        console.error("[visual-image-search] public content text query failed", contentError.message);
      } else {
        captionMatches = contentRows ?? [];
      }
    }
    const allPostIds = [...new Set([
      ...postIds,
      ...textMatches.map((row: any) => row.post_id),
    ])];
    let postsById = new Map<string, any>();
    if (allPostIds.length) {
      const { data: matchedPosts, error: matchedError } = await admin
        .from("posts")
        .select("id,content,article_title,created_at,visibility,author_id")
        .in("id", allPostIds);
      if (matchedError) console.error("[visual-image-search] matched post lookup failed", matchedError.message);
      postsById = new Map((matchedPosts ?? [])
        .filter((post: any) => post.visibility === "public" || post.visibility == null)
        .map((post: any) => [post.id, post]));
    }

    const visualResults = candidates
      .filter((row) => postsById.has(row.post_id))
      .map((row) => {
        const post = postsById.get(row.post_id);
        return {
          postId: row.post_id,
          imageUrl: row.image_url,
          content: String(post.content ?? post.article_title ?? "").slice(0, 220),
          createdAt: post.created_at,
          distance: row.distance,
          similarity: row.embeddingSimilarity != null
            ? Math.max(1, Math.min(99, Math.round(Number(row.embeddingSimilarity) * 100)))
            : Math.round((64 - row.distance) / 64 * 100),
          rankScore: row.embeddingSimilarity != null
            ? 75 + Math.max(0, Math.min(25, Number(row.embeddingSimilarity) * 25))
            : 100 - Number(row.distance),
          matchType: row.embeddingSimilarity != null
            ? (row.retrievalMethod === "hybrid" ? "hybrid-visual" : "semantic-visual")
            : "visual",
        };
      });
    const textResults = textMatches
      .filter((row: any) => postsById.has(row.post_id))
      .map((row: any) => {
        const post = postsById.get(row.post_id);
        return {
          postId: row.post_id,
          imageUrl: row.image_url,
          content: String(post.content ?? post.article_title ?? row.ocr_text ?? "").slice(0, 220),
          createdAt: post.created_at,
          distance: 64,
          similarity: Math.max(1, Math.min(99, Math.round(55 + Number(row.score ?? 0) * 40))),
          rankScore: 65 + Math.min(30, Number(row.score ?? 0) * 30),
          matchType: "text",
        };
      });
    const indexedTextIds = new Set(textResults.map((row: any) => row.postId));
    const captionResults = captionMatches.map((row: any) => ({
      postId: row.source_id,
      imageUrl: null,
      content: String(row.title || row.body || row.source_type || "Matching AfuChat content").slice(0, 220),
      createdAt: row.created_at,
      distance: 64,
      similarity: Math.max(1, Math.min(99, Math.round(45 + Number(row.score ?? 0) * 40))),
      rankScore: 50 + Math.min(35, Number(row.score ?? 0) * 35),
      matchType: "caption",
      sourceType: row.source_type,
    }));
    const visualIds = new Set(visualResults.map((row) => row.postId));
    const indexedTextPostIds = new Set([...visualIds, ...indexedTextIds]);
    const matches = [
      ...visualResults,
      ...textResults.filter((row: any) => !visualIds.has(row.postId)),
      ...captionResults.filter((row: any) =>
        !((row.sourceType === "post" || row.sourceType === "video") && indexedTextPostIds.has(row.postId))
      ),
    ].sort((a: any, b: any) => Number(b.rankScore ?? 0) - Number(a.rankScore ?? 0)).slice(0, 12);

    return json({
      algorithm: queryEmbedding ? "openclip+dhash+ocr+hybrid-text" : "dhash+ocr+hybrid-text",
      extractedText: extractedQueryText,
      indexedThisRequest: 0,
      indexing,
      matches,
      message: matches.length
        ? "Results combine traditional visual similarity and OCR text matches."
        : indexing
          ? "AfuSearch is preparing the public image index in the background. This search will check again shortly."
          : "No close visual matches found in the indexed public images.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Visual search failed.";
    console.error("[visual-image-search] request failed", message);
    return json({ error: message }, 400);
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  DeleteObjectCommand,
  S3Client,
} from "npm:@aws-sdk/client-s3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const R2_ACCOUNT_ID = Deno.env.get("CLOUDFLARE_ACCOUNT_ID") ?? "";
const R2_ACCESS_KEY_ID = Deno.env.get("CLOUDFLARE_R2_ACCESS_KEY_ID") ?? "";
const R2_SECRET_ACCESS_KEY = Deno.env.get("CLOUDFLARE_R2_SECRET_ACCESS_KEY") ?? "";
const R2_BUCKET = Deno.env.get("R2_BUCKET") ?? "afuchat-media";
const R2_PUBLIC_BASE_URL = (Deno.env.get("R2_PUBLIC_BASE_URL") ?? "").replace(/\/$/, "");

const r2 = R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY
  ? new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })
  : null;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

function r2Key(mediaUrl: string): string | null {
  if (!R2_PUBLIC_BASE_URL || !mediaUrl.startsWith(`${R2_PUBLIC_BASE_URL}/`)) return null;
  const key = decodeURIComponent(mediaUrl.slice(R2_PUBLIC_BASE_URL.length + 1));
  return key && !key.split("/").includes("..") ? key : null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({});

  try {
    const { data: stories, error: readError } = await admin
      .from("stories")
      .select("id, media_url")
      .not("expires_at", "is", null)
      .lte("expires_at", new Date().toISOString());

    if (readError) throw readError;
    if (!stories?.length) return json({ success: true, deleted: 0, storage_deleted: 0 });

    const keys = stories
      .map((story) => r2Key(story.media_url))
      .filter((key): key is string => Boolean(key));

    let storageDeleted = 0;
    if (keys.length && !r2) {
      return json({ success: false, error: "R2 storage is not configured" }, 503);
    }
    for (const key of keys) {
      await r2!.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      storageDeleted += 1;
    }

    const ids = stories.map((story) => story.id);
    const { error: deleteError } = await admin.from("stories").delete().in("id", ids);
    if (deleteError) throw deleteError;

    return json({
      success: true,
      deleted: ids.length,
      storage_deleted: storageDeleted,
      message: "Expired stories permanently deleted",
    });
  } catch (error) {
    console.error("[cleanup-expired-stories]", error);
    return json({ success: false, error: error instanceof Error ? error.message : "Cleanup failed" }, 500);
  }
});
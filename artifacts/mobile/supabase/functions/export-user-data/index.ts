// Authenticated AfuChat account-data export.
//
// Returns normalized tables for a client-side JSON, XLSX, or CSV export.
// An optional JSON email copy is sent from privacy@afuchat.com.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PAGE_SIZE = 500;
const MAX_PAGES_PER_QUERY = 200;
const MAX_EMAIL_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const VALID_TYPES = new Set(["profile", "messages", "posts", "activity", "transactions"]);

type ExportRow = Record<string, unknown>;
type ExportTable = { columns: string[]; rows: ExportRow[] };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function makeTable(rows: ExportRow[], emptyColumns: string[] = []): ExportTable {
  const columns = rows.length
    ? Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
    : emptyColumns;
  return { columns, rows };
}

async function fetchAllRows(
  queryForPage: () => any,
  label: string,
): Promise<ExportRow[]> {
  const rows: ExportRow[] = [];

  for (let page = 0; page < MAX_PAGES_PER_QUERY; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await queryForPage().range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error(`[export-user-data] ${label} query failed:`, error.message);
      throw new Error(`Could not read ${label}. No export file was created.`);
    }
    if (!Array.isArray(data)) {
      throw new Error(`The ${label} query returned an invalid result.`);
    }
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }

  throw new Error(`${label} is too large to export in one request. Please contact support.`);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function sendEmailCopy(
  resendKey: string,
  recipient: string,
  jsonText: string,
  exportedAt: string,
): Promise<"accepted" | "not_configured" | "too_large" | "failed"> {
  if (!resendKey) return "not_configured";

  const content = new TextEncoder().encode(jsonText);
  if (content.byteLength > MAX_EMAIL_ATTACHMENT_BYTES) return "too_large";

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "AfuChat Privacy <privacy@afuchat.com>",
        to: [recipient],
        subject: "Your AfuChat data export is ready",
        attachments: [{
          filename: `afuchat-data-export-${exportedAt.slice(0, 10)}.json`,
          content: bytesToBase64(content),
        }],
        html: `<p>Your AfuChat data export is attached as a JSON file.</p>
          <p>It was requested from your signed-in AfuChat account.</p>
          <p>If you did not request this export, contact
          <a href="mailto:privacy@afuchat.com">privacy@afuchat.com</a>.</p>`,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("[export-user-data] Email provider rejected export:", response.status, errorText);
      return "failed";
    }
    return "accepted";
  } catch (error) {
    console.error("[export-user-data] Email provider request failed:", error);
    return "failed";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "Data export service is not configured." }, 503);
    }

    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) return json({ error: "Sign in again before exporting your data." }, 401);

    let parsedBody: unknown;
    try {
      parsedBody = await req.json();
    } catch {
      return json({ error: "The export request was not valid JSON." }, 400);
    }
    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
      return json({ error: "The export request must be a JSON object." }, 400);
    }
    const body = parsedBody as { types?: unknown; emailCopy?: unknown };
    const hasEmailChoice = Object.prototype.hasOwnProperty.call(body, "emailCopy");
    if (hasEmailChoice && typeof body.emailCopy !== "boolean") {
      return json({ error: "The email-copy option must be true or false." }, 400);
    }

    if (!Array.isArray(body.types) || body.types.length === 0) {
      return json({ error: "Select at least one data category to export." }, 400);
    }
    if (body.types.some((type) => typeof type !== "string" || !VALID_TYPES.has(type))) {
      return json({ error: "The export request contains an unsupported data category." }, 400);
    }
    const selectedTypes = Array.from(new Set(body.types as string[]));

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) return json({ error: "Your session expired. Please sign in again." }, 401);

    const tables: Record<string, ExportTable> = {};
    const work: Promise<void>[] = [];

    if (selectedTypes.includes("profile")) {
      work.push((async () => {
        const { data, error } = await admin
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();
        if (error) {
          console.error("[export-user-data] Profile query failed:", error.message);
          throw new Error("Could not read your profile. No export file was created.");
        }
        if (!data) throw new Error("Your profile could not be found. No export file was created.");
        tables.profiles = makeTable([data as ExportRow]);
      })());
    }

    if (selectedTypes.includes("posts")) {
      work.push((async () => {
        const posts = await fetchAllRows(
          () => admin.from("posts").select("*").eq("author_id", user.id)
            .order("created_at", { ascending: true }).order("id", { ascending: true }),
          "posts",
        );
        tables.posts = makeTable(posts, [
          "id", "author_id", "content", "post_type", "visibility", "created_at",
        ]);

        const postIds = posts.map((post) => post.id).filter((id): id is string => typeof id === "string");
        const imageRows: ExportRow[] = [];
        for (let offset = 0; offset < postIds.length; offset += 100) {
          const batchIds = postIds.slice(offset, offset + 100);
          const batch = await fetchAllRows(
            () => admin.from("post_images").select("*").in("post_id", batchIds)
              .order("post_id", { ascending: true }).order("display_order", { ascending: true }),
            "post images",
          );
          imageRows.push(...batch);
        }
        tables.post_images = makeTable(imageRows, ["id", "post_id", "image_url", "display_order"]);
      })());
    }

    if (selectedTypes.includes("messages")) {
      work.push((async () => {
        const memberships = await fetchAllRows(
          () => admin.from("chat_members").select("chat_id").eq("user_id", user.id)
            .order("chat_id", { ascending: true }),
          "chat memberships",
        );
        const chatIds = Array.from(new Set(
          memberships.map((row) => row.chat_id).filter((id): id is string => typeof id === "string"),
        ));
        const messages: ExportRow[] = [];
        for (let offset = 0; offset < chatIds.length; offset += 100) {
          const batchIds = chatIds.slice(offset, offset + 100);
          const batch = await fetchAllRows(
            () => admin.from("messages")
              .select("id, chat_id, sender_id, encrypted_content, sent_at, reply_to_message_id, attachment_url, attachment_type, edited_at")
              .in("chat_id", batchIds)
              .order("sent_at", { ascending: true }).order("id", { ascending: true }),
            "messages",
          );
          messages.push(...batch);
        }
        tables.messages = makeTable(messages, [
          "id", "chat_id", "sender_id", "encrypted_content", "sent_at",
          "reply_to_message_id", "attachment_url", "attachment_type", "edited_at",
        ]);
      })());
    }

    if (selectedTypes.includes("activity")) {
      work.push((async () => {
        const [following, followers, storyLikes, xpActivity, referrals] = await Promise.all([
          fetchAllRows(
            () => admin.from("follows").select("*").eq("follower_id", user.id)
              .order("created_at", { ascending: true }).order("following_id", { ascending: true }),
            "following relationships",
          ),
          fetchAllRows(
            () => admin.from("follows").select("*").eq("following_id", user.id)
              .order("created_at", { ascending: true }).order("follower_id", { ascending: true }),
            "follower relationships",
          ),
          fetchAllRows(
            () => admin.from("story_likes").select("*").eq("user_id", user.id)
              .order("created_at", { ascending: true }).order("story_id", { ascending: true }),
            "story likes",
          ),
          fetchAllRows(
            () => admin.from("xp_activity_log").select("*").eq("user_id", user.id)
              .order("created_at", { ascending: true }).order("id", { ascending: true }),
            "XP activity",
          ),
          fetchAllRows(
            () => admin.from("referrals").select("*")
              .or(`referrer_id.eq.${user.id},referred_id.eq.${user.id}`)
              .order("created_at", { ascending: true }).order("id", { ascending: true }),
            "referrals",
          ),
        ]);
        tables.following = makeTable(following, ["follower_id", "following_id", "created_at"]);
        tables.followers = makeTable(followers, ["follower_id", "following_id", "created_at"]);
        tables.story_likes = makeTable(storyLikes, ["story_id", "user_id", "created_at"]);
        tables.xp_activity_log = makeTable(xpActivity, [
          "id", "user_id", "activity_type", "xp_amount", "metadata", "created_at",
        ]);
        tables.referrals = makeTable(referrals, [
          "id", "referrer_id", "referred_id", "reward_given", "created_at",
        ]);
      })());
    }

    if (selectedTypes.includes("transactions")) {
      work.push((async () => {
        const [acoinTransactions, xpTransfers] = await Promise.all([
          fetchAllRows(
            () => admin.from("acoin_transactions").select("*").eq("user_id", user.id)
              .order("created_at", { ascending: true }).order("id", { ascending: true }),
            "ACoin transactions",
          ),
          fetchAllRows(
            () => admin.from("xp_transfers").select("*")
              .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
              .order("created_at", { ascending: true }).order("id", { ascending: true }),
            "XP transfers",
          ),
        ]);
        tables.acoin_transactions = makeTable(acoinTransactions, [
          "id", "user_id", "amount", "transaction_type", "created_at", "metadata",
        ]);
        tables.xp_transfers = makeTable(xpTransfers, [
          "id", "sender_id", "receiver_id", "amount", "status", "reason", "created_at",
        ]);
      })());
    }

    await Promise.all(work);

    const exportedAt = new Date().toISOString();
    const exportData = {
      schema_version: "1.0",
      exported_at: exportedAt,
      account: { user_id: user.id, email: user.email ?? null },
      included_types: selectedTypes,
      tables,
    };
    const jsonText = JSON.stringify(exportData, null, 2);
    // Older installed clients omit emailCopy and expect the original emailed export.
    const wantsEmail = hasEmailChoice ? body.emailCopy === true : true;
    let emailStatus: "not_requested" | "unavailable" | "not_configured" | "too_large" | "failed" | "accepted" =
      "not_requested";

    if (wantsEmail) {
      if (!user.email) emailStatus = "unavailable";
      else emailStatus = await sendEmailCopy(resendKey, user.email, jsonText, exportedAt);
    }

    // Do not tell older email-only clients that delivery succeeded when it did not.
    if (!hasEmailChoice && emailStatus !== "accepted") {
      return json({
        error: "The export was prepared, but its email could not be accepted. Please try again later.",
        emailStatus,
      }, 502);
    }

    return json({
      ok: true,
      email: user.email ?? null,
      emailStatus,
      export: exportData,
    });
  } catch (error) {
    console.error("[export-user-data] Export failed:", error);
    const message = error instanceof Error ? error.message : "The export could not be completed.";
    return json({ error: message }, 500);
  }
});

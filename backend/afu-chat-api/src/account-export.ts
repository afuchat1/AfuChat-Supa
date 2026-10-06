import {
  privateJsonResponse,
  supabaseConfig,
  verifySharedSession,
  type Env,
} from "./shared.ts";

const PATH = "/v1/chat/account/export";
const VALID_TYPES = new Set(["profile", "posts", "messages", "activity", "transactions"]);

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

async function selectRows(
  env: Env,
  token: string,
  table: string,
  query: URLSearchParams,
): Promise<any[]> {
  const supabase = supabaseConfig(env);
  if (!supabase) throw new Error("Supabase is not configured");
  const target = new URL(`${supabase.url}/rest/v1/${table}`);
  target.search = query.toString();
  const response = await fetch(target, {
    headers: {
      apikey: supabase.anonKey,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Accept-Profile": "public",
    },
  });
  if (!response.ok) {
    throw new Error(`Supabase data export query failed with HTTP ${response.status}`);
  }
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

function query(params: Record<string, string>): URLSearchParams {
  return new URLSearchParams(params);
}

export async function handleAccountExport(request: Request, env: Env): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (request.method !== "POST") {
    return privateJsonResponse(
      request,
      requestId,
      { error: "Method not allowed", request_id: requestId },
      405,
    );
  }

  const verified = await verifySharedSession(request, env, requestId);
  if (verified.response) return verified.response;
  const { user, token } = verified.session;
  if (!user.email) {
    return privateJsonResponse(
      request,
      requestId,
      { error: "No email address on this account", request_id: requestId },
      400,
    );
  }
  if (!env.RESEND_API_KEY?.trim()) {
    return privateJsonResponse(
      request,
      requestId,
      { error: "Email service is not configured", request_id: requestId },
      503,
    );
  }

  const body = await readJson(request);
  const requested = Array.isArray(body.types) ? body.types : ["profile"];
  const selected = [...new Set(
    requested.filter((value): value is string =>
      typeof value === "string" && VALID_TYPES.has(value),
    ),
  )];
  if (!selected.length) selected.push("profile");

  const encodedUserId = encodeURIComponent(user.id);
  const dataPackage: Record<string, unknown> = {};
  await Promise.all(selected.map(async (type) => {
    try {
      if (type === "profile") {
        const rows = await selectRows(
          env,
          token,
          "profiles",
          query({
            select: "id,display_name,handle,bio,avatar_url,country,website_url,xp,acoin,current_grade,is_verified,is_organization_verified,created_at,last_seen",
            id: `eq.${encodedUserId}`,
            limit: "1",
          }),
        );
        dataPackage.profile = rows[0] ?? {};
      } else if (type === "posts") {
        dataPackage.posts = await selectRows(
          env,
          token,
          "posts",
          query({
            select: "id,content,post_type,visibility,article_title,image_url,view_count,created_at,post_images(image_url,display_order)",
            author_id: `eq.${encodedUserId}`,
            order: "created_at.desc",
            limit: "500",
          }),
        );
      } else if (type === "messages") {
        const rows = await selectRows(
          env,
          token,
          "messages",
          query({
            select: "id,chat_id,encrypted_content,created_at,message_type",
            sender_id: `eq.${encodedUserId}`,
            order: "created_at.desc",
            limit: "1000",
          }),
        );
        dataPackage.messages = rows.map((message) => ({
          id: message.id,
          chat_id: message.chat_id,
          content: message.encrypted_content,
          type: message.message_type,
          sent_at: message.created_at,
        }));
      } else if (type === "activity") {
        dataPackage.activity = {
          follows: await selectRows(
            env,
            token,
            "follows",
            query({
              select: "following_id,created_at",
              follower_id: `eq.${encodedUserId}`,
              order: "created_at.desc",
              limit: "200",
            }),
          ),
        };
      } else {
        const [coins, xp] = await Promise.all([
          selectRows(
            env,
            token,
            "acoin_transactions",
            query({
              select: "id,amount,type,note,created_at",
              user_id: `eq.${encodedUserId}`,
              order: "created_at.desc",
              limit: "500",
            }),
          ),
          selectRows(
            env,
            token,
            "xp_transfers",
            query({
              select: "id,amount,reason,created_at",
              or: `(sender_id.eq.${encodedUserId},receiver_id.eq.${encodedUserId})`,
              order: "created_at.desc",
              limit: "200",
            }),
          ),
        ]);
        dataPackage.transactions = { acoin: coins, xp };
      }
    } catch (error) {
      console.error(
        `[afuchat-account-export:${type}]`,
        error instanceof Error ? error.message : "unknown error",
      );
      dataPackage[type] = { error: "Could not fetch this data" };
    }
  }));

  const exportedAt = new Date();
  const filename = `afuchat-data-export-${exportedAt.toISOString().split("T")[0]}.json`;
  const payload = JSON.stringify({
    exported_at: exportedAt.toISOString(),
    user_id: user.id,
    email: user.email,
    included_types: selected,
    data: dataPackage,
  }, null, 2);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "AfuChat <onboarding@resend.dev>",
        to: [user.email],
        subject: "Your AfuChat data export is ready",
        attachments: [{ filename, content: encodeBase64(payload) }],
        html: `<p>Your AfuChat data export is attached as <strong>${filename}</strong>.</p><p>Included data: ${selected.join(", ")}</p>`,
      }),
    });
    if (!response.ok) {
      console.error("[afuchat-account-export:resend]", response.status);
      return privateJsonResponse(
        request,
        requestId,
        { error: "Failed to send export email. Please try again later.", request_id: requestId },
        502,
      );
    }
  } catch {
    return privateJsonResponse(
      request,
      requestId,
      { error: "Email service is unavailable. Please try again later.", request_id: requestId },
      502,
    );
  }

  return privateJsonResponse(request, requestId, { ok: true, email: user.email }, 200);
}

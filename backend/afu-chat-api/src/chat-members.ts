import {
  privateJsonResponse,
  supabaseConfig,
  verifySharedSession,
  type Env,
  type VerifiedSession,
} from "./shared.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MEMBER_FIELDS = "id,chat_id,user_id,is_admin,joined_at";
const PAGE_SIZE = 1_000;
const MAX_ROWS_PER_SCHEMA = 10_000;

type MemberRow = {
  id: string;
  chat_id: string;
  user_id: string;
  is_admin: boolean;
  joined_at: string | null;
};

function errorResponse(
  request: Request,
  requestId: string,
  error: string,
  status: number,
): Response {
  return privateJsonResponse(request, requestId, { error, request_id: requestId }, status);
}

function memberUrl(base: string, filters: Record<string, string>): URL {
  const url = new URL("/rest/v1/chat_members", base);
  for (const [key, value] of Object.entries(filters)) {
    url.searchParams.set(key, value);
  }
  return url;
}

async function readMemberRows(
  requestId: string,
  base: string,
  anonKey: string,
  session: VerifiedSession,
  baseFilters: Record<string, string>,
  schema: "public" | "chat",
): Promise<MemberRow[] | null> {
  const rows: MemberRow[] = [];
  try {
    for (let offset = 0; offset <= MAX_ROWS_PER_SCHEMA; offset += PAGE_SIZE) {
      const response = await fetch(memberUrl(base, {
        ...baseFilters,
        order: "joined_at.asc,user_id.asc",
        limit: String(PAGE_SIZE),
        offset: String(offset),
      }), {
        method: "GET",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${session.token}`,
          Accept: "application/json",
          "Accept-Profile": schema,
          "Content-Profile": schema,
        },
        redirect: "manual",
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(payload)) {
        const code = payload && typeof payload === "object" &&
            typeof (payload as Record<string, unknown>).code === "string"
          ? (payload as Record<string, string>).code
          : undefined;
        console.error("[afuchat-api] chat membership read failed", {
          requestId,
          schema,
          status: response.status,
          code,
        });
        return null;
      }
      for (const value of payload) {
        if (
          !value ||
          typeof value !== "object" ||
          typeof (value as Record<string, unknown>).id !== "string" ||
          typeof (value as Record<string, unknown>).chat_id !== "string" ||
          !UUID_PATTERN.test((value as Record<string, string>).chat_id) ||
          typeof (value as Record<string, unknown>).user_id !== "string" ||
          !UUID_PATTERN.test((value as Record<string, string>).user_id)
        ) {
          console.error("[afuchat-api] invalid chat membership row", { requestId, schema });
          return null;
        }
        const row = value as Record<string, unknown>;
        rows.push({
          id: row.id as string,
          chat_id: row.chat_id as string,
          user_id: row.user_id as string,
          is_admin: row.is_admin === true,
          joined_at: typeof row.joined_at === "string" ? row.joined_at : null,
        });
      }
      if (payload.length < PAGE_SIZE) return rows;
    }
  } catch {
    console.error("[afuchat-api] chat membership read failed", { requestId, schema });
  }
  return null;
}

export async function handleChatMembers(
  request: Request,
  env: Env,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (request.method !== "GET") {
    const response = errorResponse(request, requestId, "Method not allowed", 405);
    const headers = new Headers(response.headers);
    headers.set("Allow", "GET, OPTIONS");
    return new Response(response.body, { status: 405, headers });
  }

  const verification = await verifySharedSession(request, env, requestId);
  if (!verification.session) return verification.response;
  const session = verification.session;
  const url = new URL(request.url);
  const allowedParams = new Set(["chat_id", "chat_ids", "mine"]);
  if ([...url.searchParams.keys()].some((key) => !allowedParams.has(key))) {
    return errorResponse(request, requestId, "Invalid membership query.", 400);
  }

  const chatId = url.searchParams.get("chat_id");
  const rawChatIds = url.searchParams.get("chat_ids");
  const mine = url.searchParams.get("mine");
  if (
    (chatId && rawChatIds) ||
    (mine !== null && mine !== "true") ||
    (mine === "true" && (chatId || rawChatIds))
  ) {
    return errorResponse(request, requestId, "Invalid membership query.", 400);
  }

  let chatIds: string[] = [];
  if (chatId) chatIds = [chatId];
  else if (rawChatIds) {
    chatIds = [...new Set(rawChatIds.split(",").map((value) => value.trim()))];
  }
  if (
    (mine !== "true" && chatIds.length === 0) ||
    chatIds.length > 100 ||
    chatIds.some((value) => !UUID_PATTERN.test(value))
  ) {
    return errorResponse(request, requestId, "Invalid membership query.", 400);
  }

  const supabase = supabaseConfig(env);
  if (!supabase) {
    return errorResponse(request, requestId, "Chat members are temporarily unavailable.", 503);
  }

  const filters: Record<string, string> = { select: MEMBER_FIELDS };
  if (mine === "true") filters.user_id = `eq.${session.user.id}`;
  else if (chatIds.length === 1) filters.chat_id = `eq.${chatIds[0]}`;
  else filters.chat_id = `in.(${chatIds.join(",")})`;

  const [preferred, legacy] = await Promise.all([
    readMemberRows(requestId, supabase.url, supabase.anonKey, session, filters, "public"),
    readMemberRows(requestId, supabase.url, supabase.anonKey, session, filters, "chat"),
  ]);
  if (!preferred || !legacy) {
    return errorResponse(request, requestId, "Chat members could not be loaded.", 502);
  }

  const membersByKey = new Map<string, MemberRow>();
  for (const row of preferred) membersByKey.set(`${row.chat_id}:${row.user_id}`, row);
  for (const row of legacy) {
    const key = `${row.chat_id}:${row.user_id}`;
    if (!membersByKey.has(key)) membersByKey.set(key, row);
  }

  const members = [...membersByKey.values()].sort((a, b) =>
    a.chat_id.localeCompare(b.chat_id) ||
    (a.joined_at ?? "").localeCompare(b.joined_at ?? "") ||
    a.user_id.localeCompare(b.user_id)
  );
  return privateJsonResponse(request, requestId, { members }, 200);
}

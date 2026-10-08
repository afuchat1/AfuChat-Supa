import {
  privateJsonResponse,
  responseHeaders,
  supabaseConfig,
  verifySharedSession,
  type Env,
} from "./shared.ts";

const PREFIX = "/v1/chat/data";
const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST", "PATCH", "DELETE"]);
const MAX_BODY_BYTES = 8 * 1024 * 1024;

// These are the relation names used by the current mobile app. Keeping this
// list explicit prevents the Worker from becoming an arbitrary schema/table
// proxy. Public compatibility views continue to enforce their base-table RLS.
const PUBLIC_RELATIONS = new Set([
  "acoin_transactions",
  "advanced_feature_settings",
  "app_banners",
  "app_settings",
  "blocked_users",
  "blocks",
  "business_verification_requests",
  "channel_subscriptions",
  "channels",
  "chat_drafts",
  "chat_members",
  "chat_mutes",
  "chat_preferences",
  "chats",
  "collections",
  "community_members",
  "conversations",
  "crash_logs",
  "currency_settings",
  "device_sessions",
  "digital_events",
  "freelance_listings",
  "freelance_orders",
  "freelance_reviews",
  "gift_marketplace",
  "gift_statistics",
  "gift_transactions",
  "gifts",
  "life_earth_leaderboard",
  "life_earth_saves",
  "match_matches",
  "match_messages",
  "match_photos",
  "match_preferences",
  "match_profiles",
  "match_reports",
  "match_swipes",
  "messages",
  "money_requests",
  "music_purchases",
  "music_tracks",
  "notification_events",
  "orders",
  "org_page_jobs",
  "org_verification_requests",
  "organization_page_connections",
  "organization_page_followers",
  "organization_page_posts",
  "organization_pages",
  "owned_usernames",
  "paid_communities",
  "post_acknowledgments",
  "post_replies",
  "profiles",
  "red_envelope_claims",
  "red_envelopes",
  "security_preferences",
  "seller_applications",
  "shop_order_items",
  "shop_order_messages",
  "shop_orders",
  "shop_products",
  "shop_reviews",
  "shopping_cart",
  "shops",
  "status_goods_purchases",
  "stories",
  "story_likes",
  "story_replies",
  "story_views",
  "subscription_plans",
  "support_messages",
  "support_tickets",
  "user_activity_events",
  "user_gifts",
  "user_reports",
  "user_subscriptions",
  "username_featured_listings",
  "username_listings",
  "video_watch_history",
  "xp_transfers",
]);

const PUBLIC_FUNCTIONS = new Set([
  "add_group_members",
  "award_xp",
  "cancel_my_subscription",
  "chat_has_screenshot_protection",
  "check_mutual_match",
  "check_public_chat_username",
  "check_username_availability",
  "claim_red_envelope",
  "claim_username",
  "clear_afuai_chat",
  "convert_gift_to_acoin",
  "count_my_channels",
  "count_my_groups",
  "create_channel_chat",
  "create_group_chat",
  "create_red_envelope",
  "create_username_listing",
  "credit_acoin",
  "deduct_acoin",
  "delist_username_listing",
  "feature_username_listing",
  "get_channel_access_context",
  "get_my_channels",
  "get_or_create_direct_chat",
  "increment_channel_subscriber",
  "insert_afuai_message",
  "lookup_profile_by_afu_id",
  "place_username_bid",
  "purchase_music_track",
  "purchase_status_good",
  "purchase_username",
  "reward_activity_xp",
  "send_afu_ai_welcome",
  "update_last_seen",
  "upsert_watch_history",
]);

const REQUEST_HEADERS = [
  "Accept",
  "Accept-Language",
  "Content-Type",
  "If-Match",
  "If-Modified-Since",
  "If-None-Match",
  "Prefer",
  "Range",
  "Range-Unit",
  "X-Client-Info",
];

const RESPONSE_HEADERS = [
  "Cache-Control",
  "Content-Location",
  "Content-Range",
  "Content-Type",
  "ETag",
  "Last-Modified",
  "Location",
  "Preference-Applied",
  "Vary",
];

function errorResponse(
  request: Request,
  requestId: string,
  error: string,
  status: number,
): Response {
  return privateJsonResponse(request, requestId, { error, request_id: requestId }, status);
}

function routeTarget(pathname: string): { kind: "relation" | "function"; name: string } | null {
  const match = pathname.match(/^\/v1\/chat\/data\/(rpc\/)?([a-z][a-z0-9_]*)$/);
  if (!match) return null;
  return { kind: match[1] ? "function" : "relation", name: match[2] };
}

function requestedSchema(request: Request): string | null {
  const acceptSchema = request.headers.get("Accept-Profile")?.trim().toLowerCase() || "";
  const contentSchema = request.headers.get("Content-Profile")?.trim().toLowerCase() || "";
  if (acceptSchema && contentSchema && acceptSchema !== contentSchema) return null;
  return acceptSchema || contentSchema || "";
}

function fixedSchema(
  request: Request,
  target: { kind: "relation" | "function"; name: string },
): string | null {
  const requested = requestedSchema(request);
  if (requested === null) return null;

  if (target.kind === "function") {
    if (!PUBLIC_FUNCTIONS.has(target.name) || (requested && requested !== "public")) return null;
    return "public";
  }

  if (!PUBLIC_RELATIONS.has(target.name)) return null;
  if (target.name === "orders") {
    return requested && requested !== "shop" ? null : "shop";
  }
  if (requested === "accounts" && target.name === "profiles") return "accounts";
  if (requested && requested !== "public") return null;
  return "public";
}

function bearerToken(request: Request, anonKey: string): string | null {
  const authorization = request.headers.get("Authorization")?.trim() ?? "";
  if (!authorization) return anonKey;
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

export async function handleDataGateway(request: Request, env: Env): Promise<Response> {
  const requestId = crypto.randomUUID();
  const target = routeTarget(new URL(request.url).pathname);
  if (!target) {
    return errorResponse(request, requestId, "The requested data route was not found.", 404);
  }
  if (!ALLOWED_METHODS.has(request.method)) {
    const response = errorResponse(request, requestId, "Method not allowed.", 405);
    const headers = new Headers(response.headers);
    headers.set("Allow", [...ALLOWED_METHODS, "OPTIONS"].join(", "));
    return new Response(response.body, { status: response.status, headers });
  }

  const schema = fixedSchema(request, target);
  if (!schema) {
    return errorResponse(request, requestId, "The requested data resource is not available.", 404);
  }

  const config = supabaseConfig(env);
  if (!config) {
    return errorResponse(request, requestId, "The data service is unavailable.", 503);
  }
  if (request.headers.get("apikey") !== config.anonKey) {
    return errorResponse(request, requestId, "A valid API key is required.", 401);
  }

  const token = bearerToken(request, config.anonKey);
  if (!token) {
    return errorResponse(request, requestId, "A valid bearer token is required.", 401);
  }
  if (token !== config.anonKey) {
    const verification = await verifySharedSession(
      new Request("https://afuauth-api/v1/auth/session", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env,
      requestId,
    );
    if (verification.response) return verification.response;
  }

  let body: ArrayBuffer | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const declaredLength = Number(request.headers.get("Content-Length") || 0);
    if (declaredLength > MAX_BODY_BYTES) {
      return errorResponse(request, requestId, "The request body is too large.", 413);
    }
    body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) {
      return errorResponse(request, requestId, "The request body is too large.", 413);
    }
  }

  const upstreamUrl = new URL(config.url);
  const operation = target.kind === "function" ? `rpc/${target.name}` : target.name;
  upstreamUrl.pathname = `/rest/v1/${operation}`;
  upstreamUrl.search = new URL(request.url).search;

  const upstreamHeaders = new Headers({
    apikey: config.anonKey,
    Authorization: `Bearer ${token}`,
    "Accept-Profile": schema,
    "Content-Profile": schema,
  });
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) upstreamHeaders.set(name, value);
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers: upstreamHeaders,
      ...(body ? { body } : {}),
      redirect: "manual",
    });
    const headers = responseHeaders(request, requestId);
    for (const name of RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    headers.set("Cache-Control", "private, no-store");
    headers.set("Vary", "Origin, Authorization");
    headers.set("X-AfuChat-Request-Id", requestId);
    headers.set("X-AfuChat-Version", "v1");
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  } catch (error) {
    console.error("[afuchat-api] database request failed", {
      requestId,
      operation: target.kind,
      status: error instanceof Error ? error.name : "unknown",
    });
    return errorResponse(request, requestId, "The data request could not be completed.", 502);
  }
}


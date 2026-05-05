import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "../lib/constants";

const router = Router();

const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";
const supabase = createClient(SUPABASE_URL, supabaseAnonKey);

const BRAND_COLOR = "#00BCD4";
const BRAND_DARK = "#0097A7";
const SITE_NAME = "AfuChat";
const SITE_URL = "https://afuchat.com";

const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function decodeShortId(short: string): string {
  try {
    const base = BigInt(B62.length);
    let num = 0n;
    for (const ch of short) {
      const i = B62.indexOf(ch);
      if (i < 0) return short;
      num = num * base + BigInt(i);
    }
    const hex = num.toString(16).padStart(32, "0");
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join("-");
  } catch {
    return short;
  }
}

function encodeUuidToShort(uuid: string): string {
  const hex = uuid.replace(/-/g, "");
  let num = BigInt("0x" + hex);
  if (num === 0n) return B62[0];
  let r = "";
  const base = BigInt(B62.length);
  while (num > 0n) { r = B62[Number(num % base)] + r; num = num / base; }
  return r;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolvePostId(param: string): string {
  if (UUID_RE.test(param)) return param;
  return decodeShortId(param);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.substring(0, len - 1).trimEnd() + "\u2026";
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// ── Bare iframe embed page (used by Twitter Player Card) ──────────────────────
function renderEmbedPage(videoUrl: string, posterUrl?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:100%;height:100%;background:#000;overflow:hidden}
    video{width:100%;height:100%;object-fit:contain;display:block}
  </style>
</head>
<body>
  <video
    src="${escapeHtml(videoUrl)}"
    ${posterUrl ? `poster="${escapeHtml(posterUrl)}"` : ""}
    controls
    playsinline
    preload="metadata"
    style="background:#000"
  ></video>
</body>
</html>`;
}

// ── JSON-LD VideoObject ───────────────────────────────────────────────────────
/**
 * Builds a schema.org/VideoObject JSON-LD block.
 * Google requires: name, description, thumbnailUrl, uploadDate + contentUrl|embedUrl.
 * Optional but high-value: duration (ISO 8601), interactionStatistic, author.
 */
function buildVideoJsonLd(opts: {
  name: string;
  description: string;
  thumbnailUrl: string;
  uploadDate: string;        // ISO 8601 datetime
  contentUrl: string;
  embedUrl: string;
  pageUrl: string;
  durationSeconds: number | null;
  viewCount: number;
  likeCount: number;
  authorName: string;
  authorUrl: string;
}): string {
  // Convert seconds → ISO 8601 duration (e.g. 93 → "PT1M33S")
  function toIsoDuration(secs: number | null): string | null {
    if (!secs || secs <= 0) return null;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.round(secs % 60);
    let out = "PT";
    if (h) out += `${h}H`;
    if (m) out += `${m}M`;
    if (s || (!h && !m)) out += `${s}S`;
    return out;
  }

  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    "name": opts.name,
    "description": opts.description,
    "thumbnailUrl": opts.thumbnailUrl,
    "uploadDate": opts.uploadDate,
    "contentUrl": opts.contentUrl,
    "embedUrl": opts.embedUrl,
    "url": opts.pageUrl,
    "author": {
      "@type": "Person",
      "name": opts.authorName,
      "url": opts.authorUrl,
    },
    "publisher": {
      "@type": "Organization",
      "name": SITE_NAME,
      "url": SITE_URL,
      "logo": {
        "@type": "ImageObject",
        "url": `${SITE_URL}/logo.png`,
      },
    },
    "interactionStatistic": [
      {
        "@type": "InteractionCounter",
        "interactionType": "https://schema.org/WatchAction",
        "userInteractionCount": opts.viewCount,
      },
      {
        "@type": "InteractionCounter",
        "interactionType": "https://schema.org/LikeAction",
        "userInteractionCount": opts.likeCount,
      },
    ],
    "potentialAction": {
      "@type": "WatchAction",
      "target": opts.pageUrl,
    },
  };

  const iso = toIsoDuration(opts.durationSeconds);
  if (iso) ld["duration"] = iso;

  return JSON.stringify(ld);
}

// ── Full video share page ─────────────────────────────────────────────────────
function renderVideoPage(
  post: any,
  author: any,
  videoUrl: string,
  posterUrl: string,
  stats: { likes: number; replies: number },
  shortId: string,
  durationSeconds: number | null = null,
): string {
  const displayName = escapeHtml(author.display_name || "User");
  const handle = escapeHtml(author.handle || "user");
  const avatarUrl = author.avatar_url || "";
  const content = post.content || "";
  const contentEsc = escapeHtml(content);
  const ogDescription =
    truncate(content.replace(/\n+/g, " "), 200) ||
    `Video by ${displayName} on ${SITE_NAME}`;

  const pageUrl = `${SITE_URL}/video/${shortId}`;
  const embedUrl = `${SITE_URL}/video/${shortId}/embed`;
  const profileUrl = `${SITE_URL}/@${handle}`;
  const dateStr = new Date(post.created_at).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const isVerified = author.is_organization_verified || author.is_verified;
  const verifiedBadge = author.is_organization_verified
    ? `<span style="color:#D4A853;font-size:16px;" title="Verified Business">&#10004;</span>`
    : author.is_verified
    ? `<span style="color:${BRAND_COLOR};font-size:16px;" title="Verified">&#10004;</span>`
    : "";

  const ogImageFinal = posterUrl || avatarUrl || `${SITE_URL}/logo.png`;

  const jsonLd = buildVideoJsonLd({
    name: `@${author.handle || "user"}: ${content ? truncate(content, 100) : "Video"}`,
    description: ogDescription,
    thumbnailUrl: ogImageFinal,
    uploadDate: new Date(post.created_at).toISOString(),
    contentUrl: videoUrl,
    embedUrl,
    pageUrl,
    durationSeconds,
    viewCount: post.view_count || 0,
    likeCount: stats.likes,
    authorName: author.display_name || author.handle || "User",
    authorUrl: profileUrl,
  });

  return `<!DOCTYPE html>
<html lang="en" prefix="og: https://ogp.me/ns# video: https://ogp.me/ns/video#">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>@${handle} on ${SITE_NAME}: "${truncate(content, 60) || "Video"}"</title>
  <meta name="description" content="${escapeHtml(ogDescription)}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <link rel="canonical" href="${pageUrl}" />

  <!-- JSON-LD: VideoObject (Google Video Search + Discover eligibility) -->
  <script type="application/ld+json">${jsonLd}</script>

  <!-- Open Graph: video (WhatsApp, Facebook, Telegram inline playback) -->
  <meta property="og:type" content="video.other" />
  <meta property="og:title" content="@${handle}: &quot;${escapeHtml(truncate(content, 80) || "Video")}&quot;" />
  <meta property="og:description" content="${escapeHtml(ogDescription)}" />
  <meta property="og:url" content="${pageUrl}" />
  <meta property="og:site_name" content="${SITE_NAME}" />
  <meta property="og:image" content="${escapeHtml(ogImageFinal)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:video" content="${escapeHtml(videoUrl)}" />
  <meta property="og:video:secure_url" content="${escapeHtml(videoUrl)}" />
  <meta property="og:video:type" content="video/mp4" />
  <meta property="og:video:width" content="720" />
  <meta property="og:video:height" content="1280" />

  <!-- Twitter Player Card (in-feed video playback on Twitter/X) -->
  <meta name="twitter:card" content="player" />
  <meta name="twitter:site" content="@afuchat" />
  <meta name="twitter:creator" content="@${handle}" />
  <meta name="twitter:title" content="@${handle}: &quot;${escapeHtml(truncate(content, 60) || "Video")}&quot;" />
  <meta name="twitter:description" content="${escapeHtml(ogDescription)}" />
  <meta name="twitter:image" content="${escapeHtml(ogImageFinal)}" />
  <meta name="twitter:player" content="${embedUrl}" />
  <meta name="twitter:player:width" content="360" />
  <meta name="twitter:player:height" content="640" />

  <meta name="theme-color" content="${BRAND_COLOR}" />
  <link rel="icon" type="image/png" href="${SITE_URL}/favicon.png" />

  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Roboto,sans-serif;background:#0a0a0a;color:#e8eaed;min-height:100vh}
    .top-bar{background:linear-gradient(135deg,${BRAND_COLOR},${BRAND_DARK});padding:14px 20px;text-align:center}
    .top-bar a{color:#fff;text-decoration:none;font-weight:700;font-size:18px;letter-spacing:0.5px}
    .container{max-width:520px;margin:0 auto;padding:20px 16px}
    .video-card{background:#111;border-radius:16px;overflow:hidden;border:1px solid #222}
    .video-wrap{position:relative;width:100%;background:#000;aspect-ratio:9/16;max-height:70vh}
    video{width:100%;height:100%;display:block;object-fit:contain}
    .post-header{display:flex;align-items:center;gap:12px;padding:14px 16px}
    .avatar{width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid ${BRAND_COLOR}40;flex-shrink:0}
    .avatar-placeholder{width:44px;height:44px;border-radius:50%;background:${BRAND_COLOR};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#fff;flex-shrink:0}
    .author-info{flex:1;min-width:0}
    .author-name{font-weight:700;font-size:15px;color:#fff;display:flex;align-items:center;gap:4px}
    .author-handle{color:#888;font-size:13px;margin-top:2px}
    .post-content{padding:0 16px 14px;font-size:15px;line-height:1.6;white-space:pre-wrap;word-wrap:break-word;color:#ddd}
    .post-stats{display:flex;gap:20px;padding:10px 16px;border-top:1px solid #1e1e1e;color:#888;font-size:13px}
    .post-time{padding:8px 16px 14px;color:#555;font-size:12px}
    .cta-section{text-align:center;padding:28px 16px}
    .cta-title{font-size:18px;font-weight:700;color:#fff;margin-bottom:6px}
    .cta-sub{color:#888;font-size:14px;margin-bottom:18px}
    .cta-btn{display:inline-block;padding:13px 36px;background:${BRAND_COLOR};color:#fff;text-decoration:none;border-radius:14px;font-weight:700;font-size:15px}
    .cta-btn:hover{opacity:.85}
    .footer{text-align:center;padding:20px 16px 36px;color:#444;font-size:12px}
    .footer a{color:${BRAND_COLOR};text-decoration:none}
    @media(max-width:480px){.container{padding:8px 0}.video-card{border-radius:0;border-left:0;border-right:0}}
  </style>
</head>
<body>
  <div class="top-bar"><a href="${SITE_URL}">${SITE_NAME}</a></div>
  <div class="container">
    <div class="video-card">
      <div class="video-wrap">
        <video
          src="${escapeHtml(videoUrl)}"
          ${posterUrl ? `poster="${escapeHtml(posterUrl)}"` : ""}
          controls
          playsinline
          preload="metadata"
          style="background:#000"
        ></video>
      </div>
      <div class="post-header">
        <a href="${profileUrl}" style="text-decoration:none">
          ${avatarUrl
            ? `<img class="avatar" src="${escapeHtml(avatarUrl)}" alt="${displayName}" />`
            : `<div class="avatar-placeholder">${displayName.charAt(0).toUpperCase()}</div>`}
        </a>
        <div class="author-info">
          <a href="${profileUrl}" style="text-decoration:none">
            <div class="author-name">${displayName} ${verifiedBadge}</div>
            <div class="author-handle">@${handle} &middot; ${timeAgo(post.created_at)}</div>
          </a>
        </div>
      </div>
      ${content ? `<div class="post-content">${contentEsc}</div>` : ""}
      <div class="post-stats">
        <span>&#10084;&#65039; ${stats.likes.toLocaleString()}</span>
        <span>&#128172; ${stats.replies.toLocaleString()}</span>
        <span>&#128065;&#65039; ${(post.view_count || 0).toLocaleString()}</span>
      </div>
      <div class="post-time"><time datetime="${post.created_at}">${dateStr}</time></div>
    </div>

    <div class="cta-section">
      <div class="cta-title">Watch more on AfuChat</div>
      <div class="cta-sub">Join ${displayName} and thousands of creators</div>
      <a href="https://play.google.com/store/apps/details?id=com.afuchat.app" class="cta-btn">Get AfuChat</a>
    </div>

    <footer class="footer">
      <p>&copy; ${new Date().getFullYear()} <a href="${SITE_URL}">${SITE_NAME}</a>. All rights reserved.</p>
      <p style="margin-top:5px"><a href="${SITE_URL}/terms">Terms</a> &middot; <a href="${SITE_URL}/privacy">Privacy</a></p>
    </footer>
  </div>
</body>
</html>`;
}

function render404(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Video Not Found - ${SITE_NAME}</title>
  <meta name="robots" content="noindex" />
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}
    .wrap{text-align:center;padding:24px}
    h1{font-size:56px;color:${BRAND_COLOR};margin-bottom:12px}
    p{color:#888;font-size:16px;margin-bottom:24px}
    a{color:${BRAND_COLOR};text-decoration:none;font-weight:600}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>404</h1>
    <p>This video doesn't exist or has been removed.</p>
    <a href="${SITE_URL}">Go to AfuChat</a>
  </div>
</body>
</html>`;
}

async function handleVideoPage(param: string, res: any, embedOnly = false) {
  const postId = resolvePostId(param);
  if (!postId) return res.status(404).send(render404());

  const { data: post } = await supabase
    .from("posts")
    .select("id, content, video_url, image_url, created_at, author_id, view_count, post_type, video_asset_id")
    .eq("id", postId)
    .not("is_blocked", "is", true)
    .single();

  if (!post || !post.video_url) return res.status(404).send(render404());

  const videoUrl: string = post.video_url;
  const posterUrl: string = post.image_url || "";

  if (embedOnly) {
    res.set({
      "Cache-Control": "public, max-age=300",
      "X-Frame-Options": "ALLOWALL",
      "Content-Security-Policy": "frame-ancestors *",
    });
    return res.send(renderEmbedPage(videoUrl, posterUrl || undefined));
  }

  const assetId: string | null = (post as any).video_asset_id || null;

  const [{ data: author }, { data: likes }, { data: replies }, { data: asset }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, handle, avatar_url, is_verified, is_organization_verified, is_private")
      .eq("id", post.author_id)
      .single(),
    supabase.from("post_acknowledgments").select("id", { count: "exact", head: true }).eq("post_id", postId),
    supabase.from("post_replies").select("id", { count: "exact", head: true }).eq("post_id", postId),
    assetId
      ? supabase.from("video_assets").select("duration_seconds").eq("id", assetId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!author || author.is_private) return res.status(404).send(render404());

  const likeCount = (likes as any)?.count || 0;
  const replyCount = (replies as any)?.count || 0;
  const durationSeconds: number | null = (asset as any)?.duration_seconds ?? null;
  const shortId = encodeUuidToShort(post.id);

  res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  res.send(renderVideoPage(post, author, videoUrl, posterUrl, { likes: likeCount, replies: replyCount }, shortId, durationSeconds));
}

// Full video preview page
router.get("/video/:shortId", async (req, res) => {
  await handleVideoPage(req.params.shortId, res, false);
});

// Bare embed player (for Twitter Player Card iframe)
router.get("/video/:shortId/embed", async (req, res) => {
  await handleVideoPage(req.params.shortId, res, true);
});

export default router;

import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://rhnsjqqtdzlkvqazfcbg.supabase.co";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJobnNqcXF0ZHpsa3ZxYXpmY2JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2NzA4NjksImV4cCI6MjA3NzI0Njg2OX0.j8zuszO1K6Apjn-jRiVUyZeqe3Re424xyOho9qDl_oY";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
function decodeShortId(short: string): string {
  try {
    const base = BigInt(B62.length);
    let num = 0n;
    for (const ch of short) { const i = B62.indexOf(ch); if (i < 0) return short; num = num * base + BigInt(i); }
    const hex = num.toString(16).padStart(32, "0");
    return [hex.slice(0,8), hex.slice(8,12), hex.slice(12,16), hex.slice(16,20), hex.slice(20,32)].join("-");
  } catch { return short; }
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

const BRAND_COLOR = "#00BCD4";
const BRAND_DARK = "#0097A7";
const SITE_NAME = "AfuChat";
const SITE_URL = "https://afuchat.com";
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.png`;

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
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

function renderPostPage(post: any, author: any, images: string[], stats: { likes: number; replies: number }, shortId?: string): string {
  const displayName = escapeHtml(author.display_name || "User");
  const handle = escapeHtml(author.handle || "user");
  const avatarUrl = author.avatar_url || "";
  const content = post.content || "";
  const contentEsc = escapeHtml(content);
  const ogDescription = truncate(content.replace(/\n+/g, " "), 200) || `Post by ${displayName} on ${SITE_NAME}`;
  const ogImage = images[0] || avatarUrl || DEFAULT_OG_IMAGE;
  const slug = shortId || encodeUuidToShort(post.id);
  const postUrl = `${SITE_URL}/p/${slug}`;
  const profileUrl = `${SITE_URL}/@${handle}`;
  const dateStr = new Date(post.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const isVerified = author.is_organization_verified || author.is_verified;
  const verifiedBadge = author.is_organization_verified
    ? '<span style="color:#D4A853;font-size:16px;" title="Verified Business">&#10004;</span>'
    : author.is_verified
      ? `<span style="color:${BRAND_COLOR};font-size:16px;" title="Verified">&#10004;</span>`
      : "";

  const imagesHtml = images.map((img, i) =>
    `<img src="${escapeHtml(img)}" alt="Post image ${i + 1}" style="width:100%;border-radius:12px;margin-top:12px;max-height:500px;object-fit:cover;" loading="${i === 0 ? "eager" : "lazy"}" />`
  ).join("");

  const viewCount = post.view_count || 0;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SocialMediaPosting",
    headline: truncate(content, 110) || `Post by ${author.display_name}`,
    articleBody: content,
    url: postUrl,
    datePublished: post.created_at,
    author: {
      "@type": "Person",
      name: author.display_name || "User",
      alternateName: `@${author.handle}`,
      url: profileUrl,
      image: avatarUrl || undefined,
    },
    image: images.length > 0 ? images : undefined,
    interactionStatistic: [
      { "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: stats.likes },
      { "@type": "InteractionCounter", interactionType: "https://schema.org/CommentAction", userInteractionCount: stats.replies },
      { "@type": "InteractionCounter", interactionType: "https://schema.org/WatchAction", userInteractionCount: viewCount },
    ],
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
  };

  return `<!DOCTYPE html>
<html lang="en" prefix="og: https://ogp.me/ns#">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${displayName}: "${truncate(content, 60) || "Post"}" - ${SITE_NAME}</title>
  <meta name="description" content="${escapeHtml(ogDescription)}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <link rel="canonical" href="${postUrl}" />

  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(`${displayName} on ${SITE_NAME}`)}" />
  <meta property="og:description" content="${escapeHtml(ogDescription)}" />
  <meta property="og:url" content="${postUrl}" />
  <meta property="og:site_name" content="${SITE_NAME}" />
  <meta property="og:image" content="${escapeHtml(ogImage)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="article:published_time" content="${post.created_at}" />
  <meta property="article:author" content="${profileUrl}" />

  <meta name="twitter:card" content="${images.length > 0 ? "summary_large_image" : "summary"}" />
  <meta name="twitter:title" content="${escapeHtml(`${displayName} on ${SITE_NAME}`)}" />
  <meta name="twitter:description" content="${escapeHtml(ogDescription)}" />
  <meta name="twitter:image" content="${escapeHtml(ogImage)}" />
  <meta name="twitter:site" content="@afuchat" />

  <meta name="theme-color" content="${BRAND_COLOR}" />
  <link rel="icon" type="image/png" href="${SITE_URL}/favicon.png" />

  <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/<\//g, "<\\/")}</script>

  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Roboto,sans-serif;background:#0a0a0a;color:#e8eaed;min-height:100vh}
    .top-bar{background:linear-gradient(135deg,${BRAND_COLOR},${BRAND_DARK});padding:14px 20px;text-align:center}
    .top-bar a{color:#fff;text-decoration:none;font-weight:700;font-size:18px;letter-spacing:0.5px}
    .container{max-width:620px;margin:0 auto;padding:20px 16px}
    .post-card{background:#1a1a1a;border-radius:16px;overflow:hidden;border:1px solid #2a2a2a}
    .post-header{display:flex;align-items:center;gap:12px;padding:16px 16px 0}
    .avatar{width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid ${BRAND_COLOR}30;flex-shrink:0}
    .avatar-placeholder{width:48px;height:48px;border-radius:50%;background:${BRAND_COLOR};display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:#fff;flex-shrink:0}
    .author-info{flex:1;min-width:0}
    .author-name{font-weight:700;font-size:16px;color:#fff;display:flex;align-items:center;gap:4px}
    .author-handle{color:#888;font-size:14px;margin-top:1px}
    .post-content{padding:14px 16px;font-size:16px;line-height:1.65;white-space:pre-wrap;word-wrap:break-word}
    .post-images{padding:0 16px 12px}
    .post-stats{display:flex;gap:24px;padding:12px 16px;border-top:1px solid #2a2a2a;color:#888;font-size:14px}
    .post-stats span{display:flex;align-items:center;gap:6px}
    .post-time{padding:0 16px 14px;color:#666;font-size:13px}
    .cta-section{text-align:center;padding:32px 16px}
    .cta-title{font-size:20px;font-weight:700;color:#fff;margin-bottom:8px}
    .cta-sub{color:#888;font-size:15px;margin-bottom:20px}
    .cta-btn{display:inline-block;padding:14px 40px;background:${BRAND_COLOR};color:#fff;text-decoration:none;border-radius:14px;font-weight:700;font-size:16px;transition:opacity .2s}
    .cta-btn:hover{opacity:.85}
    .footer{text-align:center;padding:24px 16px 40px;color:#444;font-size:13px}
    .footer a{color:${BRAND_COLOR};text-decoration:none}
    .more-link{display:block;text-align:center;padding:16px;color:${BRAND_COLOR};text-decoration:none;font-weight:600;font-size:15px}
    @media(max-width:480px){.container{padding:12px 0}.post-card{border-radius:0;border-left:0;border-right:0}}
  </style>
</head>
<body>
  <div class="top-bar"><a href="${SITE_URL}">${SITE_NAME}</a></div>
  <div class="container">
    <article class="post-card" itemscope itemtype="https://schema.org/SocialMediaPosting">
      <div class="post-header">
        <a href="${profileUrl}" style="text-decoration:none">
          ${avatarUrl
            ? `<img class="avatar" src="${escapeHtml(avatarUrl)}" alt="${displayName}" />`
            : `<div class="avatar-placeholder">${displayName.charAt(0).toUpperCase()}</div>`}
        </a>
        <div class="author-info">
          <a href="${profileUrl}" style="text-decoration:none">
            <div class="author-name" itemprop="author" itemscope itemtype="https://schema.org/Person">
              <span itemprop="name">${displayName}</span> ${verifiedBadge}
            </div>
            <div class="author-handle">@${handle} &middot; ${timeAgo(post.created_at)}</div>
          </a>
        </div>
      </div>
      <div class="post-content" itemprop="articleBody">${contentEsc}</div>
      ${images.length > 0 ? `<div class="post-images">${imagesHtml}</div>` : ""}
      <div class="post-stats">
        <span>&#10084;&#65039; ${stats.likes.toLocaleString()} likes</span>
        <span>&#128172; ${stats.replies.toLocaleString()} replies</span>
        <span>&#128065;&#65039; ${viewCount.toLocaleString()} views</span>
      </div>
      <div class="post-time">
        <time datetime="${post.created_at}" itemprop="datePublished">${dateStr}</time>
      </div>
      <meta itemprop="url" content="${postUrl}" />
    </article>

    <a class="more-link" href="${profileUrl}">See more from @${handle} &rarr;</a>

    <div class="cta-section">
      <div class="cta-title">Join the conversation</div>
      <div class="cta-sub">Like, reply, and connect with ${displayName} on AfuChat</div>
      <a href="https://play.google.com/store/apps/details?id=com.afuchat.app" class="cta-btn">Get AfuChat</a>
    </div>

    <footer class="footer">
      <p>&copy; ${new Date().getFullYear()} <a href="${SITE_URL}">${SITE_NAME}</a>. All rights reserved.</p>
      <p style="margin-top:6px"><a href="${SITE_URL}/terms">Terms</a> &middot; <a href="${SITE_URL}/privacy">Privacy</a></p>
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
  <title>Post Not Found - ${SITE_NAME}</title>
  <meta name="robots" content="noindex" />
  <meta property="og:title" content="Post Not Found - ${SITE_NAME}" />
  <meta property="og:description" content="This post doesn't exist or has been removed." />
  <meta property="og:site_name" content="${SITE_NAME}" />
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
    <p>This post doesn't exist or has been removed.</p>
    <a href="${SITE_URL}">Go to AfuChat</a>
  </div>
</body>
</html>`;
}

async function handlePostPage(param: string, res: any) {
  const postId = resolvePostId(param);
  if (!postId) return res.status(404).send(render404());

  const { data: post } = await supabase
    .from("posts")
    .select("id, content, image_url, created_at, author_id, view_count")
    .eq("id", postId)
    .eq("is_blocked", false)
    .single();

  if (!post) return res.status(404).send(render404());

  const [{ data: author }, { data: postImages }, { data: likes }, { data: replies }] = await Promise.all([
    supabase.from("profiles").select("display_name, handle, avatar_url, is_verified, is_organization_verified, is_private").eq("id", post.author_id).single(),
    supabase.from("post_images").select("image_url, display_order").eq("post_id", postId).order("display_order", { ascending: true }),
    supabase.from("post_acknowledgments").select("id", { count: "exact", head: true }).eq("post_id", postId),
    supabase.from("post_replies").select("id", { count: "exact", head: true }).eq("post_id", postId),
  ]);

  if (!author || author.is_private) return res.status(404).send(render404());

  const images: string[] = [];
  if (postImages && postImages.length > 0) {
    images.push(...postImages.map((pi: any) => pi.image_url));
  } else if (post.image_url) {
    images.push(post.image_url);
  }

  const likeCount = (likes as any)?.count || 0;
  const replyCount = (replies as any)?.count || 0;

  const shortId = encodeUuidToShort(post.id);
  res.send(renderPostPage(post, author, images, { likes: likeCount, replies: replyCount }, shortId));
}

router.get("/p/:shortId", async (req, res) => {
  await handlePostPage(req.params.shortId, res);
});

router.get("/post/:id", async (req, res) => {
  const postId = req.params.id;
  if (UUID_RE.test(postId)) {
    const shortId = encodeUuidToShort(postId);
    return res.redirect(301, `/p/${shortId}`);
  }
  await handlePostPage(postId, res);
});

export default router;

import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "../lib/constants";

const router = Router();

const supabaseUrl = SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJobnNqcXF0ZHpsa3ZxYXpmY2JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2NzA4NjksImV4cCI6MjA3NzI0Njg2OX0.j8zuszO1K6Apjn-jRiVUyZeqe3Re424xyOho9qDl_oY";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const BRAND_COLOR = "#00BCD4";
const SITE_NAME = "AfuChat";
const SITE_URL = "https://afuchat.com";

const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
function encodeUuidToShort(uuid: string): string {
  const hex = uuid.replace(/-/g, "");
  let num = BigInt("0x" + hex);
  if (num === 0n) return B62[0];
  let r = "";
  const base = BigInt(B62.length);
  while (num > 0n) { r = B62[Number(num % base)] + r; num = num / base; }
  return r;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderProfilePage(profile: any, posts: any[], isPrivate = false): string {
  const displayName = escapeHtml(profile.display_name || "User");
  const handle = escapeHtml(profile.handle || "");
  const bio = escapeHtml(profile.bio || "");
  const avatarUrl = profile.avatar_url || "";
  const isVerified = profile.is_organization_verified || profile.is_verified;
  const verifiedBadge = profile.is_organization_verified
    ? '<span style="color:#D4A853;margin-left:4px;" title="Verified Business">&#10004;</span>'
    : profile.is_verified
      ? `<span style="color:${BRAND_COLOR};margin-left:4px;" title="Verified">&#10004;</span>`
      : "";

  const postsHtml = posts.map((p) => {
    const content = escapeHtml(p.content || "");
    const contentTrunc = content.length > 280 ? content.substring(0, 277) + "..." : content;
    const date = new Date(p.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const images = (p.images || []).map((img: string) =>
      `<img src="${escapeHtml(img)}" alt="Post image" style="max-width:100%;border-radius:12px;margin-top:8px;" loading="lazy" />`
    ).join("");
    const postUrl = `${SITE_URL}/p/${encodeUuidToShort(p.id)}`;
    return `
      <a href="${postUrl}" style="text-decoration:none;color:inherit;display:block">
        <article class="post" itemscope itemtype="https://schema.org/SocialMediaPosting">
          <meta itemprop="author" content="${displayName}" />
          <meta itemprop="datePublished" content="${p.created_at}" />
          <meta itemprop="url" content="${postUrl}" />
          <p itemprop="articleBody">${contentTrunc}</p>
          ${images}
          <div class="post-meta">
            <time datetime="${p.created_at}">${date}</time>
          </div>
        </article>
      </a>
    `;
  }).join("");

  const followerCount = profile.followers || 0;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    name: `${profile.display_name || "User"} on AfuChat`,
    url: `${SITE_URL}/@${profile.handle}`,
    mainEntity: {
      "@type": "Person",
      name: profile.display_name || "User",
      alternateName: `@${profile.handle}`,
      url: `${SITE_URL}/@${profile.handle}`,
      image: avatarUrl || undefined,
      description: profile.bio || `${profile.display_name || "User"} on AfuChat`,
      sameAs: profile.website ? [profile.website] : [],
      interactionStatistic: [
        {
          "@type": "InteractionCounter",
          interactionType: "https://schema.org/FollowAction",
          userInteractionCount: followerCount,
        },
        {
          "@type": "InteractionCounter",
          interactionType: "https://schema.org/WriteAction",
          userInteractionCount: posts.length,
        },
      ],
    },
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${displayName} (@${handle}) — ${SITE_NAME}</title>
  <meta name="description" content="${followerCount > 0 ? `${followerCount.toLocaleString()} followers. ` : ""}${bio ? escapeHtml(bio) : `${displayName} on ${SITE_NAME}. Join AfuChat to connect.`}" />
  <meta name="robots" content="${isPrivate ? "noindex, nofollow" : "index, follow"}" />
  <link rel="canonical" href="${SITE_URL}/@${handle}" />

  <meta property="og:type" content="profile" />
  <meta property="og:title" content="${displayName} (@${handle})" />
  <meta property="og:description" content="${bio || `${displayName} on ${SITE_NAME}`}" />
  <meta property="og:url" content="${SITE_URL}/@${handle}" />
  <meta property="og:site_name" content="${SITE_NAME}" />
  ${avatarUrl ? `<meta property="og:image" content="${escapeHtml(avatarUrl)}" />` : ""}
  <meta property="profile:username" content="${handle}" />

  <meta name="twitter:card" content="summary" />
  <meta name="twitter:site" content="@afuchat" />
  <meta name="twitter:title" content="${displayName} (@${handle})" />
  <meta name="twitter:description" content="${bio || `${displayName} on ${SITE_NAME}`}" />
  ${avatarUrl ? `<meta name="twitter:image" content="${escapeHtml(avatarUrl)}" />` : ""}
  <meta name="theme-color" content="${BRAND_COLOR}" />

  <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/<\//g, "<\\/")}</script>

  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
      background: #000;
      color: #fff;
      min-height: 100vh;
    }
    .container { max-width: 640px; margin: 0 auto; padding: 24px 16px; }
    .profile-header {
      text-align: center;
      padding: 40px 20px;
      background: linear-gradient(135deg, ${BRAND_COLOR}22, ${BRAND_COLOR}08);
      border-radius: 20px;
      margin-bottom: 24px;
    }
    .avatar {
      width: 96px;
      height: 96px;
      border-radius: 50%;
      object-fit: cover;
      border: 3px solid ${BRAND_COLOR};
      margin-bottom: 16px;
    }
    .avatar-placeholder {
      width: 96px;
      height: 96px;
      border-radius: 50%;
      background: ${BRAND_COLOR};
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 36px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 16px;
    }
    .name { font-size: 24px; font-weight: 700; display: inline; }
    .handle { color: #888; font-size: 15px; margin-top: 4px; }
    .bio { color: #ccc; font-size: 15px; margin-top: 12px; line-height: 1.5; max-width: 400px; margin-left: auto; margin-right: auto; }
    .stats { display: flex; gap: 24px; justify-content: center; margin-top: 20px; }
    .stat-item { text-align: center; }
    .stat-value { font-size: 18px; font-weight: 700; color: ${BRAND_COLOR}; }
    .stat-label { font-size: 12px; color: #888; }
    .cta-btn {
      display: inline-block;
      margin-top: 20px;
      padding: 12px 32px;
      background: ${BRAND_COLOR};
      color: #fff;
      text-decoration: none;
      border-radius: 12px;
      font-weight: 600;
      font-size: 15px;
    }
    .cta-btn:hover { opacity: 0.9; }
    .posts-section { margin-top: 8px; }
    .posts-title { font-size: 18px; font-weight: 600; margin-bottom: 16px; color: #ccc; }
    .post {
      background: #111;
      border-radius: 14px;
      padding: 16px;
      margin-bottom: 12px;
    }
    .post p { font-size: 15px; line-height: 1.6; }
    .post-meta {
      display: flex;
      gap: 16px;
      margin-top: 12px;
      font-size: 13px;
      color: #666;
    }
    .empty-posts { text-align: center; color: #666; padding: 40px; }
    .footer {
      text-align: center;
      padding: 40px 16px;
      color: #444;
      font-size: 13px;
    }
    .footer a { color: ${BRAND_COLOR}; text-decoration: none; }
    .badge-business {
      display: inline-block;
      background: #D4A853;
      color: #fff;
      font-size: 10px;
      padding: 2px 8px;
      border-radius: 10px;
      margin-left: 6px;
      vertical-align: middle;
    }
  </style>
</head>
<body>
  <div class="container" itemscope itemtype="https://schema.org/ProfilePage">
    <header class="profile-header">
      ${avatarUrl
        ? `<img class="avatar" src="${escapeHtml(avatarUrl)}" alt="${displayName}" itemprop="image" />`
        : `<div class="avatar-placeholder">${displayName.charAt(0).toUpperCase()}</div>`
      }
      <div>
        <h1 class="name" itemprop="name">${displayName}</h1>${verifiedBadge}
        ${profile.is_organization_verified ? '<span class="badge-business">Business</span>' : ""}
      </div>
      <p class="handle" itemprop="alternateName">@${handle}</p>
      ${bio ? `<p class="bio" itemprop="description">${bio}</p>` : ""}
      <div class="stats">
        <div class="stat-item">
          <div class="stat-value">${posts.length}</div>
          <div class="stat-label">Posts</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${(profile.followers || 0).toLocaleString()}</div>
          <div class="stat-label">Followers</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${(profile.following || 0).toLocaleString()}</div>
          <div class="stat-label">Following</div>
        </div>
      </div>
      <a href="${SITE_URL}?ref=${handle}" class="cta-btn">Join AfuChat</a>
    </header>

    ${posts.length > 0 ? `
      <section class="posts-section">
        <h2 class="posts-title">Recent Posts</h2>
        ${postsHtml}
      </section>
    ` : `
      <div class="empty-posts">
        <p>No public posts yet.</p>
      </div>
    `}

    <footer class="footer">
      <p>&copy; ${new Date().getFullYear()} <a href="${SITE_URL}">${SITE_NAME}</a>. All rights reserved.</p>
      <p style="margin-top:8px;">
        <a href="${SITE_URL}/terms">Terms</a> &middot; <a href="${SITE_URL}/privacy">Privacy</a>
      </p>
    </footer>
  </div>
</body>
</html>`;
}

function render404Page(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>User Not Found - ${SITE_NAME}</title>
  <meta name="robots" content="noindex" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; background: #000; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; }
    .wrap { text-align: center; }
    h1 { font-size: 48px; color: ${BRAND_COLOR}; margin-bottom: 12px; }
    p { color: #888; font-size: 16px; margin-bottom: 24px; }
    a { color: ${BRAND_COLOR}; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>404</h1>
    <p>This user doesn't exist on AfuChat.</p>
    <a href="${SITE_URL}">Go to AfuChat</a>
  </div>
</body>
</html>`;
}

router.get("/@:handle", async (req, res) => {
  const handle = req.params.handle?.toLowerCase();
  if (!handle) return res.status(404).send(render404Page());

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("handle", handle)
    .single();

  if (!profile) {
    return res.status(404).send(render404Page());
  }

  if (profile.is_private) {
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return res.send(renderProfilePage({
      ...profile,
      bio: "This account is private.",
      xp: 0,
      website_url: null,
    }, [], true));
  }

  const [{ data: posts }, { data: postImages }, { data: followersData }, { data: followingData }] = await Promise.all([
    supabase.from("posts").select("id, content, image_url, created_at, view_count").eq("author_id", profile.id).eq("is_blocked", false).order("created_at", { ascending: false }).limit(20),
    supabase.from("post_images").select("post_id, image_url, display_order").in("post_id", (await supabase.from("posts").select("id").eq("author_id", profile.id).eq("is_blocked", false).order("created_at", { ascending: false }).limit(20)).data?.map((p: any) => p.id) || []).order("display_order", { ascending: true }),
    supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", profile.id),
    supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", profile.id),
  ]);

  const imageMap: Record<string, string[]> = {};
  for (const pi of (postImages || [])) {
    if (!imageMap[pi.post_id]) imageMap[pi.post_id] = [];
    imageMap[pi.post_id].push(pi.image_url);
  }

  const enrichedPosts = (posts || []).map((p: any) => ({
    ...p,
    images: imageMap[p.id] || (p.image_url ? [p.image_url] : []),
    likes: 0,
    comments: 0,
  }));

  const followers = (followersData as any)?.count || 0;
  const following = (followingData as any)?.count || 0;

  res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  return res.send(renderProfilePage({ ...profile, followers, following }, enrichedPosts));
});

router.get("/:handle", async (req, res, next) => {
  const handle = req.params.handle?.toLowerCase();
  if (!handle || handle.includes(".") || handle === "api" || handle === "admin") {
    return next();
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, handle")
    .eq("handle", handle)
    .single();

  if (profile) {
    if (req.query.join === "1" || req.headers.referer?.includes("share")) {
      return res.redirect(302, `/@${handle}?ref=${handle}`);
    }
    return res.redirect(301, `/@${handle}`);
  }

  return next();
});

export default router;

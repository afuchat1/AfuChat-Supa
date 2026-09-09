const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://rhnsjqqtdzlkvqazfcbg.supabase.co";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJobnNqcXF0ZHpsa3ZxYXpmY2JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2NzA4NjksImV4cCI6MjA3NzI0Njg2OX0.j8zuszO1K6Apjn-jRiVUyZeqe3Re424xyOho9qDl_oY";
const CACHE_TTL_MS = 60_000;
const cache = new Map();

const RESERVED_HANDLES = new Set([
  "browser", "onboarding", "welcome", "settings", "wallet", "shop", "chat",
  "discover", "video", "shorts", "moments", "match", "games", "ai", "support",
  "company", "freelance", "article", "channel", "group", "join", "my-posts",
  "profile", "post", "stories", "red-envelope", "mini-programs", "gifts", "p",
  "update-password", "contact", "cart", "orders", "product", "index", "logout",
  "register", "login", "reset-password", "404", "not-found", "about", "lab",
  "achievements", "watch-history", "prestige", "store", "premium", "status",
  "digital-id", "qr-scanner", "create-post", "followers", "saved-posts",
  "collections", "language-settings", "device-security", "phone-contacts",
  "user-discovery", "username-market", "digital-events", "file-manager",
  "business", "business-verification", "paid-communities", "help",
]);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function text(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function routePart(value) {
  return decodeURIComponent(String(value || "")).trim();
}

function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit || Date.now() - hit.createdAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value) {
  cache.set(key, { createdAt: Date.now(), value });
  if (cache.size > 200) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  return value;
}

async function rest(path, options = {}) {
  if (!isConfigured()) return null;
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    console.warn(`[public-crawler] Supabase request failed (${response.status})`);
    return null;
  }
  return response.json();
}

async function rows(table, select, filters = []) {
  const params = new URLSearchParams({ select });
  for (const [key, value] of filters) params.append(key, value);
  return (await rest(`${table}?${params.toString()}`)) || [];
}

async function first(table, select, filters = []) {
  const result = await rows(table, select, [...filters, ["limit", "1"]]);
  return Array.isArray(result) ? result[0] || null : null;
}

async function count(table, filters) {
  if (!isConfigured()) return null;
  const params = new URLSearchParams({ select: "id", limit: "1" });
  for (const [key, value] of filters) params.append(key, value);
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${table}?${params.toString()}`, {
    method: "GET",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Prefer: "count=exact",
    },
  });
  if (!response.ok) return null;
  const range = response.headers.get("content-range") || "";
  const total = range.match(/\/(\d+|\*)$/)?.[1];
  return total && total !== "*" ? Number(total) : null;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

function publicMedia(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => item?.image_url)
    .filter(Boolean);
}

function listMarkup(items, renderItem) {
  if (!items?.length) return "";
  return `<ul>${items.map((item) => `<li>${renderItem(item)}</li>`).join("")}</ul>`;
}

async function getProfile(id) {
  const profile = await first("profiles",
    "id,display_name,handle,avatar_url,banner_url,bio,is_verified,is_organization_verified,is_business_mode,is_private,country,website_url,current_grade,created_at",
    [["id", `eq.${id}`]],
  );
  if (!profile) return null;

  const isPrivate = Boolean(profile.is_private);
  if (isPrivate) return { profile, followers: null, following: null, posts: null, grid: [] };

  const [followers, following, posts, grid] = await Promise.all([
    count("follows", [["following_id", `eq.${id}`]]),
    count("follows", [["follower_id", `eq.${id}`]]),
    count("posts", [
      ["author_id", `eq.${id}`],
      ["or", "(visibility.eq.public,visibility.is.null)"],
    ]),
    rows("posts", "id,content,image_url,article_cover_url,video_url,post_type,article_title,created_at", [
      ["author_id", `eq.${id}`],
      ["or", "(visibility.eq.public,visibility.is.null)"],
      ["order", "created_at.desc"],
      ["limit", "90"],
    ]),
  ]);
  return { profile, followers, following, posts, grid: Array.isArray(grid) ? grid : [] };
}

async function profileByHandle(handle) {
  const profile = await first("profiles", "id", [["handle", `ilike.${handle}`]]);
  if (profile?.id) return getProfile(profile.id);

  const alias = await first("owned_usernames", "owner_id", [["handle", `ilike.${handle}`]]);
  if (alias?.owner_id) return getProfile(alias.owner_id);
  return null;
}

export function profileContent(data) {
  const p = data.profile;
  const displayName = text(p.display_name || p.handle || "AfuChat profile");
  const privateNotice = p.is_private
    ? `<p>This profile is private. Only information that AfuChat makes public is shown.</p>`
    : "";
  const links = [
    p.country && `Country: ${text(p.country)}`,
    p.website_url && `Website: ${text(p.website_url)}`,
    p.created_at && `Joined: ${formatDate(p.created_at)}`,
  ].filter(Boolean);
  const visiblePosts = (data.grid || []).filter((post) => post.content || post.image_url || post.article_cover_url || post.video_url || post.article_title);
  const postsMarkup = listMarkup(visiblePosts.slice(0, 90), (post) => {
    const kind = text(post.post_type || "post");
    const title = text(post.article_title || post.content || `${kind} shared on AfuChat`);
    const media = publicMedia([{ image_url: post.image_url }, { image_url: post.article_cover_url }]);
    return `<a href="/post/${encodeURIComponent(post.id)}">${escapeHtml(title)}${media.length ? ` (${media.length} public image${media.length === 1 ? "" : "s"})` : ""} — ${escapeHtml(formatDate(post.created_at))}</a>`;
  });
  const stats = [
    data.followers !== null && `Followers: ${data.followers ?? 0}`,
    data.following !== null && `Following: ${data.following ?? 0}`,
    data.posts !== null && `Public posts: ${data.posts ?? 0}`,
  ].filter(Boolean);

  return {
    title: `${displayName} (@${text(p.handle)}) on AfuChat`,
    description: text(p.bio || `${displayName}'s public AfuChat profile.`),
    html: `
      <h1>${escapeHtml(displayName)}</h1>
      <p>Public AfuChat profile: @${escapeHtml(p.handle)}</p>
      ${p.is_verified || p.is_organization_verified ? "<p>Verified account.</p>" : ""}
      ${p.bio ? `<p>${escapeHtml(p.bio)}</p>` : ""}
      ${stats.length ? `<p>${escapeHtml(stats.join(" · "))}</p>` : ""}
      ${links.length ? `<p>${links.map(escapeHtml).join(" · ")}</p>` : ""}
      ${privateNotice}
      ${postsMarkup ? `<h2>Public posts</h2>${postsMarkup}` : ""}
    `,
  };
}

export async function publicProfileSummaries() {
  return rows(
    "profiles",
    "id,display_name,handle,avatar_url,banner_url,bio,is_verified,is_organization_verified,is_business_mode,is_private,country,website_url,current_grade,created_at",
    [
      ["handle", "not.is.null"],
      ["or", "(is_private.eq.false,is_private.is.null)"],
      ["limit", "5000"],
    ],
  );
}

async function postById(id, requiredType = null) {
  const post = await first("posts",
    "id,author_id,content,image_url,created_at,view_count,like_count,post_type,visibility,article_title,article_body,video_url,audio_name,profiles!posts_author_id_fkey(display_name,handle,avatar_url,is_verified,is_organization_verified),post_images(image_url,display_order)",
    [
      ["id", `eq.${id}`],
      ["or", "(visibility.eq.public,visibility.is.null)"],
      ...(requiredType === "video" ? [["video_url", "not.is.null"]] : []),
    ],
  );
  if (!post) return null;
  if (requiredType && post.post_type && post.post_type !== requiredType) return null;
  return post;
}

function postContent(post, kind = "post") {
  const author = post.profiles || {};
  const authorName = text(author.display_name || author.handle || "AfuChat user");
  const body = text(kind === "article" ? (post.article_body || post.content) : post.content);
  const title = text(post.article_title || (kind === "article" ? "AfuChat article" : `${kind[0].toUpperCase()}${kind.slice(1)} on AfuChat`));
  const images = [
    post.image_url,
    ...publicMedia((post.post_images || []).sort((a, b) => (a.display_order || 0) - (b.display_order || 0))),
  ].filter(Boolean);
  return {
    title: `${title} — AfuChat`,
    description: body || `${kind} shared by @${text(author.handle)}`,
    html: `
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(kind[0].toUpperCase() + kind.slice(1))} by <a href="/${encodeURIComponent(text(author.handle))}">${escapeHtml(authorName)} (@${escapeHtml(author.handle)})</a>${post.created_at ? ` on ${escapeHtml(formatDate(post.created_at))}` : ""}</p>
      ${body ? `<p>${escapeHtml(body)}</p>` : ""}
      ${post.video_url ? `<p>Public video: ${escapeHtml(post.video_url)}</p>` : ""}
      ${images.length ? `<h2>Public media</h2>${listMarkup(images, (url) => `<img src="${escapeHtml(url)}" alt="${escapeHtml(title)}" />`)}` : ""}
      <p>${post.like_count ?? 0} likes · ${post.view_count ?? 0} views</p>
    `,
  };
}

async function channelById(id) {
  return first("channels", "id,name,handle,description,avatar_url,is_public", [
    ["id", `eq.${id}`],
    ["is_public", "eq.true"],
  ]);
}

function channelContent(channel) {
  const name = text(channel.name || channel.handle || "Public channel");
  return {
    title: `${name} (@${text(channel.handle)}) — AfuChat`,
    description: text(channel.description || `${name} is a public AfuChat channel.`),
    html: `
      <h1>${escapeHtml(name)}</h1>
      <p>Public AfuChat channel: @${escapeHtml(channel.handle)}</p>
      ${channel.description ? `<p>${escapeHtml(channel.description)}</p>` : ""}
    `,
  };
}

async function companyBySlug(slug) {
  return first("organization_pages",
    "id,slug,name,tagline,description,logo_url,cover_url,website,industry,org_type,size,founded_year,location,social_links,is_verified,followers_count,posts_count",
    [["slug", `eq.${slug}`]],
  );
}

function companyContent(company) {
  const name = text(company.name || company.slug || "AfuChat company");
  const details = [
    company.industry && `Industry: ${text(company.industry)}`,
    company.org_type && `Type: ${text(company.org_type)}`,
    company.size && `Size: ${text(company.size)}`,
    company.location && `Location: ${text(company.location)}`,
    company.founded_year && `Founded: ${text(company.founded_year)}`,
  ].filter(Boolean);
  return {
    title: `${name} — AfuChat`,
    description: text(company.tagline || company.description || `${name}'s public AfuChat company page.`),
    html: `
      <h1>${escapeHtml(name)}</h1>
      <p>Public AfuChat company page: ${escapeHtml(company.slug)}</p>
      ${company.is_verified ? "<p>Verified organization.</p>" : ""}
      ${company.tagline ? `<p>${escapeHtml(company.tagline)}</p>` : ""}
      ${company.description ? `<p>${escapeHtml(company.description)}</p>` : ""}
      ${details.length ? `<p>${details.map(escapeHtml).join(" · ")}</p>` : ""}
      <p>${company.followers_count ?? 0} followers · ${company.posts_count ?? 0} posts</p>
      ${company.website ? `<p>Website: <a href="${escapeHtml(company.website)}">${escapeHtml(company.website)}</a></p>` : ""}
    `,
  };
}

async function contentForPath(pathname) {
  const segments = pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean).map(routePart);
  if (!segments.length) return null;

  if (segments.length === 1 && !RESERVED_HANDLES.has(segments[0].toLowerCase())) {
    const profile = await profileByHandle(segments[0].replace(/^@/, "").toLowerCase());
    if (profile) return profileContent(profile);
  }

  if (segments[0] === "contact" && segments[1]) {
    const profile = await getProfile(segments[1]);
    return profile ? profileContent(profile) : null;
  }

  if (segments[0] === "id" && segments[1]) {
    const result = await rest("rpc/lookup_profile_by_afu_id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p_afu_id: segments[1].padStart(8, "0") }),
    });
    const profileId = Array.isArray(result) ? result[0]?.id : null;
    const profile = profileId ? await getProfile(profileId) : null;
    return profile ? profileContent(profile) : null;
  }

  if (segments[0] === "post" && segments[1]) {
    const post = await postById(segments[1]);
    return post ? postContent(post) : null;
  }

  if (segments[0] === "article" && segments[1]) {
    const post = await postById(segments[1], "article");
    return post ? postContent(post, "article") : null;
  }

  if (segments[0] === "video" && segments[1]) {
    const post = await postById(segments[1], "video");
    return post ? postContent(post, "video") : null;
  }

  if (segments[0] === "channel" && segments[1]) {
    const channel = await channelById(segments[1]);
    return channel ? channelContent(channel) : null;
  }

  if (segments[0] === "company" && segments[1]) {
    const company = await companyBySlug(segments[1]);
    return company ? companyContent(company) : null;
  }

  return null;
}

export function injectMeta(html, content) {
  const title = escapeHtml(content.title);
  const description = escapeHtml(content.description);
  const metadata = `
    <title>${title}</title>
    <meta name="description" content="${description}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
  `;
  const crawlerSection = `
    <section id="afuchat-public-content" aria-label="${title}" style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:normal;border:0">
      ${content.html}
    </section>
  `;
  const noScript = `
    <noscript>
      <main id="afuchat-nojs-content" aria-label="${title}">
        ${content.html}
      </main>
    </noscript>
  `;
  const withMetadata = html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`)
    .replace(/<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${description}">`)
    .replace("</head>", `${metadata}</head>`);
  const withNoScript = withMetadata.includes('id="afuchat-nojs-content"')
    ? withMetadata.replace(/<main id="afuchat-nojs-content"[^>]*>[\s\S]*?<\/main>/i, noScript.trim())
    : withMetadata.replace("</body>", `${noScript}</body>`);
  return withNoScript.replace("</body>", `${crawlerSection}</body>`);
}

export async function decoratePublicHtml(pathname, html) {
  if (!isConfigured() || !html || !/^\/?[^?]*$/i.test(pathname)) return html;
  const key = pathname.toLowerCase();
  let content = cacheGet(key);
  if (content === null) {
    try {
      content = await contentForPath(pathname);
      cacheSet(key, content);
    } catch (error) {
      console.warn("[public-crawler] content generation failed:", error?.message || error);
      cacheSet(key, null);
    }
  }
  return content ? injectMeta(html, content) : html;
}
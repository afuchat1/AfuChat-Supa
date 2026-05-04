import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "../lib/constants";

const router = Router();
const supabase = createClient(
  SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "",
);

const BRAND = "#00BCD4";
const GOLD = "#D4A853";
const SITE_NAME = "AfuChat";
const SITE_URL = "https://afuchat.com";

function esc(str: string): string {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderPage(page: any, posts: any[]): string {
  const name = esc(page.name || "");
  const tagline = esc(page.tagline || "");
  const description = esc(page.description || "");
  const logo = page.logo_url || "";
  const cover = page.cover_url || "";
  const industry = esc(page.industry || "");
  const location = esc(page.location || "");
  const size = esc(page.size || "");
  const website = esc(page.website || "");
  const orgType = esc(page.org_type || "");
  const foundedYear = page.founded_year ? String(page.founded_year) : "";
  const followers = (page.followers_count || 0).toLocaleString();
  const pageUrl = `${SITE_URL}/company/${page.slug}`;

  const postsHtml = posts.map((p) => {
    const content = esc(p.content || "");
    const truncated = content.length > 400 ? content.slice(0, 397) + "…" : content;
    const date = new Date(p.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    return `
      <article class="post">
        <p>${truncated}</p>
        ${p.image_url ? `<img src="${esc(p.image_url)}" alt="Update image" loading="lazy" />` : ""}
        <time datetime="${p.created_at}">${date}</time>
      </article>`;
  }).join("");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: page.name,
    url: pageUrl,
    ...(logo ? { logo } : {}),
    ...(description ? { description: page.description } : {}),
    ...(website ? { sameAs: [page.website] } : {}),
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${name} — ${SITE_NAME}</title>
  <meta name="description" content="${tagline || description || `${name} on ${SITE_NAME}`}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${pageUrl}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${name}" />
  <meta property="og:description" content="${tagline || description || name}" />
  <meta property="og:url" content="${pageUrl}" />
  <meta property="og:site_name" content="${SITE_NAME}" />
  ${logo ? `<meta property="og:image" content="${esc(logo)}" />` : ""}
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${name}" />
  <meta name="twitter:description" content="${tagline || description || name}" />
  ${logo ? `<meta name="twitter:image" content="${esc(logo)}" />` : ""}
  <meta name="theme-color" content="${BRAND}" />
  <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/<\//g, "<\\/")}</script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Roboto,sans-serif;background:#000;color:#fff;min-height:100vh}
    .container{max-width:700px;margin:0 auto;padding:0 16px 48px}
    .cover{width:100%;height:200px;background:linear-gradient(135deg,${BRAND}22,${BRAND}08);position:relative;overflow:hidden}
    .cover img{width:100%;height:100%;object-fit:cover}
    .cover-fallback{width:100%;height:100%;display:flex;align-items:center;justify-content:center}
    .header-card{background:#111;border-radius:0 0 16px 16px;padding:16px;position:relative}
    .logo{width:80px;height:80px;border-radius:14px;border:3px solid #000;overflow:hidden;margin-top:-44px;background:${BRAND};display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:700;color:#fff}
    .logo img{width:100%;height:100%;object-fit:cover;border-radius:11px}
    .name-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px}
    .page-name{font-size:24px;font-weight:700}
    .verified{background:${GOLD}22;color:${GOLD};font-size:12px;font-weight:600;padding:3px 8px;border-radius:20px;display:inline-flex;align-items:center;gap:4px}
    .tagline{color:#aaa;font-size:15px;margin-top:6px}
    .meta-row{display:flex;gap:12px;flex-wrap:wrap;margin-top:10px}
    .meta-chip{display:flex;align-items:center;gap:4px;background:#1a1a1a;padding:4px 10px;border-radius:20px;font-size:12px;color:#888}
    .stats{display:flex;gap:24px;margin-top:14px}
    .stat-val{font-size:18px;font-weight:700;color:${BRAND}}
    .stat-lbl{font-size:12px;color:#666}
    .action-row{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}
    .btn-primary{display:inline-flex;align-items:center;gap:6px;padding:10px 22px;background:${BRAND};color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px}
    .btn-secondary{display:inline-flex;align-items:center;gap:6px;padding:10px 16px;background:#1a1a1a;color:#fff;text-decoration:none;border-radius:10px;font-size:14px;border:1px solid #333}
    .about{border-top:1px solid #222;margin-top:16px;padding-top:14px}
    .section-label{font-size:11px;font-weight:600;color:#666;letter-spacing:.5px;margin-bottom:8px}
    .about-text{font-size:14px;color:#ccc;line-height:1.6}
    .details{border-top:1px solid #222;margin-top:14px;padding-top:12px;display:flex;flex-direction:column;gap:8px}
    .detail-row{display:flex;align-items:center;gap:8px;font-size:14px;color:#aaa}
    .posts-section{margin-top:20px}
    .posts-title{font-size:18px;font-weight:600;margin-bottom:14px;color:#ccc}
    .post{background:#111;border-radius:14px;padding:16px;margin-bottom:12px}
    .post p{font-size:15px;line-height:1.6;color:#e0e0e0}
    .post img{max-width:100%;border-radius:10px;margin-top:10px}
    .post time{display:block;margin-top:10px;font-size:12px;color:#555}
    .empty-posts{text-align:center;padding:40px;color:#444}
    footer{text-align:center;padding:40px 16px;color:#444;font-size:13px;border-top:1px solid #111}
    footer a{color:${BRAND};text-decoration:none}
    @media(max-width:600px){.page-name{font-size:20px}.stats{gap:16px}}
  </style>
</head>
<body>
  <div class="cover">
    ${cover ? `<img src="${esc(cover)}" alt="${name} cover" />` : `<div class="cover-fallback"><svg width="48" height="48" fill="none" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="${BRAND}44" stroke-width="2"/></svg></div>`}
  </div>
  <div class="container">
    <div class="header-card">
      <div class="logo">${logo ? `<img src="${esc(logo)}" alt="${name}" />` : name.slice(0, 1)}</div>
      <div class="name-row">
        <h1 class="page-name">${name}</h1>
        ${page.is_verified ? `<span class="verified">&#10004; Verified</span>` : ""}
      </div>
      ${tagline ? `<p class="tagline">${tagline}</p>` : ""}
      <div class="meta-row">
        ${industry ? `<span class="meta-chip">${industry}</span>` : ""}
        ${location ? `<span class="meta-chip">📍 ${location}</span>` : ""}
        ${size ? `<span class="meta-chip">👥 ${size}</span>` : ""}
        ${orgType ? `<span class="meta-chip">${orgType}</span>` : ""}
      </div>
      <div class="stats">
        <div>
          <div class="stat-val">${followers}</div>
          <div class="stat-lbl">Followers</div>
        </div>
        <div>
          <div class="stat-val">${posts.length}</div>
          <div class="stat-lbl">Updates</div>
        </div>
        ${foundedYear ? `<div><div class="stat-val">${foundedYear}</div><div class="stat-lbl">Founded</div></div>` : ""}
      </div>
      <div class="action-row">
        <a href="${SITE_URL}?ref=company/${page.slug}" class="btn-primary">Follow on AfuChat</a>
        ${website ? `<a href="${esc(website)}" target="_blank" rel="noopener" class="btn-secondary">🌐 Website</a>` : ""}
      </div>
      ${description ? `
      <div class="about">
        <div class="section-label">ABOUT</div>
        <p class="about-text">${description}</p>
      </div>` : ""}
      ${foundedYear || page.email ? `
      <div class="details">
        ${page.email ? `<div class="detail-row">✉️ ${esc(page.email)}</div>` : ""}
        ${foundedYear ? `<div class="detail-row">🗓️ Founded ${foundedYear}</div>` : ""}
      </div>` : ""}
    </div>

    ${posts.length > 0 ? `
    <section class="posts-section">
      <h2 class="posts-title">Updates</h2>
      ${postsHtml}
    </section>` : `<div class="empty-posts"><p>No updates yet.</p></div>`}

    <footer>
      <p>&copy; ${new Date().getFullYear()} <a href="${SITE_URL}">${SITE_NAME}</a>. All rights reserved.</p>
    </footer>
  </div>
</body>
</html>`;
}

router.get("/company/:slug", async (req, res) => {
  const slug = req.params.slug?.toLowerCase().trim();
  if (!slug) return res.status(404).send("<h1>Not found</h1>");

  const { data: page } = await supabase
    .from("organization_pages")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!page) {
    return res.status(404).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Page Not Found</title><meta name="robots" content="noindex"><style>body{background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px}a{color:${BRAND}}</style></head><body><h1 style="color:${BRAND}">404</h1><p>This page doesn't exist on AfuChat.</p><a href="${SITE_URL}">Go to AfuChat</a></body></html>`);
  }

  const { data: posts } = await supabase
    .from("organization_page_posts")
    .select("id, content, image_url, created_at")
    .eq("page_id", page.id)
    .order("created_at", { ascending: false })
    .limit(20);

  res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  return res.send(renderPage(page, posts ?? []));
});

export default router;

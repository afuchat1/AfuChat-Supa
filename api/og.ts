export const config = { runtime: "edge" };

const SUPABASE_URL = "https://rhnsjqqtdzlkvqazfcbg.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJobnNqcXF0ZHpsa3ZxYXpmY2JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2NzA4NjksImV4cCI6MjA3NzI0Njg2OX0.j8zuszO1K6Apjn-jRiVUyZeqe3Re424xyOho9qDl_oY";

const SITE_URL = "https://afuchat.com";
const DEFAULT_OG_IMAGE = `${SITE_URL}/logo.png`;
const SITE_NAME = "AfuChat";

const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function decodeShortId(short: string): string {
  if (UUID_RE.test(short)) return short;
  try {
    const base = BigInt(B62.length);
    let num = 0n;
    for (const ch of short) {
      const i = B62.indexOf(ch);
      if (i < 0) return short;
      num = num * base + BigInt(i);
    }
    const hex = num.toString(16).padStart(32, "0");
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32),
    ].join("-");
  } catch {
    return short;
  }
}

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function trunc(str: string, n: number): string {
  if (!str) return "";
  return str.length <= n ? str : str.slice(0, n - 1).trimEnd() + "\u2026";
}

async function sbFetch(path: string): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return Array.isArray(json) ? json[0] ?? null : json;
}

function buildOgTags(opts: {
  title: string;
  description: string;
  image: string;
  url: string;
  type?: string;
}): string {
  const { title, description, image, url, type = "article" } = opts;
  const t = esc(title);
  const d = esc(description);
  const i = esc(image);
  const u = esc(url);
  return [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:image" content="${i}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:url" content="${u}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:site" content="@afuchat" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${i}" />`,
  ].join("\n    ");
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "post";
  const rawId = url.searchParams.get("id") || "";
  const postId = decodeShortId(rawId);

  let ogTags = "";

  try {
    if (type === "video") {
      const post = await sbFetch(
        `posts?id=eq.${postId}&post_type=eq.video&select=id,content,image_url,created_at,profiles!posts_author_id_fkey(display_name,handle)&limit=1`
      );
      if (post) {
        const author =
          (post.profiles as any)?.display_name || "AfuChat Creator";
        const snippet = trunc(post.content || "", 160) || "Watch this video on AfuChat.";
        const title = `${author} · Video on ${SITE_NAME}`;
        const description = snippet;
        const image = post.image_url || DEFAULT_OG_IMAGE;
        const pageUrl = `${SITE_URL}/video/${rawId}`;
        ogTags = buildOgTags({ title, description, image, url: pageUrl, type: "video.other" });
      }
    } else {
      const post = await sbFetch(
        `posts?id=eq.${postId}&select=id,content,image_url,article_title,post_type,created_at,profiles!posts_author_id_fkey(display_name,handle),post_images(image_url,display_order)&limit=1`
      );
      if (post) {
        const author =
          (post.profiles as any)?.display_name || "Someone";
        const images: string[] = (
          ((post.post_images as any[]) || [])
            .sort((a: any, b: any) => a.display_order - b.display_order)
            .map((i: any) => i.image_url)
        );
        const heroImage = images[0] || post.image_url || DEFAULT_OG_IMAGE;
        const rawContent = post.article_title || post.content || "";
        const snippet = trunc(rawContent, 200) || "View this post on AfuChat.";
        const title = `${author} on ${SITE_NAME}: "${trunc(rawContent, 80)}"`;
        const pageUrl = `${SITE_URL}/p/${rawId}`;
        ogTags = buildOgTags({ title, description: snippet, image: heroImage, url: pageUrl });
      }
    }
  } catch {
  }

  if (!ogTags) {
    ogTags = buildOgTags({
      title: `${SITE_NAME} — Connect, Chat, Discover`,
      description: "Your all-in-one social platform.",
      image: DEFAULT_OG_IMAGE,
      url: SITE_URL,
      type: "website",
    });
  }

  let indexHtml = "";
  try {
    const origin = `https://${url.host}`;
    const r = await fetch(`${origin}/index.html`, { headers: { "x-vercel-skip-toolbar": "1" } });
    if (r.ok) indexHtml = await r.text();
  } catch {}

  if (indexHtml) {
    const ogBlock = `\n    <!-- Dynamic OG tags -->\n    ${ogTags}\n    <!-- /Dynamic OG tags -->`;
    indexHtml = indexHtml.replace(/<title>[^<]*<\/title>/, "");
    indexHtml = indexHtml.replace(/<meta\s+property="og:[^"]*"[^>]*>/g, "");
    indexHtml = indexHtml.replace(/<meta\s+name="twitter:[^"]*"[^>]*>/g, "");
    indexHtml = indexHtml.replace(/<meta\s+name="description"[^>]*>/g, "");
    indexHtml = indexHtml.replace("</head>", `${ogBlock}\n  </head>`);
    return new Response(indexHtml, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  }

  const fallback = `<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${ogTags}
  <meta http-equiv="refresh" content="0; url=${SITE_URL}" />
</head><body>
  <p>Loading AfuChat…</p>
  <script>window.location.href="${SITE_URL}";</script>
</body></html>`;

  return new Response(fallback, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

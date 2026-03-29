import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

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

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://rhnsjqqtdzlkvqazfcbg.supabase.co";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJobnNqcXF0ZHpsa3ZxYXpmY2JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2NzA4NjksImV4cCI6MjA3NzI0Njg2OX0.j8zuszO1K6Apjn-jRiVUyZeqe3Re424xyOho9qDl_oY";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const SITE_URL = "https://afuchat.com";

router.get("/.well-known/assetlinks.json", (_req, res) => {
  res.type("application/json").send(JSON.stringify([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.afuchat.app",
        sha256_cert_fingerprints: [
          process.env.ANDROID_SHA256_FINGERPRINT || "TO_BE_CONFIGURED"
        ]
      }
    }
  ]));
});

router.get("/.well-known/apple-app-site-association", (_req, res) => {
  res.type("application/json").send(JSON.stringify({
    applinks: {
      apps: [],
      details: [
        {
          appID: `${process.env.APPLE_TEAM_ID || "TEAMID"}.com.afuchat.app`,
          paths: ["*"]
        }
      ]
    }
  }));
});

router.get("/robots.txt", (_req, res) => {
  res.type("text/plain").send(`User-agent: *
Allow: /
Allow: /@*
Allow: /p/*
Allow: /post/*
Disallow: /api/
Disallow: /admin/
Disallow: /__mockup/

Sitemap: ${SITE_URL}/sitemap.xml
`);
});

router.get("/sitemap.xml", async (_req, res) => {
  const profiles: any[] = [];
  const posts: any[] = [];
  if (supabase) {
    const [profileResult, postResult] = await Promise.all([
      supabase.from("profiles").select("handle, updated_at").eq("is_private", false).not("handle", "like", "deleted_%").order("updated_at", { ascending: false }).limit(1000),
      supabase.from("posts").select("id, created_at, author:profiles!author_id(is_private)").eq("is_blocked", false).order("created_at", { ascending: false }).limit(2000),
    ]);
    profiles.push(...(profileResult.data || []));
    posts.push(...(postResult.data || []));
  }

  const profileUrls = profiles.map((p) => `
  <url>
    <loc>${SITE_URL}/@${p.handle}</loc>
    <lastmod>${new Date(p.updated_at || Date.now()).toISOString().split("T")[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`).join("");

  const publicPosts = posts.filter((p) => !p.author?.is_private);
  const postUrls = publicPosts.map((p) => `
  <url>
    <loc>${SITE_URL}/p/${encodeUuidToShort(p.id)}</loc>
    <lastmod>${new Date(p.created_at || Date.now()).toISOString().split("T")[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>`).join("");

  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${SITE_URL}/terms</loc>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>${SITE_URL}/privacy</loc>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>${profileUrls}${postUrls}
</urlset>`);
});

export default router;

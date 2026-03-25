import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

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
Disallow: /api/
Disallow: /admin/
Disallow: /__mockup/

Sitemap: ${SITE_URL}/sitemap.xml
`);
});

router.get("/sitemap.xml", async (_req, res) => {
  const { data: profiles } = await supabase
    .from("profiles")
    .select("handle, updated_at")
    .eq("is_private", false)
    .not("handle", "like", "deleted_%")
    .order("updated_at", { ascending: false })
    .limit(1000);

  const urls = (profiles || []).map((p) => `
  <url>
    <loc>${SITE_URL}/@${p.handle}</loc>
    <lastmod>${new Date(p.updated_at || Date.now()).toISOString().split("T")[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
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
  </url>${urls}
</urlset>`);
});

export default router;

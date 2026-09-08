import type { MetadataRoute } from "next";
import { getPublicPosts, getPublicProfiles } from "../lib/public-data";
import { PUBLIC_SITE_URL } from "../lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = PUBLIC_SITE_URL;
  const staticRoutes = ["", "/discover", "/about", "/privacy", "/terms", "/child-safety"].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: "weekly" as const,
    priority: path === "" ? 1 : 0.7
  }));

  const [posts, profiles] = await Promise.all([
    getPublicPosts(1000).catch(() => []),
    getPublicProfiles(1000).catch(() => [])
  ]);
  const contentRoutes = posts.flatMap((post) => {
    const routes = [{ url: `${base}/post/${post.id}`, lastModified: new Date(post.created_at) }];
    if (post.post_type === "video") routes.push({ url: `${base}/video/${post.id}`, lastModified: new Date(post.created_at) });
    if (post.article_title) routes.push({ url: `${base}/article/${post.id}`, lastModified: new Date(post.created_at) });
    if (post.profiles?.handle) routes.push({ url: `${base}/${post.profiles.handle}`, lastModified: new Date(post.created_at) });
    return routes;
  });

  const profileRoutes = profiles.map((profile) => ({
    url: `${base}/${profile.handle}`,
    changeFrequency: "daily" as const,
    priority: 0.6
  }));

  return [...staticRoutes, ...profileRoutes, ...contentRoutes];
}
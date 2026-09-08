import type { MetadataRoute } from "next";
import { getPublicPosts } from "../lib/public-data";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://afuchat.com";
  const staticRoutes = ["", "/discover", "/about", "/privacy", "/terms", "/child-safety"].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: "weekly" as const,
    priority: path === "" ? 1 : 0.7
  }));

  const posts = await getPublicPosts(100).catch(() => []);
  const contentRoutes = posts.flatMap((post) => {
    const routes = [{ url: `${base}/post/${post.id}`, lastModified: new Date(post.created_at) }];
    if (post.post_type === "video") routes.push({ url: `${base}/video/${post.id}`, lastModified: new Date(post.created_at) });
    if (post.article_title) routes.push({ url: `${base}/article/${post.id}`, lastModified: new Date(post.created_at) });
    if (post.profiles?.handle) routes.push({ url: `${base}/${post.profiles.handle}`, lastModified: new Date(post.created_at) });
    return routes;
  });

  return [...staticRoutes, ...contentRoutes];
}
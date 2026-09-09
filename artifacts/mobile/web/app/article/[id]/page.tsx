import type { Metadata } from "next";
import { PublicPostDetail, PublicUnavailable } from "../../../components/public-post-detail";
import { getPublicPost } from "../../../lib/public-data";
import { PUBLIC_SITE_URL } from "../../../lib/site";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = (await params).id;
  const post = await getPublicPost(id).catch(() => null);
  const title = post?.article_title ? `${post.article_title} | AfuChat` : "Public article | AfuChat";
  const description = (post?.content || "Read a public AfuChat article.").slice(0, 160);
  return {
    title,
    description,
    alternates: { canonical: `/article/${id}` },
    openGraph: { title, description, type: "article", url: `${PUBLIC_SITE_URL}/article/${id}`, images: post?.image_url ? [post.image_url] : undefined },
    twitter: { card: "summary_large_image", title, description, images: post?.image_url ? [post.image_url] : undefined }
  };
}

export default async function ArticlePage({ params }: Props) {
  const post = await getPublicPost((await params).id).catch(() => null);
  return post ? <PublicPostDetail post={post} kind="article" /> : <PublicUnavailable title="Article not found" description="This article is unavailable or is not public." />;
}
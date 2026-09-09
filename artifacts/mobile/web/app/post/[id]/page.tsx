import type { Metadata } from "next";
import { PublicPostDetail, PublicUnavailable } from "../../../components/public-post-detail";
import { getPublicPost } from "../../../lib/public-data";
import { PUBLIC_SITE_URL } from "../../../lib/site";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = (await params).id;
  const post = await getPublicPost(id).catch(() => null);
  const title = post?.article_title ? `${post.article_title} | AfuChat` : "Public post | AfuChat";
  const description = (post?.content || "Read a public AfuChat post.").slice(0, 160);
  return {
    title,
    description,
    alternates: { canonical: `/post/${id}` },
    openGraph: { title, description, type: "article", url: `${PUBLIC_SITE_URL}/post/${id}`, images: post?.image_url ? [post.image_url] : undefined },
    twitter: { card: "summary_large_image", title, description, images: post?.image_url ? [post.image_url] : undefined }
  };
}

export default async function PostPage({ params }: Props) {
  const post = await getPublicPost((await params).id).catch(() => null);
  return post ? <PublicPostDetail post={post} /> : <PublicUnavailable title="Post not found" description="This post is unavailable or is not public." />;
}
import type { Metadata } from "next";
import { PublicPostDetail, PublicUnavailable } from "../../../components/public-post-detail";
import { getPublicPost } from "../../../lib/public-data";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPublicPost((await params).id).catch(() => null);
  return { title: post?.article_title ? `${post.article_title} | AfuChat` : "Public post | AfuChat", description: post?.content || "Read a public AfuChat post." };
}

export default async function PostPage({ params }: Props) {
  const post = await getPublicPost((await params).id).catch(() => null);
  return post ? <PublicPostDetail post={post} /> : <PublicUnavailable title="Post not found" description="This post is unavailable or is not public." />;
}
import type { Metadata } from "next";
import { PublicPostDetail, PublicUnavailable } from "../../../components/public-post-detail";
import { getPublicPost } from "../../../lib/public-data";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPublicPost((await params).id).catch(() => null);
  return { title: post?.article_title ? `${post.article_title} | AfuChat` : "Public article | AfuChat", description: post?.content || "Read a public AfuChat article." };
}

export default async function ArticlePage({ params }: Props) {
  const post = await getPublicPost((await params).id).catch(() => null);
  return post ? <PublicPostDetail post={post} kind="article" /> : <PublicUnavailable title="Article not found" description="This article is unavailable or is not public." />;
}
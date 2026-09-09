import type { Metadata } from "next";
import { PublicPostDetail, PublicUnavailable } from "../../../components/public-post-detail";
import { getPublicPost } from "../../../lib/public-data";
import { PUBLIC_SITE_URL } from "../../../lib/site";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = (await params).id;
  const post = await getPublicPost(id).catch(() => null);
  const title = "Public video | AfuChat";
  const description = (post?.content || "Watch a public AfuChat video.").slice(0, 160);
  return {
    title,
    description,
    alternates: { canonical: `/video/${id}` },
    openGraph: { title, description, type: "video.other", url: `${PUBLIC_SITE_URL}/video/${id}`, images: post?.image_url ? [post.image_url] : undefined },
    twitter: { card: "summary_large_image", title, description, images: post?.image_url ? [post.image_url] : undefined }
  };
}

export default async function VideoPage({ params }: Props) {
  const post = await getPublicPost((await params).id).catch(() => null);
  return post ? <PublicPostDetail post={post} kind="video" /> : <PublicUnavailable title="Video not found" description="This video is unavailable or is not public." />;
}
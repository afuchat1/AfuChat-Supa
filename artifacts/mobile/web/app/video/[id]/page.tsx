import type { Metadata } from "next";
import { PublicPostDetail, PublicUnavailable } from "../../../components/public-post-detail";
import { getPublicPost } from "../../../lib/public-data";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPublicPost((await params).id).catch(() => null);
  return { title: "Public video | AfuChat", description: post?.content || "Watch a public AfuChat video." };
}

export default async function VideoPage({ params }: Props) {
  const post = await getPublicPost((await params).id).catch(() => null);
  return post ? <PublicPostDetail post={post} kind="video" /> : <PublicUnavailable title="Video not found" description="This video is unavailable or is not public." />;
}
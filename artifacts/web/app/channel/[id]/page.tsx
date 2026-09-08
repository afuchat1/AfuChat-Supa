import type { Metadata } from "next";
import { PublicCommunityPage } from "../../../components/public-community";
import { PublicUnavailable } from "../../../components/public-post-detail";
import { getPublicChannel } from "../../../lib/public-data";

type Props = { params: Promise<{ id: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const item = await getPublicChannel((await params).id).catch(() => null);
  return { title: item?.name ? `${item.name} | AfuChat` : "Public channel | AfuChat", description: item?.description || "View a public AfuChat channel." };
}
export default async function ChannelPage({ params }: Props) {
  const item = await getPublicChannel((await params).id).catch(() => null);
  return item ? <PublicCommunityPage community={item} kind="channel" /> : <PublicUnavailable title="Channel not found" description="This channel is unavailable or is not public." />;
}
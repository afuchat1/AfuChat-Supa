import type { Metadata } from "next";
import { PublicCommunityPage } from "../../../components/public-community";
import { PublicUnavailable } from "../../../components/public-post-detail";
import { getPublicGroup } from "../../../lib/public-data";

type Props = { params: Promise<{ id: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const item = await getPublicGroup((await params).id).catch(() => null);
  return { title: item?.name ? `${item.name} | AfuChat` : "Public group | AfuChat", description: `View the public ${item?.name || "AfuChat"} group.` };
}
export default async function GroupPage({ params }: Props) {
  const item = await getPublicGroup((await params).id).catch(() => null);
  return item ? <PublicCommunityPage community={item} kind="group" /> : <PublicUnavailable title="Group not found" description="This group is unavailable or cannot be viewed publicly." />;
}
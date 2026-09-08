import { notFound, redirect } from "next/navigation";
import { getPublicProfileByAfuId } from "../../../lib/public-data";

export default async function AfuIdRedirect({ params }: { params: Promise<{ afuId: string }> }) {
  const profile = await getPublicProfileByAfuId((await params).afuId).catch(() => null);
  if (!profile) notFound();
  redirect(`/${profile.handle}`);
}
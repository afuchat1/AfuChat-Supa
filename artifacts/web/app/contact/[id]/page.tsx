import { notFound, redirect } from "next/navigation";
import { getPublicProfileById } from "../../../lib/public-data";

export default async function ContactProfileRedirect({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getPublicProfileById((await params).id).catch(() => null);
  if (!profile) notFound();
  redirect(`/${profile.handle}`);
}
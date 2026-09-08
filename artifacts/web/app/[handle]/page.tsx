import type { Metadata } from "next";
import Link from "next/link";
import { getProfilePosts, getPublicProfile, type PublicPost, type PublicProfile } from "../../lib/public-data";

type ProfilePageProps = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getPublicProfile(handle).catch(() => null);
  if (!profile) return { title: "Profile not found | AfuChat", description: "This AfuChat profile could not be found." };
  const name = profile.display_name || `@${profile.handle}`;
  return {
    title: `${name} (@${profile.handle}) | AfuChat`,
    description: profile.bio || `${name}'s public AfuChat profile.`,
    openGraph: {
      title: `${name} (@${profile.handle}) | AfuChat`,
      description: profile.bio || `${name}'s public AfuChat profile.`,
      images: profile.avatar_url ? [profile.avatar_url] : undefined,
      type: "profile"
    }
  };
}

export default async function PublicProfilePage({ params }: ProfilePageProps) {
  const { handle } = await params;
  const profile = await getPublicProfile(handle).catch(() => null);
  if (!profile) {
    return <main className="profile-page"><PublicProfileHeader /><div className="profile-empty"><h1>Profile not found</h1><p>That AfuChat username does not resolve to a public profile.</p><Link className="primary-link" href="/discover">Explore Discover</Link></div></main>;
  }

  const posts = await getProfilePosts(profile.id).catch(() => [] as PublicPost[]);
  return <main className="profile-page"><PublicProfileHeader /><ProfileHero profile={profile} postCount={posts.length} /><section className="profile-posts"><div className="profile-section-heading"><h2>Public posts</h2><Link href="/discover">Back to Discover</Link></div>{posts.length ? <div className="profile-grid">{posts.map((post) => <ProfilePost key={post.id} post={post} />)}</div> : <div className="empty-state"><h2>No public posts</h2><p>This profile has not shared anything publicly yet.</p></div>}</section></main>;
}

function PublicProfileHeader() {
  return <header className="public-header"><Link href="/" className="public-logo"><img src="/images/white-logo-bold.png" alt="" width={30} height={30} />AfuChat</Link><nav><Link href="/discover">Discover</Link><Link href="/login">Sign in</Link></nav></header>;
}

function ProfileHero({ profile, postCount }: { profile: PublicProfile; postCount: number }) {
  return <section className="profile-hero"><div className="profile-avatar-wrap">{profile.avatar_url ? <img src={profile.avatar_url} className="profile-avatar" alt={`${profile.display_name || profile.handle}'s avatar`} width={104} height={104} /> : <div className="profile-avatar profile-avatar-fallback">{(profile.display_name || profile.handle).slice(0, 1).toUpperCase()}</div>}</div><div className="profile-copy"><p className="eyebrow">Public profile</p><h1>{profile.display_name || profile.handle}{profile.is_verified || profile.is_organization_verified ? <span className="verified large">✓</span> : null}</h1><p className="profile-handle">@{profile.handle}{profile.country ? ` · ${profile.country}` : ""}</p>{profile.bio ? <p className="profile-bio">{profile.bio}</p> : null}<div className="profile-meta"><span>{postCount} public posts</span><Link className="primary-link" href="/login">Join AfuChat</Link></div></div></section>;
}

function ProfilePost({ post }: { post: PublicPost }) {
  return <article className="profile-post"><div className="post-stats"><span>{new Date(post.created_at).toLocaleDateString()}</span><span>{post.like_count || 0} likes</span></div>{post.content ? <p>{post.content}</p> : null}{post.article_title ? <h3>{post.article_title}</h3> : null}{post.image_url ? <img src={post.image_url} alt={post.article_title || "Public profile post"} width={640} height={420} loading="lazy" /> : null}</article>;
}
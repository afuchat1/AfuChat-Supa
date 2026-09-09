import type { Metadata } from "next";
import Link from "next/link";
import { getPublicPosts, type PublicPost } from "../../lib/public-data";
import { PublicMentionText } from "../../components/public-text";

export const metadata: Metadata = {
  title: "Discover public posts | AfuChat",
  description: "Explore public conversations, ideas, videos, and communities on AfuChat.",
  alternates: { canonical: "/discover" },
  openGraph: {
    title: "Discover public posts | AfuChat",
    description: "Explore public conversations, ideas, videos, and communities on AfuChat",
    type: "website",
    url: "/discover"
  }
};

function relativeTime(value: string) {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function initials(profile: PublicPost["profiles"]) {
  return (profile?.display_name || profile?.handle || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default async function DiscoverPage() {
  let posts: PublicPost[] = [];
  let unavailable = false;
  try {
    posts = await getPublicPosts();
  } catch {
    unavailable = true;
  }

  return (
    <main className="public-app">
      <PublicHeader active="discover" />
      <div className="public-layout">
        <aside className="public-sidebar">
          <p className="eyebrow">AfuChat</p>
          <h1>Discover</h1>
          <p>See what people are sharing publicly across AfuChat.</p>
          <nav className="public-nav" aria-label="Public navigation">
            <Link className="active" href="/discover">Discover</Link>
            <Link href="/">Welcome</Link>
            <Link href="/login">Sign in</Link>
          </nav>
        </aside>
        <section className="feed" aria-label="Public discover feed">
          <div className="feed-heading">
            <div><p className="eyebrow">For everyone</p><h2>Public feed</h2></div>
            <span className="live-dot">Live content</span>
          </div>
          {unavailable ? (
            <div className="empty-state"><h2>Discover is temporarily unavailable</h2><p>We couldn’t load the public feed right now. Try refreshing in a moment.</p></div>
          ) : posts.length === 0 ? (
            <div className="empty-state"><h2>No public posts yet</h2><p>Public conversations will appear here as people share.</p></div>
          ) : (
            <div className="post-list">
              {posts.map((post) => <PublicPostCard key={post.id} post={post} />)}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function PublicPostCard({ post }: { post: PublicPost }) {
  const profile = post.profiles;
  return (
    <article className="post-card">
      <div className="post-author">
        {profile?.avatar_url ? <img className="avatar" src={profile.avatar_url} alt="" width={42} height={42} /> : <div className="avatar avatar-fallback">{initials(profile)}</div>}
        <div className="author-copy">
          <Link href={`/${profile?.handle || ""}`}>{profile?.display_name || "AfuChat user"}{profile?.is_verified || profile?.is_organization_verified ? <span className="verified">✓</span> : null}</Link>
          <span>@{profile?.handle || "user"} · {relativeTime(post.created_at)}</span>
        </div>
      </div>
      {post.content ? <p className="post-content"><PublicMentionText>{post.content}</PublicMentionText></p> : null}
      {post.article_title ? <h3 className="post-title">{post.article_title}</h3> : null}
      {post.image_url ? <img className="post-media" src={post.image_url} alt={post.article_title || "Public AfuChat post"} width={720} height={480} loading="lazy" /> : null}
      <div className="post-stats"><span>♡ {post.like_count || 0}</span><span>◉ {post.view_count || 0} views</span><span>{post.post_type || "post"}</span></div>
    </article>
  );
}

function PublicHeader({ active }: { active: "discover" }) {
  return <header className="public-header"><Link href="/" className="public-logo"><img src="/images/white-logo-bold.png" alt="" width={30} height={30} />AfuChat</Link><nav><Link className={active === "discover" ? "active" : ""} href="/discover">Discover</Link><Link href="/login">Sign in</Link></nav></header>;
}
import Link from "next/link";
import type { PublicPost } from "../lib/public-data";

export function PublicPostDetail({ post, kind = "post" }: { post: PublicPost; kind?: string }) {
  const profile = post.profiles;
  return (
    <main className="detail-page">
      <header className="public-header"><Link href="/" className="public-logo"><img src="/images/white-logo-bold.png" alt="" width={30} height={30} />AfuChat</Link><nav><Link href="/discover">Discover</Link><Link href="/login">Sign in</Link></nav></header>
      <article className="detail-card">
        <Link className="detail-back" href="/discover">← Back to Discover</Link>
        <p className="eyebrow">Public {kind}</p>
        <div className="post-author">
          {profile?.avatar_url ? <img className="avatar" src={profile.avatar_url} alt="" width={42} height={42} /> : <div className="avatar avatar-fallback">{(profile?.display_name || profile?.handle || "?").slice(0, 1).toUpperCase()}</div>}
          <div className="author-copy"><Link href={`/${profile?.handle || ""}`}>{profile?.display_name || "AfuChat user"}</Link><span>@{profile?.handle || "user"}</span></div>
        </div>
        {post.article_title ? <h1>{post.article_title}</h1> : <h1>{kind === "video" ? "A public AfuChat video" : "A public AfuChat post"}</h1>}
        {post.content ? <p className="detail-content">{post.content}</p> : null}
        {post.image_url ? <img className="detail-media" src={post.image_url} alt={post.article_title || `Public AfuChat ${kind}`} width={900} height={600} /> : null}
        <div className="post-stats"><span>{post.like_count || 0} likes</span><span>{post.view_count || 0} views</span><span>{new Date(post.created_at).toLocaleDateString()}</span></div>
      </article>
    </main>
  );
}

export function PublicUnavailable({ title, description }: { title: string; description: string }) {
  return <main className="profile-page"><header className="public-header"><Link href="/" className="public-logo"><img src="/images/white-logo-bold.png" alt="" width={30} height={30} />AfuChat</Link><nav><Link href="/discover">Discover</Link><Link href="/login">Sign in</Link></nav></header><div className="profile-empty"><h1>{title}</h1><p>{description}</p><Link className="primary-link" href="/discover">Explore Discover</Link></div></main>;
}
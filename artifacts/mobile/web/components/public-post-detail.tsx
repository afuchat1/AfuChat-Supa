import Link from "next/link";
import type { PublicPost } from "../lib/public-data";
import { safeJsonLd } from "../lib/seo";
import { PUBLIC_SITE_URL } from "../lib/site";
import { PublicMentionText } from "./public-text";

export function PublicPostDetail({ post, kind = "post" }: { post: PublicPost; kind?: string }) {
  const profile = post.profiles;
  const authorName = profile?.display_name || "AfuChat user";
  const title = post.article_title || (kind === "video" ? "A public AfuChat video" : "A public AfuChat post");
  const routeKind = kind === "article" ? "article" : kind === "video" ? "video" : "post";
  const structuredData = {
    "@context": "https://schema.org",
    "@type": kind === "article" ? "Article" : "SocialMediaPosting",
    headline: title,
    articleBody: post.content || undefined,
    image: post.image_url ? [post.image_url] : undefined,
    datePublished: post.created_at,
    author: {
      "@type": "Person",
      name: authorName,
      url: profile?.handle ? `${PUBLIC_SITE_URL}/${profile.handle}` : undefined
    },
    url: `${PUBLIC_SITE_URL}/${routeKind}/${post.id}`,
    interactionStatistic: [
      { "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: post.like_count || 0 },
      { "@type": "InteractionCounter", interactionType: "https://schema.org/ViewAction", userInteractionCount: post.view_count || 0 }
    ]
  };
  return (
    <main className="detail-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(structuredData) }} />
      <header className="public-header"><Link href="/" className="public-logo"><img src="/images/white-logo-bold.png" alt="" width={30} height={30} />AfuChat</Link><nav><Link href="/discover">Discover</Link><Link href="/login">Sign in</Link></nav></header>
      <article className="detail-card">
        <Link className="detail-back" href="/discover">← Back to Discover</Link>
        <p className="eyebrow">Public {kind}</p>
        <div className="post-author">
          {profile?.avatar_url ? <img className="avatar" src={profile.avatar_url} alt="" width={42} height={42} /> : <div className="avatar avatar-fallback">{(profile?.display_name || profile?.handle || "?").slice(0, 1).toUpperCase()}</div>}
          <div className="author-copy"><Link href={`/${profile?.handle || ""}`}>{authorName}</Link><span>@{profile?.handle || "user"}</span></div>
        </div>
        <h1>{title}</h1>
        {post.content ? <p className="detail-content"><PublicMentionText>{post.content}</PublicMentionText></p> : null}
        {post.image_url ? <img className="detail-media" src={post.image_url} alt={post.article_title || `Public AfuChat ${kind}`} width={900} height={600} /> : null}
        <div className="post-stats"><span>{post.like_count || 0} likes</span><span>{post.view_count || 0} views</span><span>{new Date(post.created_at).toLocaleDateString()}</span></div>
      </article>
    </main>
  );
}

export function PublicUnavailable({ title, description }: { title: string; description: string }) {
  return <main className="profile-page"><header className="public-header"><Link href="/" className="public-logo"><img src="/images/white-logo-bold.png" alt="" width={30} height={30} />AfuChat</Link><nav><Link href="/discover">Discover</Link><Link href="/login">Sign in</Link></nav></header><div className="profile-empty"><h1>{title}</h1><p>{description}</p><Link className="primary-link" href="/discover">Explore Discover</Link></div></main>;
}
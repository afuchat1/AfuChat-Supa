import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Discover people, ideas, and communities",
  description: "Explore the AfuChat community and find conversations, creators, and moments worth staying for.",
  alternates: { canonical: "/discover" }
};

const posts = [
  { name: "Maria N.", handle: "@maria.creates", location: "Kampala", text: "Some places feel like home because of the people in them. ✨", image: "/illustrations/community.webp", likes: "184", comments: "26", tone: "peach" },
  { name: "Ayo Studios", handle: "@ayostudios", location: "Lagos", text: "Making space for the next big idea. What are you building this week?", image: "/illustrations/ai.webp", likes: "92", comments: "14", tone: "blue" },
  { name: "Nia K.", handle: "@niak", location: "Nairobi", text: "A good conversation can change the whole direction of a day.", image: "/illustrations/messaging.webp", likes: "241", comments: "38", tone: "violet" }
];

export default function DiscoverPage() {
  return (
    <main className="app-page">
      <header className="app-header shell">
        <Link className="brand" href="/"><Image src="/images/white-logo-bold.png" alt="AfuChat" width={108} height={32} /></Link>
        <nav className="app-nav" aria-label="App navigation"><Link className="selected" href="/discover">Discover</Link><Link href="/chat">Messages</Link><Link href="/">About</Link></nav>
        <Link className="button button-small" href="/chat">Join AfuChat <span aria-hidden="true">↗</span></Link>
      </header>
      <div className="app-shell shell">
        <aside className="side-rail">
          <div className="rail-user"><span className="rail-avatar">M</span><div><strong>Welcome to AfuChat</strong><small>Your social home</small></div></div>
          <nav aria-label="Discover sections"><Link className="rail-link active" href="/discover"><span>⌂</span> For you</Link><Link className="rail-link" href="/discover#following"><span>♡</span> Following</Link><Link className="rail-link" href="/chat"><span>◌</span> Messages</Link><Link className="rail-link" href="/discover#communities"><span>♧</span> Communities</Link></nav>
          <div className="rail-note"><span>✦</span><p><strong>Meet AfuAI</strong><br />Your creative sidekick is waiting.</p></div>
        </aside>
        <section className="discover-main" aria-labelledby="discover-title">
          <div className="discover-heading"><div><p className="eyebrow">AfuChat community</p><h1 id="discover-title">Find your people.</h1></div><button className="filter-button" type="button">Latest <span>⌄</span></button></div>
          <div className="discover-tabs"><span className="active">For you</span><span id="following">Following</span><span id="communities">Communities</span></div>
          <div className="post-list">
            {posts.map((post) => <article className="feed-post" key={post.name}><div className="post-author"><span className={`feed-avatar ${post.tone}`}>{post.name[0]}</span><span><strong>{post.name}</strong><small>{post.handle} · {post.location}</small></span><button type="button" aria-label={`More options for ${post.name}`}>•••</button></div><p className="feed-copy">{post.text}</p><div className={`feed-media ${post.tone}`}><Image src={post.image} alt="" fill sizes="(max-width: 800px) 90vw, 540px" /></div><div className="feed-actions"><button type="button">♡ <span>{post.likes}</span></button><button type="button">◌ <span>{post.comments}</span></button><button type="button">↗ <span>Share</span></button></div></article>)}
          </div>
        </section>
        <aside className="discover-aside"><div className="aside-card"><p className="eyebrow">Trending spaces</p><h2>Rooms for your next thought.</h2><Link className="underlined-link" href="/chat">Explore conversations <span>↗</span></Link></div><div className="aside-card small-card"><span className="aside-icon">✦</span><div><strong>Be part of something warm.</strong><p>AfuChat is built for conversations with room to breathe.</p></div></div></aside>
      </div>
    </main>
  );
}
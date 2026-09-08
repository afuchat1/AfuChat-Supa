import Image from "next/image";
import Link from "next/link";

const features = [
  {
    number: "01",
    title: "Conversations that feel close",
    copy: "Private chats, voice notes, groups, and calls designed for the people you actually want to hear from.",
    image: "/illustrations/messaging.webp",
    tint: "blue"
  },
  {
    number: "02",
    title: "A community with your rhythm",
    copy: "Discover people, creators, and communities that make room for your point of view.",
    image: "/illustrations/community.webp",
    tint: "violet"
  },
  {
    number: "03",
    title: "Create with AfuAI",
    copy: "Turn a spark into a caption, a plan, or a better idea without leaving the conversation.",
    image: "/illustrations/ai.webp",
    tint: "orange"
  }
];

const stats = [
  ["01", "Message", "the people who matter"],
  ["02", "Discover", "your next corner of the internet"],
  ["03", "Create", "something worth sharing"]
];

function BrandMark() {
  return (
    <Link className="brand" href="/" aria-label="AfuChat home">
      <Image src="/images/white-logo-bold.png" alt="AfuChat" width={108} height={32} priority />
    </Link>
  );
}

function Arrow() {
  return <span aria-hidden="true" className="arrow">↗</span>;
}

export default function HomePage() {
  return (
    <main>
      <div className="page-glow page-glow-a" />
      <div className="page-glow page-glow-b" />

      <header className="site-header shell">
        <BrandMark />
        <nav className="desktop-nav" aria-label="Primary navigation">
          <Link href="#why-afuchat">Why AfuChat</Link>
          <Link href="/discover">Discover</Link>
          <Link href="/chat">Messages</Link>
        </nav>
        <div className="header-actions">
          <Link className="text-button hide-mobile" href="/chat">Sign in</Link>
          <Link className="button button-small" href="/chat">Open AfuChat <Arrow /></Link>
        </div>
      </header>

      <section className="hero shell" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-dot" /> A social home for everyone</p>
          <h1 id="hero-title">Your people.<br /><em>Your place.</em></h1>
          <p className="hero-lede">
            AfuChat brings the conversations, ideas, communities, and small everyday moments you care about into one bright, human space.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/chat">Start exploring <Arrow /></Link>
            <Link className="quiet-link" href="#why-afuchat">See what&apos;s inside <span>↓</span></Link>
          </div>
          <div className="hero-proof">
            <div className="avatar-stack" aria-hidden="true">
              <span className="avatar avatar-one">A</span>
              <span className="avatar avatar-two">K</span>
              <span className="avatar avatar-three">N</span>
              <span className="avatar avatar-four">+</span>
            </div>
            <p><strong>Made for real connection</strong><br />in every language, every day.</p>
          </div>
        </div>

        <div className="hero-visual" aria-label="AfuChat app preview">
          <div className="orb orb-blue" />
          <div className="orb orb-violet" />
          <div className="phone-frame">
            <div className="phone-notch" />
            <div className="phone-topbar">
              <span className="phone-time">9:41</span>
              <span className="phone-signal">● ● ●</span>
            </div>
            <div className="phone-brand">
              <Image src="/images/icon.png" alt="" width={32} height={32} />
              <div><strong>AfuChat</strong><span>Your social home</span></div>
              <span className="phone-more">•••</span>
            </div>
            <div className="phone-tabs"><span className="active">For you</span><span>Following</span></div>
            <article className="phone-post">
              <div className="post-author"><span className="mini-avatar">M</span><span><strong>Maria N.</strong><small>2 min ago · Kampala</small></span><b>•••</b></div>
              <p>Some places feel like home because of the people in them. ✨</p>
              <div className="post-art"><Image src="/illustrations/community.webp" alt="Community illustration" fill sizes="260px" /></div>
              <div className="post-actions"><span>♡ 184</span><span>◌ 26</span><span>↗ Share</span></div>
            </article>
            <div className="phone-nav"><span className="selected">⌂<small>Home</small></span><span>⌕<small>Discover</small></span><span className="compose">+</span><span>♧<small>Chats</small></span><span>◎<small>Profile</small></span></div>
          </div>
          <div className="float-card float-message"><span className="float-icon">✦</span><span><strong>AfuAI</strong><small>Ready when you are</small></span></div>
          <div className="float-card float-people"><span className="pulse-dot" /><span><strong>12 friends</strong><small>are sharing moments</small></span></div>
        </div>
      </section>

      <section className="stats-strip shell" aria-label="AfuChat highlights">
        {stats.map(([number, title, copy]) => (
          <div className="stat-item" key={number}><span>{number}</span><p><strong>{title}</strong> {copy}</p></div>
        ))}
      </section>

      <section className="feature-section shell" id="why-afuchat" aria-labelledby="feature-title">
        <div className="section-heading">
          <p className="eyebrow">More than a feed</p>
          <h2 id="feature-title">Built around the way<br /><em>you actually connect.</em></h2>
          <p>Move between a private conversation, a brilliant idea, and the people who make your day better — without losing the thread.</p>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <article className={`feature-card ${feature.tint}`} key={feature.number}>
              <div className="feature-top"><span>{feature.number}</span><span className="feature-arrow">↗</span></div>
              <div className="feature-image"><Image src={feature.image} alt="" fill sizes="(max-width: 700px) 80vw, 30vw" /></div>
              <h3>{feature.title}</h3>
              <p>{feature.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="value-section shell" aria-labelledby="value-title">
        <div className="value-art">
          <div className="value-ring value-ring-one" />
          <div className="value-ring value-ring-two" />
          <Image src="/illustrations/wallet.webp" alt="AfuChat everyday value illustration" width={460} height={460} />
        </div>
        <div className="value-copy">
          <p className="eyebrow">Your everyday value</p>
          <h2 id="value-title">The good stuff<br /><em>travels with you.</em></h2>
          <p>From sending a thoughtful message to sharing a little support, AfuChat makes more room for what matters — and less room for friction.</p>
          <Link className="underlined-link" href="/discover">Explore the AfuChat experience <Arrow /></Link>
        </div>
      </section>

      <section className="cta-section shell" aria-labelledby="cta-title">
        <div className="cta-panel">
          <div><p className="eyebrow">This is your invitation</p><h2 id="cta-title">Come as you are.<br /><em>Stay for the people.</em></h2></div>
          <Link className="button button-light" href="/chat">Open AfuChat <Arrow /></Link>
        </div>
      </section>

      <footer className="site-footer shell">
        <BrandMark />
        <p>Connect, create, and belong.</p>
        <nav aria-label="Footer navigation"><Link href="/discover">Discover</Link><Link href="/chat">Messages</Link><Link href="/privacy">Privacy</Link></nav>
        <span>© 2026 AfuChat</span>
      </footer>
    </main>
  );
}
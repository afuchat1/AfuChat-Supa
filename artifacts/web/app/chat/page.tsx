import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Private messages and meaningful conversations",
  description: "Open AfuChat messages to chat privately, share voice notes, and stay close to the people who matter.",
  alternates: { canonical: "/chat" }
};

const conversations = [
  ["M", "Maria N.", "You: That sounds perfect ✨", "2m", "peach"],
  ["A", "Ayo Studios", "The new idea is taking shape.", "18m", "blue"],
  ["N", "Nia K.", "Sent a voice note", "1h", "violet"],
  ["J", "Jamal & friends", "Jamal: See you there!", "3h", "green"]
];

export default function ChatPage() {
  return (
    <main className="app-page">
      <header className="app-header shell">
        <Link className="brand" href="/"><Image src="/images/white-logo-bold.png" alt="AfuChat" width={108} height={32} /></Link>
        <nav className="app-nav" aria-label="App navigation"><Link href="/discover">Discover</Link><Link className="selected" href="/chat">Messages</Link><Link href="/">About</Link></nav>
        <Link className="button button-small" href="/discover">Explore AfuChat <span aria-hidden="true">↗</span></Link>
      </header>
      <div className="chat-shell shell">
        <aside className="conversation-list">
          <div className="conversation-heading"><div><p className="eyebrow">Your space</p><h1>Messages</h1></div><button type="button" aria-label="Start new message">+</button></div>
          <label className="search-box"><span>⌕</span><input aria-label="Search conversations" placeholder="Search conversations" /></label>
          <div className="conversation-tabs"><span className="active">All</span><span>Unread</span><span>Groups</span></div>
          <div>{conversations.map(([initial, name, message, time, tone]) => <Link className={`conversation ${name === "Maria N." ? "active" : ""}`} href="#conversation" key={name}><span className={`conversation-avatar ${tone}`}>{initial}</span><span className="conversation-copy"><strong>{name}</strong><small>{message}</small></span><time>{time}</time>{name === "Maria N." && <i />}</Link>)}</div>
        </aside>
        <section className="chat-room" id="conversation" aria-label="Conversation with Maria N.">
          <div className="room-header"><span className="conversation-avatar peach">M</span><div><strong>Maria N.</strong><small><span className="online-dot" /> Active now</small></div><div className="room-actions"><button type="button" aria-label="Start voice call">⌕</button><button type="button" aria-label="More options">•••</button></div></div>
          <div className="chat-messages"><div className="date-divider"><span>Today</span></div><p className="message received">Hey! I saw your post about making space for new ideas. <span>09:38</span></p><p className="message sent">Thank you! It started as a tiny note and turned into a whole direction. <span>09:39 ✓✓</span></p><p className="message received">That is the best kind of beginning. Are you free to talk through it later? <span>09:40</span></p><div className="typing"><span /><span /><span /> Maria is typing</div></div>
          <div className="composer"><button type="button" aria-label="Add attachment">+</button><input aria-label="Write a message" placeholder="Write a message…" /><button type="button" aria-label="Send message" className="send-button">↗</button></div>
          <p className="join-note">This is a preview of AfuChat for web. <Link href="/discover">Explore the community</Link> or join from your phone to continue.</p>
        </section>
      </div>
    </main>
  );
}
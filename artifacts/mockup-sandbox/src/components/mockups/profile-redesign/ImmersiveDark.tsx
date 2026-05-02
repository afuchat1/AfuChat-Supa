import { useState } from "react";

const AVATAR = "https://i.pravatar.cc/150?img=12";
const COVER = "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80";
const POSTS_IMG = [
  "https://images.unsplash.com/photo-1506748686214-e9df14d4d9d0?w=300&q=80",
  "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=300&q=80",
  "https://images.unsplash.com/photo-1682685797507-d44d838b0ac7?w=300&q=80",
  "https://images.unsplash.com/photo-1682685797661-9e0c87f59c60?w=300&q=80",
  "https://images.unsplash.com/photo-1704387744073-4f5843f60513?w=300&q=80",
  "https://images.unsplash.com/photo-1682687220063-4742bd7fd538?w=300&q=80",
];
const VIDEOS = [
  { thumb: "https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=300&q=80", views: "12.4K", duration: "0:45" },
  { thumb: "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=300&q=80", views: "8.1K", duration: "1:20" },
  { thumb: "https://images.unsplash.com/photo-1611162618071-b39a2ec055fb?w=300&q=80", views: "34K", duration: "2:05" },
  { thumb: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=300&q=80", views: "5.2K", duration: "0:58" },
  { thumb: "https://images.unsplash.com/photo-1618641986557-1ecd230959aa?w=300&q=80", views: "21K", duration: "1:33" },
  { thumb: "https://images.unsplash.com/photo-1619983081563-430f63602796?w=300&q=80", views: "9.7K", duration: "0:32" },
];

type Tab = "posts" | "photos" | "videos";

const BG = "#0A0A0F";
const CARD = "rgba(255,255,255,0.05)";
const BORDER = "rgba(255,255,255,0.09)";
const DIM = "rgba(255,255,255,0.45)";
const VIOLET = "#7C3AED";
const VIOLET_LIGHT = "#A78BFA";

export function ImmersiveDark() {
  const [tab, setTab] = useState<Tab>("posts");
  const [following, setFollowing] = useState(false);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: BG, color: "white", fontFamily: "system-ui, sans-serif", overflowX: "hidden" }}>

      {/* Cover hero */}
      <div style={{ position: "relative", height: 196, overflow: "hidden" }}>
        <img src={COVER} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, ${BG} 100%)` }} />
        <div style={{ position: "relative", display: "flex", justifyContent: "space-between", padding: "14px 16px" }}>
          <button style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" fill="none" stroke="white" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
          <button style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
          </button>
        </div>
      </div>

      {/* Profile info */}
      <div style={{ padding: "0 20px", marginTop: -52 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ position: "relative" }}>
            <div style={{ width: 86, height: 86, borderRadius: 18, border: `3px solid ${VIOLET}`, overflow: "hidden", boxShadow: "0 0 28px rgba(124,58,237,0.5)" }}>
              <img src={AVATAR} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div style={{ position: "absolute", bottom: -2, right: -2, width: 18, height: 18, background: "#22C55E", borderRadius: "50%", border: `2.5px solid ${BG}` }} />
          </div>
          <div style={{ display: "flex", gap: 8, paddingBottom: 4 }}>
            <button
              onClick={() => setFollowing(!following)}
              style={{ padding: "9px 20px", borderRadius: 12, border: following ? `1px solid ${BORDER}` : "none", background: following ? CARD : VIOLET, color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: following ? "none" : "0 4px 20px rgba(124,58,237,0.45)" }}
            >
              {following ? "✓ Following" : "+ Follow"}
            </button>
            <button style={{ width: 36, height: 36, borderRadius: 12, background: CARD, border: `1px solid ${BORDER}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="15" height="15" fill="none" stroke={VIOLET_LIGHT} strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: -0.3 }}>AM Kaweesi</h1>
          <span style={{ background: "rgba(124,58,237,0.2)", color: VIOLET_LIGHT, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, border: `1px solid rgba(124,58,237,0.3)` }}>✓ Verified</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ color: DIM, fontSize: 13 }}>@amkaweesi</span>
          <span style={{ background: "rgba(245,158,11,0.15)", color: "#FBBF24", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99 }}>★ Legend</span>
        </div>

        <p style={{ margin: "0 0 10px", color: "rgba(255,255,255,0.65)", fontSize: 13.5, lineHeight: 1.6 }}>
          Ugandan tech enthusiast, bookworm, and fitness fanatic exploring the world one mile at a time. 🌍
        </p>

        <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
          <span style={{ color: DIM, fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>📍 Uganda</span>
          <span style={{ color: VIOLET_LIGHT, fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>🔗 amkaweesi.afuchat.com</span>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
          {[{ n: "85", l: "Followers", gold: false }, { n: "50", l: "Following", gold: false }, { n: "407", l: "Legend XP", gold: true }].map((s) => (
            <div key={s.l} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "11px 6px", textAlign: "center" }}>
              <div style={{ fontSize: 19, fontWeight: 800, color: s.gold ? "#FBBF24" : "white" }}>{s.n}</div>
              <div style={{ fontSize: 10, color: DIM, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 2 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {[
            { icon: "💬", label: "Chat", color: VIOLET_LIGHT, bg: "rgba(124,58,237,0.15)", bd: "rgba(124,58,237,0.25)" },
            { icon: "👋", label: "Wave", color: "#FB923C", bg: "rgba(249,115,22,0.15)", bd: "rgba(249,115,22,0.25)" },
            { icon: "🎁", label: "Gift", color: "#F472B6", bg: "rgba(236,72,153,0.15)", bd: "rgba(236,72,153,0.25)" },
          ].map((a) => (
            <button key={a.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "12px 8px", borderRadius: 16, background: a.bg, border: `1px solid ${a.bd}`, cursor: "pointer" }}>
              <span style={{ fontSize: 17 }}>{a.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: a.color }}>{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: `rgba(10,10,15,0.93)`, backdropFilter: "blur(16px)", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ display: "flex" }}>
          {(["posts", "photos", "videos"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: "13px 0", fontSize: 13, fontWeight: 600,
                textTransform: "capitalize", background: "transparent", border: "none", cursor: "pointer",
                color: tab === t ? VIOLET_LIGHT : DIM,
                borderBottom: tab === t ? `2px solid ${VIOLET}` : "2px solid transparent",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "16px 16px 32px" }}>
        {tab === "posts" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { text: "Two People Speaking Two Different Languages — that's modern communication. Persistence wins.", likes: 24, replies: 8, time: "2h" },
              { text: "There are moments where the most expensive thing you can do is nothing.", img: POSTS_IMG[0], likes: 47, replies: 12, time: "1d" },
              { text: "Finished Atomic Habits for the third time. Different insight every read.", likes: 31, replies: 5, time: "2d" },
            ].map((p, i) => (
              <div key={i} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 18, padding: 14 }}>
                <p style={{ margin: "0 0 10px", color: "rgba(255,255,255,0.78)", fontSize: 13.5, lineHeight: 1.6 }}>{p.text}</p>
                {p.img && <img src={p.img} style={{ width: "100%", height: 130, objectFit: "cover", borderRadius: 10, marginBottom: 10, display: "block" }} />}
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: DIM, fontSize: 11 }}>{p.time}</span>
                  <div style={{ display: "flex", gap: 14 }}>
                    <span style={{ color: DIM, fontSize: 11 }}>♡ {p.likes}</span>
                    <span style={{ color: DIM, fontSize: 11 }}>💬 {p.replies}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "photos" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 3 }}>
            {POSTS_IMG.map((img, i) => (
              <div key={i} style={{ aspectRatio: "1/1", borderRadius: 10, overflow: "hidden" }}>
                <img src={img} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            ))}
          </div>
        )}

        {tab === "videos" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {VIDEOS.map((v, i) => (
              <div key={i} style={{ position: "relative", borderRadius: 14, overflow: "hidden", aspectRatio: "9/16", maxHeight: 195 }}>
                <img src={v.thumb} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)" }} />
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.2)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  </div>
                </div>
                <div style={{ position: "absolute", bottom: 7, left: 7, right: 7, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 10, fontWeight: 600 }}>👁 {v.views}</span>
                  <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 10, fontWeight: 600, background: "rgba(0,0,0,0.45)", padding: "2px 5px", borderRadius: 4 }}>{v.duration}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

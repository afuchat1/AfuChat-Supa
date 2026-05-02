import { useState } from "react";
import { Play, Heart, MessageCircle, Eye, MapPin, UserPlus, Check, MessageSquare, Zap, LayoutGrid, FileText, Film } from "lucide-react";

const GOLD = "#D4A853";
const TEXT = "#0F0F0F";
const TEXT_SEC = "#606060";
const TEXT_MUTED = "#909090";
const BG = "#FFFFFF";
const BG_SEC = "#F2F2F2";
const BORDER = "#E5E5E5";

const THEMES: { name: string; accent: string }[] = [
  { name: "Teal",    accent: "#00BCD4" },
  { name: "Blue",    accent: "#007AFF" },
  { name: "Purple",  accent: "#AF52DE" },
  { name: "Rose",    accent: "#FF2D55" },
  { name: "Amber",   accent: "#FF9500" },
  { name: "Emerald", accent: "#34C759" },
];

const AVATAR = "https://i.pravatar.cc/150?img=47";
const PHOTOS = [
  "https://images.unsplash.com/photo-1506748686214-e9df14d4d9d0?w=400&q=80",
  "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=400&q=80",
  "https://images.unsplash.com/photo-1682685797507-d44d838b0ac7?w=400&q=80",
  "https://images.unsplash.com/photo-1682685797661-9e0c87f59c60?w=400&q=80",
  "https://images.unsplash.com/photo-1704387744073-4f5843f60513?w=400&q=80",
  "https://images.unsplash.com/photo-1682687220063-4742bd7fd538?w=400&q=80",
];
const VIDEOS = [
  { thumb: "https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=400&q=80", views: "12.4K" },
  { thumb: "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=400&q=80", views: "8.1K" },
  { thumb: "https://images.unsplash.com/photo-1611162618071-b39a2ec055fb?w=400&q=80", views: "34K" },
  { thumb: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80", views: "5.2K" },
  { thumb: "https://images.unsplash.com/photo-1618641986557-1ecd230959aa?w=400&q=80", views: "21K" },
  { thumb: "https://images.unsplash.com/photo-1619983081563-430f63602796?w=400&q=80", views: "9.7K" },
];

type Tab = "posts" | "photos" | "videos";
const TABS: { key: Tab; icon: React.ReactNode }[] = [
  { key: "photos", icon: <LayoutGrid size={20} /> },
  { key: "posts",  icon: <FileText size={20} /> },
  { key: "videos", icon: <Film size={20} /> },
];

export function MinimalGrid() {
  const [tab, setTab] = useState<Tab>("photos");
  const [following, setFollowing] = useState(false);
  const [themeIdx, setThemeIdx] = useState(2); // Purple — matches user's current setting

  const BRAND = THEMES[themeIdx].accent;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: BG, fontFamily: "'Inter', system-ui, sans-serif", color: TEXT }}>

      {/* ── Theme switcher (mockup-only) ─── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "10px 16px 8px", backgroundColor: BG_SEC, borderBottom: `1px solid ${BORDER}` }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.06em" }}>App Colour</span>
        <div style={{ display: "flex", gap: 8 }}>
          {THEMES.map((t, i) => (
            <button
              key={t.name}
              onClick={() => setThemeIdx(i)}
              title={t.name}
              style={{
                width: 22, height: 22, borderRadius: "50%", backgroundColor: t.accent, border: "none", cursor: "pointer",
                outline: i === themeIdx ? `2.5px solid ${t.accent}` : "none",
                outlineOffset: 2,
                boxShadow: i === themeIdx ? `0 0 0 1px white, 0 0 0 3px ${t.accent}` : "none",
                transform: i === themeIdx ? "scale(1.15)" : "scale(1)",
                transition: "all 0.15s ease",
              }}
            />
          ))}
        </div>
      </div>

      {/* ── Sticky nav bar ─── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 30,
        backgroundColor: "rgba(255,255,255,0.92)", backdropFilter: "blur(16px)",
        borderBottom: `1px solid ${BORDER}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "10px 16px",
      }}>
        <button style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer" }}>
          <svg width="20" height="20" fill="none" stroke={TEXT} strokeWidth="2.2" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </button>
        <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>amkaweesi</span>
        <button style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="1.5" fill={TEXT_SEC}/><circle cx="12" cy="12" r="1.5" fill={TEXT_SEC}/><circle cx="19" cy="12" r="1.5" fill={TEXT_SEC}/></svg>
        </button>
      </div>

      {/* ── Profile section ─── */}
      <div style={{ padding: "20px 20px 16px" }}>

        {/* Avatar + stats row */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 14 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", overflow: "hidden", outline: `2.5px solid ${BRAND}`, outlineOffset: 2 }}>
              <img src={AVATAR} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div style={{ position: "absolute", bottom: 2, right: 2, width: 14, height: 14, borderRadius: "50%", backgroundColor: BRAND, border: "2px solid white" }} />
          </div>

          <div style={{ flex: 1, display: "flex", justifyContent: "space-around" }}>
            {[{ n: "20", l: "Posts" }, { n: "85", l: "Followers" }, { n: "50", l: "Following" }].map((s) => (
              <div key={s.l} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 19, fontWeight: 900, color: TEXT }}>{s.n}</div>
                <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 1 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Name + badges */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>AM Kaweesi</span>
          <svg width="15" height="15" viewBox="0 0 24 24" fill={BRAND}><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <span style={{ backgroundColor: GOLD + "22", color: GOLD, fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Legend</span>
        </div>

        {/* Bio */}
        <p style={{ color: TEXT_SEC, fontSize: 12.5, lineHeight: 1.6, margin: "0 0 8px" }}>
          🇺🇬 Ugandan tech enthusiast &amp; bookworm.<br />Exploring the world one mile at a time.
        </p>

        {/* Meta */}
        <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 3, color: TEXT_MUTED, fontSize: 12 }}>
            <MapPin size={10} /> Uganda
          </span>
          <span style={{ color: BRAND, fontSize: 12 }}>amkaweesi.afuchat.com</span>
        </div>

        {/* CTA row */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {following ? (
            <button onClick={() => setFollowing(false)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", borderRadius: 80, border: `1.5px solid ${BRAND}`, background: "transparent", color: BRAND, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              <Check size={13} /> Following
            </button>
          ) : (
            <button onClick={() => setFollowing(true)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", borderRadius: 80, border: "none", background: BRAND, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              <UserPlus size={13} /> Follow
            </button>
          )}
          <button style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", borderRadius: 80, border: `1.5px solid ${BRAND}`, background: "transparent", color: BRAND, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <MessageSquare size={13} /> Message
          </button>
        </div>

        {/* XP strip */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, backgroundColor: BG_SEC, borderRadius: 12, padding: "9px 14px", border: `1px solid ${BORDER}` }}>
          <Zap size={13} color={GOLD} fill={GOLD} />
          <span style={{ fontSize: 12, fontWeight: 600, color: TEXT, whiteSpace: "nowrap" }}>Legend · 407 XP</span>
          <div style={{ flex: 1, height: 5, backgroundColor: BORDER, borderRadius: 99, overflow: "hidden" }}>
            <div style={{ width: "68%", height: "100%", backgroundColor: GOLD, borderRadius: 99 }} />
          </div>
          <span style={{ fontSize: 10, color: TEXT_MUTED, minWidth: 28, textAlign: "right" }}>68%</span>
        </div>
      </div>

      {/* ── Tab bar ─── */}
      <div style={{ borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, display: "flex" }}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1, padding: "12px 0",
                display: "flex", alignItems: "center", justifyContent: "center",
                position: "relative", border: "none", cursor: "pointer",
                backgroundColor: active ? BG : BRAND,
                color: active ? BRAND : "rgba(255,255,255,0.9)",
                borderTopLeftRadius: active ? 0 : 33,
                borderBottomRightRadius: active ? 0 : 33,
                transition: "all 0.15s ease",
              }}
            >
              {t.icon}
              {active && (
                <span style={{ position: "absolute", top: 0, left: "25%", right: "25%", height: 2, backgroundColor: BRAND, borderRadius: "0 0 4px 4px" }} />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Content ─── */}
      {tab === "photos" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1.5, backgroundColor: BG_SEC }}>
          {PHOTOS.map((img, i) => (
            <div key={i} style={{ position: "relative", paddingBottom: "100%", backgroundColor: BG_SEC }}>
              <img src={img} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          ))}
        </div>
      )}

      {tab === "posts" && (
        <div>
          {[
            { text: "Two People Speaking Two Different Languages. Persistence is everything.", likes: 24, replies: 8, time: "2h" },
            { text: "The most expensive thing you can do is nothing. Act while the window is open.", img: PHOTOS[0], likes: 47, replies: 12, time: "1d" },
            { text: "Finished Atomic Habits for the third time. Fresh insight every read.", likes: 31, replies: 5, time: "2d" },
            { text: "Uganda's tech scene is evolving faster than most realise. Watch this space. 🚀", likes: 89, replies: 22, time: "3d" },
          ].map((p, i) => (
            <div key={i} style={{ padding: "14px 20px", borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ display: "flex", gap: 10 }}>
                <img src={AVATAR} style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>AM Kaweesi</span>
                    <span style={{ fontSize: 12, color: TEXT_MUTED }}>· {p.time}</span>
                  </div>
                  <p style={{ color: TEXT_SEC, fontSize: 13, lineHeight: 1.6, margin: "0 0 8px" }}>{p.text}</p>
                  {p.img && <img src={p.img} style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 10, marginBottom: 8, display: "block" }} />}
                  <div style={{ display: "flex", gap: 18 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, color: TEXT_MUTED, fontSize: 12 }}><Heart size={13} />{p.likes}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, color: TEXT_MUTED, fontSize: 12 }}><MessageCircle size={13} />{p.replies}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "videos" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1.5, backgroundColor: BG_SEC }}>
          {VIDEOS.map((v, i) => (
            <div key={i} style={{ position: "relative", paddingBottom: "150%", backgroundColor: "#111" }}>
              <img src={v.thumb} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.6), transparent)" }} />
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Play size={18} fill="white" color="white" style={{ opacity: 0.85 }} />
              </div>
              <div style={{ position: "absolute", bottom: 6, left: 6, display: "flex", alignItems: "center", gap: 3 }}>
                <Eye size={9} color="rgba(255,255,255,0.75)" />
                <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 9, fontWeight: 600 }}>{v.views}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ height: 40 }} />
    </div>
  );
}

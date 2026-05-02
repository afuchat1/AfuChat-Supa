import { useState } from "react";
import { Play, Heart, MessageCircle, Eye, MapPin, UserPlus, Check, MessageSquare, Gift, Shield, Star, Zap, LayoutGrid, FileText, Film } from "lucide-react";

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
  { thumb: "https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=400&q=80", views: "12.4K", dur: "0:45" },
  { thumb: "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=400&q=80", views: "8.1K", dur: "1:20" },
  { thumb: "https://images.unsplash.com/photo-1611162618071-b39a2ec055fb?w=400&q=80", views: "34K", dur: "2:05" },
  { thumb: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80", views: "5.2K", dur: "0:58" },
  { thumb: "https://images.unsplash.com/photo-1618641986557-1ecd230959aa?w=400&q=80", views: "21K", dur: "1:33" },
  { thumb: "https://images.unsplash.com/photo-1619983081563-430f63602796?w=400&q=80", views: "9.7K", dur: "0:32" },
];

type Tab = "posts" | "photos" | "videos";

export function MinimalGrid() {
  const [tab, setTab] = useState<Tab>("photos");
  const [following, setFollowing] = useState(false);

  return (
    <div className="min-h-screen bg-white font-['Inter']" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ── Sticky minimal header ─── */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-gray-100 px-4 py-3 flex justify-between items-center">
        <button className="w-8 h-8 flex items-center justify-center">
          <svg width="20" height="20" fill="none" stroke="#111" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </button>
        <span className="text-[13px] font-bold text-gray-900">amkaweesi</span>
        <button className="w-8 h-8 flex items-center justify-center">
          <svg width="18" height="18" fill="none" stroke="#555" strokeWidth="2" viewBox="0 0 24 24"><circle cx="8.5" cy="8.5" r="1.5" fill="#555"/><circle cx="15.5" cy="8.5" r="1.5" fill="#555"/><circle cx="12" cy="15.5" r="1.5" fill="#555"/></svg>
        </button>
      </div>

      {/* ── Profile header ─── */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start gap-4 mb-4">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div className="w-20 h-20 rounded-full overflow-hidden ring-2 ring-gray-900 ring-offset-2">
              <img src={AVATAR} className="w-full h-full object-cover" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-green-400 rounded-full border-2 border-white" />
          </div>

          {/* Stats — inline horizontal */}
          <div className="flex-1 pt-2">
            <div className="flex justify-around">
              {[{ n: "20", l: "Posts" }, { n: "85", l: "Followers" }, { n: "50", l: "Following" }].map((s) => (
                <div key={s.l} className="text-center">
                  <div className="text-[18px] font-black text-gray-900">{s.n}</div>
                  <div className="text-[11px] text-gray-400">{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Name & bio */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[15px] font-bold text-gray-900">AM Kaweesi</span>
            <Shield size={13} className="text-blue-500" fill="#3b82f6" />
            <span className="bg-amber-100 text-amber-700 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wide">Legend</span>
          </div>
          <p className="text-gray-500 text-[12.5px] leading-relaxed">
            🇺🇬 Ugandan tech enthusiast &amp; bookworm.<br />Exploring the world one mile at a time.
          </p>
          <div className="flex gap-3 mt-1.5">
            <span className="flex items-center gap-1 text-gray-400 text-xs"><MapPin size={10} />Uganda</span>
            <span className="text-blue-500 text-xs">amkaweesi.afuchat.com</span>
          </div>
        </div>

        {/* CTA row */}
        <div className="flex gap-2 mb-4">
          {following ? (
            <button onClick={() => setFollowing(false)} className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 text-[13px] font-semibold flex items-center justify-center gap-1.5">
              <Check size={13} /> Following
            </button>
          ) : (
            <button onClick={() => setFollowing(true)} className="flex-1 py-2 rounded-lg bg-gray-900 text-white text-[13px] font-bold flex items-center justify-center gap-1.5">
              <UserPlus size={13} /> Follow
            </button>
          )}
          <button className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-700 text-[13px] font-semibold flex items-center justify-center gap-1.5">
            <MessageSquare size={13} /> Message
          </button>
          <button className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-base">
            👋
          </button>
          <button className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center">
            <Gift size={14} className="text-gray-500" />
          </button>
        </div>

        {/* XP strip */}
        <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-2.5 border border-gray-100">
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-amber-500" fill="#f59e0b" />
            <span className="text-[12px] font-semibold text-gray-700">Legend · 407 XP</span>
          </div>
          <div className="flex-1 mx-3 bg-gray-200 rounded-full h-1.5 overflow-hidden">
            <div className="bg-amber-400 h-full rounded-full" style={{ width: "68%" }} />
          </div>
          <span className="text-[10px] text-gray-400">68%</span>
        </div>
      </div>

      {/* ── Tab bar (icon-only, Instagram style) ─── */}
      <div className="border-y border-gray-100">
        <div className="flex">
          {([
            { key: "photos", icon: <LayoutGrid size={20} /> },
            { key: "posts", icon: <FileText size={20} /> },
            { key: "videos", icon: <Film size={20} /> },
          ] as { key: Tab; icon: any }[]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-3 flex items-center justify-center relative ${
                tab === t.key ? "text-gray-900" : "text-gray-300"
              }`}
            >
              {t.icon}
              {tab === t.key && <span className="absolute top-0 left-1/4 right-1/4 h-0.5 bg-gray-900 rounded-b-full" />}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ─── */}
      {/* Photos — 3-col grid */}
      {tab === "photos" && (
        <div className="grid grid-cols-3 gap-[1.5px] bg-gray-100">
          {PHOTOS.map((img, i) => (
            <div key={i} className="relative bg-gray-100" style={{ paddingBottom: "100%" }}>
              <img src={img} className="absolute inset-0 w-full h-full object-cover" />
            </div>
          ))}
        </div>
      )}

      {/* Posts */}
      {tab === "posts" && (
        <div className="divide-y divide-gray-50">
          {[
            { text: "Two People Speaking Two Different Languages. Persistence is everything.", likes: 24, replies: 8, time: "2h" },
            { text: "The most expensive thing you can do is nothing. Act while the window is open.", img: PHOTOS[0], likes: 47, replies: 12, time: "1d" },
            { text: "Finished Atomic Habits for the third time. Fresh insight every read.", likes: 31, replies: 5, time: "2d" },
            { text: "Uganda's tech scene is evolving faster than most realise. Watch this space. 🚀", likes: 89, replies: 22, time: "3d" },
          ].map((p, i) => (
            <div key={i} className="px-5 py-4">
              <div className="flex gap-3">
                <img src={AVATAR} className="w-8 h-8 rounded-full flex-shrink-0 object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[13px] font-bold text-gray-900">AM Kaweesi</span>
                    <span className="text-gray-400 text-[12px]">· {p.time}</span>
                  </div>
                  <p className="text-gray-700 text-[13px] leading-relaxed mb-2">{p.text}</p>
                  {p.img && <img src={p.img} className="w-full h-36 object-cover rounded-xl mb-2" />}
                  <div className="flex gap-5">
                    <span className="flex items-center gap-1 text-gray-400 text-xs"><Heart size={13} />{p.likes}</span>
                    <span className="flex items-center gap-1 text-gray-400 text-xs"><MessageCircle size={13} />{p.replies}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Videos — 3-col portrait grid */}
      {tab === "videos" && (
        <div className="grid grid-cols-3 gap-[1.5px] bg-gray-100">
          {VIDEOS.map((v, i) => (
            <div key={i} className="relative bg-gray-900" style={{ paddingBottom: "150%" }}>
              <img src={v.thumb} className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Play size={20} fill="white" className="text-white opacity-80" />
              </div>
              <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1">
                <Eye size={9} className="text-white/70" />
                <span className="text-white text-[9px] font-semibold">{v.views}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="h-10" />
    </div>
  );
}

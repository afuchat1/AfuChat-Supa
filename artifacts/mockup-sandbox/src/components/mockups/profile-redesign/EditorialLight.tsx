import { useState } from "react";
import { Play, Heart, MessageCircle, Eye, MapPin, Link2, UserPlus, Check, MessageSquare, Gift, Hand, Shield, Star, BookOpen, Video, Image } from "lucide-react";

const AVATAR = "https://i.pravatar.cc/150?img=15";
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
];

type Tab = "posts" | "media" | "videos";

export function EditorialLight() {
  const [tab, setTab] = useState<Tab>("posts");
  const [following, setFollowing] = useState(false);

  return (
    <div className="min-h-screen bg-[#F5F4F2] font-['Inter']" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ── Top nav ─── */}
      <div className="flex justify-between items-center px-4 pt-10 pb-4">
        <button className="w-9 h-9 rounded-full bg-black/6 flex items-center justify-center">
          <svg width="18" height="18" fill="none" stroke="#333" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </button>
        <button className="w-9 h-9 rounded-full bg-black/6 flex items-center justify-center">
          <svg width="16" height="16" fill="none" stroke="#555" strokeWidth="2.5" viewBox="0 0 24 24"><circle cx="8.5" cy="8.5" r="1.5" fill="#555"/><circle cx="15.5" cy="8.5" r="1.5" fill="#555"/><circle cx="12" cy="15.5" r="1.5" fill="#555"/></svg>
        </button>
      </div>

      {/* ── Profile card ─── */}
      <div className="mx-4 bg-white rounded-3xl overflow-hidden shadow-sm mb-3">
        {/* Color stripe */}
        <div className="h-24 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-400 relative">
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white/20 to-transparent" />
        </div>

        <div className="px-5 pb-6">
          {/* Avatar + follow row */}
          <div className="flex justify-between items-end -mt-10 mb-4">
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl ring-4 ring-white overflow-hidden shadow-md">
                <img src={AVATAR} className="w-full h-full object-cover" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-400 rounded-full border-2 border-white" />
            </div>
            <div className="flex gap-2 mt-2">
              {following ? (
                <button onClick={() => setFollowing(false)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600">
                  <Check size={13} /> Following
                </button>
              ) : (
                <button onClick={() => setFollowing(true)} className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white shadow-md">
                  <UserPlus size={13} /> Follow
                </button>
              )}
            </div>
          </div>

          {/* Name + badges */}
          <div className="flex items-center gap-2 mb-0.5">
            <h1 className="text-[19px] font-bold text-gray-900 tracking-tight">AM Kaweesi</h1>
            <span className="flex items-center gap-0.5 bg-indigo-50 text-indigo-600 text-[9px] font-bold px-2 py-0.5 rounded-full border border-indigo-100">
              <Shield size={8} /> VERIFIED
            </span>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-gray-400 text-[13px]">@amkaweesi</span>
            <span className="flex items-center gap-0.5 bg-amber-50 text-amber-600 text-[9px] font-bold px-2 py-0.5 rounded-full">
              <Star size={8} /> LEGEND
            </span>
          </div>

          <p className="text-gray-600 text-[13px] leading-relaxed mb-4">
            Ugandan tech enthusiast, bookworm, and fitness fanatic exploring the world one mile at a time. 🌍
          </p>

          <div className="flex flex-wrap gap-3 mb-4 text-[12px]">
            <span className="flex items-center gap-1 text-gray-400"><MapPin size={11} />Uganda</span>
            <span className="flex items-center gap-1 text-indigo-500"><Link2 size={11} />amkaweesi.afuchat.com</span>
          </div>

          {/* Stats row */}
          <div className="flex divide-x divide-gray-100 border border-gray-100 rounded-2xl overflow-hidden mb-4">
            {[{ n: "85", l: "Followers" }, { n: "50", l: "Following" }, { n: "407", l: "XP", gold: true }].map((s) => (
              <div key={s.l} className="flex-1 py-3 text-center">
                <div className={`text-lg font-bold ${s.gold ? "text-amber-500" : "text-gray-900"}`}>{s.n}</div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wide">{s.l}</div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold shadow-sm">
              <MessageSquare size={15} /> Chat
            </button>
            <button className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center">
              <span className="text-base">👋</span>
            </button>
            <button className="w-10 h-10 rounded-xl bg-pink-50 border border-pink-100 flex items-center justify-center">
              <Gift size={15} className="text-pink-500" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Tab bar ─── */}
      <div className="mx-4 bg-white rounded-2xl p-1 flex gap-1 mb-3 shadow-sm">
        {([
          { key: "posts", icon: <BookOpen size={14} />, label: "Posts" },
          { key: "media", icon: <Image size={14} />, label: "Photos" },
          { key: "videos", icon: <Video size={14} />, label: "Videos" },
        ] as { key: Tab; icon: any; label: string }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${
              tab === t.key ? "bg-indigo-600 text-white shadow-md" : "text-gray-400"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Content ─── */}
      <div className="mx-4 pb-10">
        {/* Posts */}
        {tab === "posts" && (
          <div className="space-y-3">
            {[
              { text: "Two People Speaking Two Different Languages — that's modern communication. Persistence wins.", time: "2h", likes: 24, replies: 8 },
              { text: "There are moments where the most expensive thing you can do is nothing.", img: PHOTOS[1], time: "1d", likes: 47, replies: 12 },
              { text: "Finished Atomic Habits for the third time. Different insight every read.", time: "2d", likes: 31, replies: 5 },
            ].map((p, i) => (
              <div key={i} className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="text-gray-700 text-[13.5px] leading-relaxed mb-3">{p.text}</p>
                {p.img && <img src={p.img} className="w-full h-44 object-cover rounded-xl mb-3" />}
                <div className="flex justify-between items-center pt-2 border-t border-gray-50">
                  <span className="text-gray-300 text-xs">{p.time}</span>
                  <div className="flex gap-4">
                    <span className="flex items-center gap-1 text-gray-400 text-xs"><Heart size={13} />{p.likes}</span>
                    <span className="flex items-center gap-1 text-gray-400 text-xs"><MessageCircle size={13} />{p.replies}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Photos - masonry-style 2-col */}
        {tab === "media" && (
          <div className="grid grid-cols-2 gap-2">
            {PHOTOS.map((img, i) => (
              <div key={i} className={`overflow-hidden rounded-2xl ${i === 0 ? "col-span-2 h-52" : "h-36"}`}>
                <img src={img} className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
              </div>
            ))}
          </div>
        )}

        {/* Videos */}
        {tab === "videos" && (
          <div className="space-y-3">
            {VIDEOS.map((v, i) => (
              <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-sm flex gap-3 p-3">
                <div className="relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0">
                  <img src={v.thumb} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Play size={16} fill="white" className="text-white" />
                  </div>
                </div>
                <div className="flex flex-col justify-between py-1">
                  <p className="text-gray-700 text-[13px] font-medium leading-snug">Exploring the tech landscape of East Africa</p>
                  <div className="flex gap-3 text-gray-400 text-xs">
                    <span className="flex items-center gap-1"><Eye size={11} />{v.views}</span>
                    <span>{v.dur}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

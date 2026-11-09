/**
 * Personalization Engine
 *
 * Derives user interest signals from the local activity ring buffer
 * and supplements the feed algorithm's existing learned weights.
 *
 * All reads are local (AsyncStorage) — no network calls.
 * Functions are async and safe to call in parallel.
 */

import { getRecentEvents } from "./activityTracker";
import { getLearnedInterestBoosts } from "./feedAlgorithm";

// ─── Interest keyword map (mirrors feedAlgorithm's INTEREST_KEYWORDS) ─────────
// Kept here to avoid circular imports; changes in feedAlgorithm should be mirrored.

const INTEREST_MAP: Record<string, string[]> = {
  technology:  ["tech", "code", "software", "app", "ai", "robot", "computer", "programming", "developer", "startup", "digital", "gadget", "ios", "android", "algorithm", "api"],
  music:       ["music", "song", "album", "artist", "concert", "guitar", "piano", "beat", "hip hop", "rap", "jazz", "rock", "pop", "dj", "producer", "playlist"],
  sports:      ["sport", "football", "soccer", "basketball", "tennis", "cricket", "goal", "match", "team", "player", "championship", "league", "athlete", "nba", "fifa"],
  fashion:     ["fashion", "style", "outfit", "clothing", "brand", "designer", "trend", "dress", "shoes", "model", "runway", "luxury"],
  food:        ["food", "cook", "recipe", "restaurant", "meal", "chef", "kitchen", "eat", "bake", "dinner", "cuisine", "dish"],
  travel:      ["travel", "trip", "vacation", "explore", "adventure", "flight", "hotel", "beach", "mountain", "tour", "destination"],
  art:         ["art", "design", "paint", "draw", "creative", "sketch", "gallery", "illustration", "canvas", "sculpture", "aesthetic"],
  gaming:      ["game", "gaming", "gamer", "xbox", "playstation", "ps5", "nintendo", "steam", "esports", "rpg", "fps", "twitch"],
  fitness:     ["fitness", "gym", "workout", "exercise", "health", "muscle", "cardio", "yoga", "run", "weight", "diet", "training"],
  photography: ["photo", "camera", "shoot", "portrait", "landscape", "lens", "capture", "exposure", "edit", "lightroom", "snap"],
  business:    ["business", "entrepreneur", "startup", "invest", "money", "market", "profit", "revenue", "ceo", "company", "marketing", "sales"],
  education:   ["education", "learn", "school", "university", "student", "teacher", "study", "course", "class", "degree", "knowledge"],
  movies:      ["movie", "film", "cinema", "series", "tv", "show", "netflix", "actor", "director", "trailer", "episode", "drama", "anime"],
  reading:     ["read", "book", "novel", "author", "library", "fiction", "story", "chapter", "write", "literature", "poetry"],
  nature:      ["nature", "environment", "tree", "forest", "ocean", "animal", "wildlife", "climate", "green", "eco", "planet", "garden"],
  politics:    ["politic", "government", "election", "vote", "president", "democracy", "law", "policy", "parliament", "debate"],
  science:     ["science", "research", "experiment", "physics", "chemistry", "biology", "space", "nasa", "atom", "quantum", "gene"],
  crypto:      ["crypto", "bitcoin", "ethereum", "blockchain", "nft", "web3", "defi", "token", "wallet", "mining", "binance"],
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns top interest category names derived from recent activity.
 * Combines feedAlgorithm's learned weights (from interactions)
 * with search-query analysis.
 */
export async function getActivityInterests(topN = 8): Promise<string[]> {
  const [feedBoosts, searchBoosts] = await Promise.all([
    getLearnedInterestBoosts(),
    getSearchDerivedBoosts(),
  ]);

  const merged: Record<string, number> = { ...feedBoosts };
  for (const [cat, score] of Object.entries(searchBoosts)) {
    merged[cat] = (merged[cat] || 0) + score;
  }

  return Object.entries(merged)
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN)
    .map(([cat]) => cat);
}

/**
 * Returns additional interest boosts derived from search activity.
 * These supplement `getLearnedInterestBoosts()` from feedAlgorithm.
 * Safe to merge into `learnedWeightsRef` in discover.tsx.
 */
export async function getSearchDerivedBoosts(): Promise<Record<string, number>> {
  const searches = await getRecentEvents("search", 300);
  const boosts: Record<string, number> = {};
  const now = Date.now();

  for (const ev of searches) {
    const query = ((ev.data.query as string) || "").toLowerCase();
    if (!query) continue;
    const ageDays      = (now - ev.ts) / (86_400 * 1000);
    const recencyMult  = Math.max(0, 1 - ageDays / 30); // linear decay over 30 days
    const isExplicit   = query.startsWith("#") ? 1.5 : 1; // hashtag searches weighted higher

    for (const [category, keywords] of Object.entries(INTEREST_MAP)) {
      if (keywords.some((kw) => query.includes(kw))) {
        boosts[category] = (boosts[category] || 0) + 4 * recencyMult * isExplicit;
      }
    }
  }

  return boosts;
}

/**
 * Returns a set of author IDs the current user frequently engages with.
 * Used to boost affinity score in the feed algorithm.
 */
export async function getFrequentAuthorIds(limit = 30): Promise<Set<string>> {
  const [profileViews, videoViews, likes, bookmarks] = await Promise.all([
    getRecentEvents("view_profile", 300),
    getRecentEvents("view_video",   300),
    getRecentEvents("like_post",    300),
    getRecentEvents("bookmark_post",100),
  ]);

  const counts: Record<string, number> = {};

  const weight = (type: string) => {
    if (type === "like_post" || type === "bookmark_post") return 3;
    if (type === "view_profile") return 2;
    return 1;
  };

  for (const ev of [...profileViews, ...videoViews, ...likes, ...bookmarks]) {
    const id = (ev.data.profile_id || ev.data.author_id) as string | undefined;
    if (id) counts[id] = (counts[id] || 0) + weight(ev.type);
  }

  return new Set(
    Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([id]) => id),
  );
}

/**
 * Returns personalized tag suggestions to show in the search empty state.
 * Falls back to an empty array if no activity data exists yet.
 */
export async function getPersonalizedTags(max = 12): Promise<string[]> {
  const interests = await getActivityInterests(max);
  return interests;
}

/**
 * Returns inline search suggestions matching a partial query,
 * drawn from the user's recent search history.
 */
export async function getSearchSuggestions(partialQuery: string): Promise<string[]> {
  const q = partialQuery.trim().toLowerCase();
  if (q.length < 2) return [];
  const searches = await getRecentEvents("search", 150);
  return searches
    .map((e) => (e.data.query as string) || "")
    .filter((s) => s && s.toLowerCase().includes(q) && s.toLowerCase() !== q)
    .filter((s, i, arr) => arr.indexOf(s) === i)
    .slice(0, 5);
}

/**
 * Returns a merged interest-boost map that can be fed directly into
 * `matchInterestsWeighted` as the `learnedWeights` argument.
 * Combines algorithm-learned weights + search-derived boosts.
 */
export async function getMergedLearnedWeights(): Promise<Record<string, number>> {
  const [feedBoosts, searchBoosts] = await Promise.all([
    getLearnedInterestBoosts(),
    getSearchDerivedBoosts(),
  ]);

  const merged: Record<string, number> = { ...feedBoosts };
  for (const [cat, score] of Object.entries(searchBoosts)) {
    merged[cat] = Math.min(120, (merged[cat] || 0) + score);
  }
  return merged;
}

import AsyncStorage from "@react-native-async-storage/async-storage";

const INTERACTION_WEIGHTS_KEY = "feed_interaction_weights_v1";
const SEEN_FEED_POSTS_KEY = "seen_feed_post_ids_v2";
const SEEN_VIDEO_IDS_KEY = "seen_video_ids_v2";
const DECAY_FACTOR = 0.97;
const MAX_WEIGHT = 120;
const SEEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const INTEREST_KEYWORDS: Record<string, string[]> = {
  technology: ["tech", "code", "software", "app", "ai", "robot", "computer", "programming", "developer", "startup", "digital", "gadget", "phone", "laptop", "internet", "algorithm", "data", "cloud", "machine learning", "api", "hack", "cyber", "silicon", "ios", "android"],
  music: ["music", "song", "album", "artist", "concert", "guitar", "piano", "beat", "melody", "hip hop", "rap", "jazz", "rock", "pop", "dj", "producer", "playlist", "spotify", "singing", "band", "vinyl", "studio", "lyric"],
  sports: ["sport", "football", "soccer", "basketball", "tennis", "cricket", "goal", "match", "team", "player", "coach", "championship", "league", "fitness", "athlete", "stadium", "score", "win", "trophy", "nba", "fifa", "olympic"],
  fashion: ["fashion", "style", "outfit", "clothing", "brand", "designer", "trend", "dress", "shoes", "wear", "model", "runway", "luxury", "accessory", "collection", "vogue", "drip", "fit"],
  food: ["food", "cook", "recipe", "restaurant", "meal", "chef", "kitchen", "eat", "delicious", "bake", "dinner", "lunch", "breakfast", "snack", "taste", "flavor", "cuisine", "dish", "spice", "grill"],
  travel: ["travel", "trip", "vacation", "explore", "adventure", "flight", "hotel", "beach", "mountain", "tour", "destination", "passport", "backpack", "road trip", "sightseeing", "island", "resort", "abroad"],
  art: ["art", "design", "paint", "draw", "creative", "sketch", "gallery", "illustration", "canvas", "sculpture", "aesthetic", "mural", "exhibition", "graphic", "color", "visual", "masterpiece"],
  gaming: ["game", "gaming", "gamer", "xbox", "playstation", "ps5", "nintendo", "steam", "esports", "rpg", "fps", "multiplayer", "console", "pc gaming", "fortnite", "minecraft", "cod", "valorant", "twitch", "streamer", "level up"],
  fitness: ["fitness", "gym", "workout", "exercise", "health", "muscle", "cardio", "yoga", "run", "weight", "diet", "protein", "training", "marathon", "crossfit", "push up", "squat", "body", "strength", "wellness"],
  photography: ["photo", "camera", "shoot", "portrait", "landscape", "lens", "capture", "exposure", "edit", "lightroom", "snap", "image", "picture", "photographer", "film", "focus", "angle", "sunset"],
  business: ["business", "entrepreneur", "startup", "invest", "money", "market", "profit", "revenue", "ceo", "company", "brand", "marketing", "sales", "growth", "strategy", "finance", "economy", "stock", "trade", "hustle", "wealth"],
  education: ["education", "learn", "school", "university", "student", "teacher", "study", "course", "class", "degree", "knowledge", "book", "lecture", "exam", "research", "academic", "scholarship", "diploma", "grad"],
  movies: ["movie", "film", "cinema", "series", "tv", "show", "netflix", "actor", "director", "scene", "trailer", "episode", "season", "drama", "comedy", "thriller", "superhero", "oscar", "hollywood", "anime", "binge"],
  reading: ["read", "book", "novel", "author", "library", "fiction", "story", "chapter", "write", "literature", "poetry", "poem", "bestseller", "kindle", "page", "publish", "memoir"],
  nature: ["nature", "environment", "tree", "forest", "ocean", "animal", "wildlife", "climate", "green", "eco", "planet", "earth", "garden", "flower", "outdoor", "hike", "camp", "river", "lake", "conservation"],
  politics: ["politic", "government", "election", "vote", "president", "democracy", "law", "policy", "parliament", "leader", "campaign", "debate", "reform", "rights", "justice", "congress", "minister"],
  science: ["science", "research", "experiment", "physics", "chemistry", "biology", "space", "nasa", "atom", "molecule", "gene", "lab", "theory", "discover", "quantum", "evolution", "dna", "neuroscience", "medical"],
  crypto: ["crypto", "bitcoin", "ethereum", "blockchain", "nft", "web3", "defi", "token", "wallet", "mining", "altcoin", "binance", "decentralized", "smart contract", "solana", "metaverse", "hodl", "bull", "bear market"],
};

// ─── Seen-item tracking ───────────────────────────────────────────────────────
// Posts/videos are stored with a timestamp. Entries expire after 7 days so the
// feed gradually re-surfaces evergreen content without showing the same thing
// every session. Pruning happens on every write to keep storage small.

async function _readSeenMap(key: string): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

async function _writeSeenMap(key: string, map: Record<string, number>): Promise<void> {
  try {
    const now = Date.now();
    const pruned: Record<string, number> = {};
    for (const [id, ts] of Object.entries(map)) {
      if (now - ts < SEEN_EXPIRY_MS) pruned[id] = ts;
    }
    await AsyncStorage.setItem(key, JSON.stringify(pruned));
  } catch {}
}

export async function getSeenPostIds(): Promise<Set<string>> {
  const map = await _readSeenMap(SEEN_FEED_POSTS_KEY);
  const now = Date.now();
  return new Set(Object.entries(map).filter(([, ts]) => now - ts < SEEN_EXPIRY_MS).map(([id]) => id));
}

export async function markPostsSeen(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const map = await _readSeenMap(SEEN_FEED_POSTS_KEY);
  const now = Date.now();
  for (const id of ids) map[id] = now;
  await _writeSeenMap(SEEN_FEED_POSTS_KEY, map);
}

export async function getSeenVideoIds(): Promise<Set<string>> {
  const map = await _readSeenMap(SEEN_VIDEO_IDS_KEY);
  const now = Date.now();
  return new Set(Object.entries(map).filter(([, ts]) => now - ts < SEEN_EXPIRY_MS).map(([id]) => id));
}

export async function markVideosSeen(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const map = await _readSeenMap(SEEN_VIDEO_IDS_KEY);
  const now = Date.now();
  for (const id of ids) map[id] = now;
  await _writeSeenMap(SEEN_VIDEO_IDS_KEY, map);
}

// ─── Interest matching ────────────────────────────────────────────────────────

export function matchInterests(content: string, userInterests: string[]): number {
  if (!content || !userInterests || userInterests.length === 0) return 0;
  const lower = content.toLowerCase();
  let totalMatches = 0;
  for (const interest of userInterests) {
    const keywords = INTEREST_KEYWORDS[interest];
    if (!keywords) continue;
    for (const kw of keywords) {
      if (lower.includes(kw)) { totalMatches++; break; }
    }
  }
  return totalMatches;
}

export function matchInterestsWeighted(
  content: string,
  userInterests: string[],
  learnedWeights: Record<string, number>,
): number {
  if (!content) return 0;
  const lower = content.toLowerCase();
  let totalScore = 0;

  for (const interest of (userInterests || [])) {
    const keywords = INTEREST_KEYWORDS[interest];
    if (!keywords) continue;
    if (keywords.some((kw) => lower.includes(kw))) {
      const boost = (learnedWeights[interest] || 0) / 20;
      totalScore += 1 + boost;
    }
  }
  for (const [category, weight] of Object.entries(learnedWeights)) {
    if ((userInterests || []).includes(category)) continue;
    const keywords = INTEREST_KEYWORDS[category];
    if (!keywords || weight < 5) continue;
    if (keywords.some((kw) => lower.includes(kw))) {
      totalScore += weight / 30;
    }
  }
  return totalScore;
}

// ─── Feed scoring ─────────────────────────────────────────────────────────────

export type FeedSignals = {
  likeCount: number;
  replyCount: number;
  viewCount: number;
  createdAt: string;
  interestMatches: number;
  isFollowing: boolean;
  authorInteractionCount: number;
  isVerified: boolean;
  isOrgVerified: boolean;
  hasImages: boolean;
  sameCountry: boolean;
  authorPostCountInFeed: number;
  contentLength: number;
  postType?: string;
  isSeen?: boolean;
};

export function computeFeedScore(signals: FeedSignals): number {
  const ageHours = (Date.now() - new Date(signals.createdAt).getTime()) / 3600000;

  // ── Freshness: tiered decay curve ─────────────────────────────────────────
  const freshnessScore =
    ageHours < 1 ? 45
    : ageHours < 3 ? 40
    : ageHours < 6 ? 35
    : ageHours < 12 ? 28
    : ageHours < 24 ? 22
    : ageHours < 48 ? 15
    : ageHours < 72 ? 10
    : ageHours < 168 ? 5
    : 2;

  // ── Viral velocity: engagement per hour with sqrt dampening ───────────────
  const velocityWindow = Math.max(ageHours, 0.5);
  const rawVelocity = (signals.likeCount + signals.replyCount * 2.5) / velocityWindow;
  // sqrt dampening so viral posts don't completely drown everything else
  const trendingScore = Math.min(Math.sqrt(rawVelocity) * 12, 35);

  // ── Burst signal: brand-new post gaining traction fast ────────────────────
  const burstScore = ageHours < 3 && signals.likeCount >= 5 ? 10 : 0;

  // ── Absolute engagement (log scale to prevent outlier dominance) ──────────
  const rawEngagement = signals.likeCount * 1.5 + signals.replyCount * 3 + Math.min(signals.viewCount, 200) * 0.04;
  const engagementScore = Math.min(rawEngagement > 0 ? Math.log1p(rawEngagement) * 6 : 0, 22);

  // ── Interest alignment ────────────────────────────────────────────────────
  const interestScore = signals.interestMatches * 13;

  // ── Social affinity ───────────────────────────────────────────────────────
  let affinityScore = 0;
  if (signals.isFollowing) affinityScore += 20;
  if (signals.authorInteractionCount >= 5) affinityScore += 14;
  else if (signals.authorInteractionCount >= 2) affinityScore += 8;
  else if (signals.authorInteractionCount >= 1) affinityScore += 4;

  // ── Quality signals ───────────────────────────────────────────────────────
  const qualityScore =
    (signals.isOrgVerified ? 6 : 0) +
    (signals.isVerified ? 4 : 0) +
    (signals.hasImages ? 5 : 0) +
    (signals.sameCountry ? 4 : 0) +
    (signals.contentLength > 50 ? 2 : 0) +
    (signals.contentLength > 150 ? 3 : 0) +
    (signals.postType === "video" ? 4 : 0) +
    (signals.postType === "article" ? 2 : 0);

  // ── Diversity penalty: cap same author in one batch ───────────────────────
  const diversityPenalty = signals.authorPostCountInFeed > 2
    ? -(signals.authorPostCountInFeed - 2) * 10
    : 0;

  // ── Already seen: strong demotion (not exclusion — keeps feed from going empty) ──
  const seenPenalty = signals.isSeen ? -45 : 0;

  // ── Random jitter: large enough to surface unexpected gems ───────────────
  // 0–15 pts (was 0–5). This is the key lever for variety between sessions.
  const randomJitter = Math.random() * 15;

  return (
    freshnessScore + trendingScore + burstScore + engagementScore +
    interestScore + affinityScore + qualityScore +
    diversityPenalty + seenPenalty + randomJitter
  );
}

// ─── Interaction learning ─────────────────────────────────────────────────────

export async function recordInteraction(
  content: string,
  action: "like" | "bookmark" | "reply" | "view",
): Promise<void> {
  try {
    const multiplier = action === "reply" ? 5 : action === "bookmark" ? 4 : action === "like" ? 3 : 0.4;
    const raw = await AsyncStorage.getItem(INTERACTION_WEIGHTS_KEY);
    const weights: Record<string, number> = raw ? JSON.parse(raw) : {};
    const lower = (content || "").toLowerCase();
    for (const [category, keywords] of Object.entries(INTEREST_KEYWORDS)) {
      if (keywords.some((kw) => lower.includes(kw))) {
        weights[category] = Math.min(MAX_WEIGHT, ((weights[category] || 0) * DECAY_FACTOR) + multiplier);
      }
    }
    await AsyncStorage.setItem(INTERACTION_WEIGHTS_KEY, JSON.stringify(weights));
  } catch {}
}

export async function getLearnedInterestBoosts(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(INTERACTION_WEIGHTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

// ─── Feed diversification ─────────────────────────────────────────────────────
// Algorithm:
//  1. Sort by score descending.
//  2. Walk through and reject a post if the same author appeared in the last
//     3 slots OR the same post type appeared 3 times in a row.
//  3. Deferred posts are re-inserted at the earliest safe position.
//  4. Unsatisfied deferred posts are appended to the tail.

export function diversifyFeed<T extends { id: string; author_id: string; score: number; postType?: string }>(
  posts: T[],
): T[] {
  const sorted = [...posts].sort((a, b) => b.score - a.score);
  const result: T[] = [];
  const deferred: T[] = [];

  for (const post of sorted) {
    const tail = result.slice(-3);
    const sameAuthorRecently = tail.some((p) => p.author_id === post.author_id);
    const typeRunLength = result.length >= 3
      ? result.slice(-3).filter((p) => p.postType === post.postType && post.postType).length
      : 0;

    if (sameAuthorRecently || typeRunLength >= 3) {
      deferred.push(post);
    } else {
      result.push(post);
    }
  }

  for (const post of deferred) {
    let inserted = false;
    // Try to insert from position 3 onward (never at top)
    for (let i = Math.min(result.length, 3); i <= result.length; i++) {
      const tail = result.slice(Math.max(0, i - 3), i);
      const sameAuthor = tail.some((p) => p.author_id === post.author_id);
      const typeRun = tail.filter((p) => p.postType === post.postType && post.postType).length;
      if (!sameAuthor && typeRun < 3) {
        result.splice(i, 0, post);
        inserted = true;
        break;
      }
    }
    if (!inserted) result.push(post);
  }

  return result;
}

// ─── Weighted random sampling ─────────────────────────────────────────────────
// Picks N items from a list with probability proportional to their score.
// This gives top-scored content an advantage without making the feed
// deterministic — lower-scored items can still win slots, which is what
// makes every refresh feel genuinely different.

export function weightedSample<T extends { score: number }>(items: T[], n: number): T[] {
  if (items.length <= n) return [...items];
  const pool = [...items];
  const selected: T[] = [];

  while (selected.length < n && pool.length > 0) {
    const minScore = Math.min(...pool.map((p) => p.score));
    const shift = minScore < 0 ? -minScore + 1 : 0;
    const totalWeight = pool.reduce((s, p) => s + p.score + shift, 0);
    let r = Math.random() * totalWeight;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].score + shift;
      if (r <= 0) { idx = i; break; }
    }
    selected.push(pool[idx]);
    pool.splice(idx, 1);
  }

  return selected;
}

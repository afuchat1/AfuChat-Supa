import AsyncStorage from "@react-native-async-storage/async-storage";

const INTERACTION_WEIGHTS_KEY     = "feed_interaction_weights_v1";
const SEEN_FEED_POSTS_KEY         = "seen_feed_post_ids_v2";
const SEEN_VIDEO_IDS_KEY          = "seen_video_ids_v2";
const NOT_INTERESTED_AUTHORS_KEY  = "not_interested_authors_v1";
const NOT_INTERESTED_TOPICS_KEY   = "not_interested_topics_v1";
const DECAY_FACTOR   = 0.97;
const MAX_WEIGHT     = 120;
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

/** Returns a map of videoId → epoch-ms timestamp of when it was last seen.
 *  Used for tiered seen-penalty scoring (recently watched gets bigger demotion). */
export async function getSeenVideoMap(): Promise<Map<string, number>> {
  const map = await _readSeenMap(SEEN_VIDEO_IDS_KEY);
  return new Map(Object.entries(map));
}

export async function markVideosSeen(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const map = await _readSeenMap(SEEN_VIDEO_IDS_KEY);
  const now = Date.now();
  for (const id of ids) map[id] = now;
  await _writeSeenMap(SEEN_VIDEO_IDS_KEY, map);
}

// ─── Not-Interested signals (permanent — no expiry) ──────────────────────────
// Explicitly dismissed content tanks to the bottom of the feed.
// Signals are stored indefinitely; the user can undo within the toast window,
// or reset everything via Settings › Preferences › Reset Feed.

async function _readStringSet(key: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set<string>();
  } catch { return new Set<string>(); }
}

async function _writeStringSet(key: string, set: Set<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify([...set]));
  } catch {}
}

export async function getNotInterestedSignals(): Promise<{
  authorIds: Set<string>;
  topics: Set<string>;
}> {
  const [authorIds, topics] = await Promise.all([
    _readStringSet(NOT_INTERESTED_AUTHORS_KEY),
    _readStringSet(NOT_INTERESTED_TOPICS_KEY),
  ]);
  return { authorIds, topics };
}

/** Returns which interest categories are present in the content string. */
export function detectTopicsInContent(content: string): string[] {
  const lower = (content || "").toLowerCase();
  return Object.entries(INTEREST_KEYWORDS)
    .filter(([, kws]) => kws.some((kw) => lower.includes(kw)))
    .map(([cat]) => cat);
}

/**
 * Persistently marks an author + their content categories as not-interesting.
 * Returns `{ authorId, topics }` so the caller can pass to `undoNotInterested`.
 */
export async function markNotInterested(
  authorId: string,
  content: string,
): Promise<{ authorId: string; topics: string[] }> {
  const detectedTopics = detectTopicsInContent(content);
  const [authorIds, topicSet] = await Promise.all([
    _readStringSet(NOT_INTERESTED_AUTHORS_KEY),
    _readStringSet(NOT_INTERESTED_TOPICS_KEY),
  ]);
  authorIds.add(authorId);
  detectedTopics.forEach((t) => topicSet.add(t));
  await Promise.all([
    _writeStringSet(NOT_INTERESTED_AUTHORS_KEY, authorIds),
    _writeStringSet(NOT_INTERESTED_TOPICS_KEY, topicSet),
  ]);
  return { authorId, topics: detectedTopics };
}

/**
 * Reverses a `markNotInterested` call.
 * Pass the exact return value from `markNotInterested` to undo cleanly.
 */
export async function undoNotInterested(
  authorId: string,
  topics: string[],
): Promise<void> {
  const [authorIds, topicSet] = await Promise.all([
    _readStringSet(NOT_INTERESTED_AUTHORS_KEY),
    _readStringSet(NOT_INTERESTED_TOPICS_KEY),
  ]);
  authorIds.delete(authorId);
  topics.forEach((t) => topicSet.delete(t));
  await Promise.all([
    _writeStringSet(NOT_INTERESTED_AUTHORS_KEY, authorIds),
    _writeStringSet(NOT_INTERESTED_TOPICS_KEY, topicSet),
  ]);
}

/** Removes a single author from the not-interested list. */
export async function removeNotInterestedAuthor(authorId: string): Promise<void> {
  const set = await _readStringSet(NOT_INTERESTED_AUTHORS_KEY);
  set.delete(authorId);
  await _writeStringSet(NOT_INTERESTED_AUTHORS_KEY, set);
}

/** Removes a single topic from the not-interested list. */
export async function removeNotInterestedTopic(topic: string): Promise<void> {
  const set = await _readStringSet(NOT_INTERESTED_TOPICS_KEY);
  set.delete(topic);
  await _writeStringSet(NOT_INTERESTED_TOPICS_KEY, set);
}

/** Wipes all not-interested signals — used by Settings › Reset Feed. */
export async function resetNotInterestedSignals(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(NOT_INTERESTED_AUTHORS_KEY),
    AsyncStorage.removeItem(NOT_INTERESTED_TOPICS_KEY),
  ]);
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
  seenAt?: number;                  // unix timestamp when last seen — enables tiered decay penalty
  engagementRate?: number;          // likeCount / max(viewCount, 1) — high ratio = high quality
  hashtagCount?: number;            // #hashtag count in content — signals curated/discoverable content
  completionProxy?: number;         // avg watch depth proxy: likeCount / max(viewCount, 0.5) capped 0–1
  notInterestedAuthorId?: boolean;  // true if user explicitly said "not interested" in this author
  notInterestedTopicCount?: number; // how many of this post's topics match a not-interested category
};

// ─── Hashtag extractor ────────────────────────────────────────────────────────
export function extractHashtags(content: string): string[] {
  if (!content) return [];
  return (content.match(/#[\w\u0080-\uFFFF]+/g) || []).map((t) => t.slice(1).toLowerCase());
}

export function computeFeedScore(signals: FeedSignals): number {
  const ageHours = (Date.now() - new Date(signals.createdAt).getTime()) / 3600000;

  // ── Freshness: tiered decay curve ─────────────────────────────────────────
  // Older videos still score via engagement/interest — not zero — so viral
  // evergreen content can surface even after days/weeks.
  const freshnessScore =
    ageHours < 1 ? 45
    : ageHours < 3 ? 40
    : ageHours < 6 ? 35
    : ageHours < 12 ? 28
    : ageHours < 24 ? 22
    : ageHours < 48 ? 15
    : ageHours < 72 ? 10
    : ageHours < 168 ? 6
    : ageHours < 336 ? 3
    : 1;

  // ── Viral velocity: engagement per hour with sqrt dampening ───────────────
  const velocityWindow = Math.max(ageHours, 0.5);
  const rawVelocity = (signals.likeCount + signals.replyCount * 2.5) / velocityWindow;
  const trendingScore = Math.min(Math.sqrt(rawVelocity) * 12, 35);

  // ── Burst signal: brand-new post gaining traction fast ────────────────────
  const burstScore = ageHours < 3 && signals.likeCount >= 5 ? 10 : 0;

  // ── Absolute engagement (log scale to prevent outlier dominance) ──────────
  const rawEngagement = signals.likeCount * 1.5 + signals.replyCount * 3 + Math.min(signals.viewCount, 200) * 0.04;
  const engagementScore = Math.min(rawEngagement > 0 ? Math.log1p(rawEngagement) * 6 : 0, 22);

  // ── Engagement rate: likes per view — indicates retained-audience quality ─
  // A video with 10 likes / 12 views scores higher than 10 likes / 10 000 views.
  const engagementRateScore = signals.engagementRate != null
    ? Math.min(signals.engagementRate * 90, 20)
    : 0;

  // ── Completion proxy: like-to-view ratio bounded 0–1 ─────────────────────
  // High completion → content compelling enough to watch to the end.
  const completionScore = signals.completionProxy != null
    ? Math.min(signals.completionProxy * 16, 14)
    : 0;

  // ── Hashtag quality: curated / discoverable content ──────────────────────
  const hashtagScore = signals.hashtagCount
    ? Math.min(signals.hashtagCount * 1.8, 7)
    : 0;

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

  // ── Seen-video: tiered time-decay demotion ────────────────────────────────
  // Videos watched very recently are heavily demoted so the feed feels fresh.
  // Videos watched days ago come back naturally — no permanent burial.
  let seenPenalty = 0;
  if (signals.seenAt != null) {
    const hoursSinceSeen = (Date.now() - signals.seenAt) / 3600000;
    if (hoursSinceSeen < 1)   seenPenalty = -65;  // just watched — skip it
    else if (hoursSinceSeen < 6)   seenPenalty = -50;  // watched today — strong demotion
    else if (hoursSinceSeen < 24)  seenPenalty = -35;  // watched today — moderate
    else if (hoursSinceSeen < 72)  seenPenalty = -18;  // watched this week — light
    else if (hoursSinceSeen < 168) seenPenalty = -6;   // watched recently — very light
    // > 7 days: penalty = 0 — resurfaces as fresh content
  } else if (signals.isSeen) {
    seenPenalty = -35; // fallback for callers using old boolean API
  }

  // ── Not-Interested: explicit user feedback — permanent strong demotion ───
  // Author penalty is severe enough that the post will almost never surface,
  // but avoids −∞ so the scoring pipeline never breaks on tiny catalogues.
  // Topic penalty compounds per-category so niche interests are respected.
  const notInterestedPenalty =
    (signals.notInterestedAuthorId ? -150 : 0) +
    ((signals.notInterestedTopicCount ?? 0) * -40);

  // ── Random jitter: large enough to surface unexpected gems ───────────────
  const randomJitter = Math.random() * 15;

  return (
    freshnessScore + trendingScore + burstScore + engagementScore +
    engagementRateScore + completionScore + hashtagScore +
    interestScore + affinityScore + qualityScore +
    diversityPenalty + seenPenalty + notInterestedPenalty + randomJitter
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

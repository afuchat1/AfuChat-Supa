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

export function matchInterests(content: string, userInterests: string[]): number {
  if (!content || !userInterests || userInterests.length === 0) return 0;
  const lower = content.toLowerCase();
  let totalMatches = 0;
  for (const interest of userInterests) {
    const keywords = INTEREST_KEYWORDS[interest];
    if (!keywords) continue;
    let matched = false;
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        matched = true;
        totalMatches++;
        break;
      }
    }
  }
  return totalMatches;
}

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
};

export function computeFeedScore(signals: FeedSignals): number {
  const ageHours = (Date.now() - new Date(signals.createdAt).getTime()) / 3600000;

  const freshnessScore = ageHours < 1 ? 40
    : ageHours < 4 ? 35
    : ageHours < 12 ? 28
    : ageHours < 24 ? 22
    : ageHours < 48 ? 15
    : ageHours < 72 ? 10
    : ageHours < 168 ? 5
    : 2;

  const velocityWindow = Math.max(ageHours, 0.5);
  const engagementPerHour = (signals.likeCount + signals.replyCount * 2) / velocityWindow;
  const trendingScore = Math.min(engagementPerHour * 8, 30);

  const rawEngagement = signals.likeCount * 1.5 + signals.replyCount * 3 + Math.min(signals.viewCount, 100) * 0.05;
  const engagementScore = Math.min(rawEngagement, 25);

  const interestScore = signals.interestMatches * 12;

  let affinityScore = 0;
  if (signals.isFollowing) affinityScore += 18;
  if (signals.authorInteractionCount >= 5) affinityScore += 12;
  else if (signals.authorInteractionCount >= 2) affinityScore += 7;
  else if (signals.authorInteractionCount >= 1) affinityScore += 3;

  const qualityScore =
    (signals.isOrgVerified ? 5 : 0) +
    (signals.isVerified ? 3 : 0) +
    (signals.hasImages ? 4 : 0) +
    (signals.sameCountry ? 3 : 0) +
    (signals.contentLength > 50 ? 2 : 0) +
    (signals.contentLength > 120 ? 2 : 0);

  const diversityPenalty = signals.authorPostCountInFeed > 2 ? -(signals.authorPostCountInFeed - 2) * 8 : 0;

  const randomJitter = Math.random() * 5;

  return freshnessScore + trendingScore + engagementScore + interestScore + affinityScore + qualityScore + diversityPenalty + randomJitter;
}

export function diversifyFeed(posts: { id: string; author_id: string; score: number }[]): typeof posts {
  const sorted = [...posts].sort((a, b) => b.score - a.score);
  const result: typeof posts = [];
  const deferred: typeof posts = [];

  for (const post of sorted) {
    const lastFive = result.slice(-4).map((p) => p.author_id);
    const authorRecentCount = lastFive.filter((a) => a === post.author_id).length;

    if (authorRecentCount >= 1) {
      deferred.push(post);
    } else {
      result.push(post);
    }
  }

  for (const post of deferred) {
    let inserted = false;
    for (let i = Math.min(result.length, 3); i < result.length; i++) {
      const window = result.slice(Math.max(0, i - 2), i).map((p) => p.author_id);
      if (!window.includes(post.author_id)) {
        result.splice(i, 0, post);
        inserted = true;
        break;
      }
    }
    if (!inserted) result.push(post);
  }

  return result;
}

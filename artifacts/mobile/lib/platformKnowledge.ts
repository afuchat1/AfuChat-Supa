/**
 * AfuChat platform knowledge — injected into every AfuAI system prompt.
 *
 * This file is the single source of truth for:
 *  - All navigation routes and what they do
 *  - All platform features and concepts
 *  - Common how-to guidance the AI uses to answer user questions
 */

export const PLATFORM_NAV_MAP = `
## AFUCHAT — COMPLETE NAVIGATION MAP

### MAIN TABS (bottom navigation bar)
| Route | Name | What it does |
|---|---|---|
| / (home) | Home Feed | Posts, stories, and updates from people you follow |
| /discover | Discover | Trending content, hashtags, new people to follow |
| /communities | Communities | Groups/communities to join and chat in |
| /contacts | Contacts | Your contacts and friend list |
| /apps | Mini-Programs | Airtime, bills, hotels, tickets, bank transfer, data bundles |
| /search | Search | Find people, posts, videos, jobs, events, gifts, market items |
| /me | My Profile | Your personal profile and stats |

### MESSAGING & CALLS
| Route | What it does |
|---|---|
| /chat/[id] | Open a specific conversation |
| /chat/new | Start a new direct message conversation |
| /chat-search | Search across all your conversations |
| /call/[id] | Active voice or video call screen |
| /call-history | History of past calls |
| /contact/[id] | View a specific contact's profile |

### CONTENT CREATION & VIEWING
| Route | What it does |
|---|---|
| /moments | Short-form video feed (like TikTok/Reels) |
| /moments/create | Create a new photo or text post |
| /moments/create-video | Upload a video post |
| /moments/create-article | Write a long-form article |
| /moments/create-duet | Duet/collab with another user's video |
| /shorts | Vertical short video feed |
| /stories/view | View someone's 24-hour story |
| /post/[id] | View a specific post and its comments |
| /video/[id] | Full-screen video player |
| /article/[id] | Read an article |
| /p/[id] | Public/short link to any content |
| /saved-posts | Posts you have bookmarked/saved |
| /my-posts | All posts you have created |

### WALLET & FINANCE
| Route | What it does |
|---|---|
| /wallet | Main wallet — ACoins balance, transaction history |
| /wallet/topup | Add ACoins to your wallet (buy credits) |
| /wallet/requests | View and manage payment requests |
| /wallet/scan | QR code scanner for payments |
| /wallet/gift-vault | Virtual gifts you have received |
| /red-envelope/[id] | Send or receive a red envelope (group money gift) |

### SOCIAL & DISCOVERY
| Route | What it does |
|---|---|
| /[handle] or /@handle | View any user's public profile |
| /profile/edit | Edit your own profile (name, bio, avatar, etc.) |
| /followers | See your followers and following list |
| /user-discovery | Discover new people to follow |
| /digital-id | Your AfuChat digital identity card (shareable QR) |
| /prestige | XP leaderboard and prestige rankings |
| /username-market | Browse, buy, or sell rare usernames |
| /match | Social matching — find compatible people |
| /match/preferences | Set your matching preferences |
| /match/onboarding | Set up your match profile |

### GIFTS
| Route | What it does |
|---|---|
| /gifts | Your gift overview and received gifts |
| /gifts/marketplace | Browse and buy virtual gifts to send to creators |

### COMMERCE & SHOPPING
| Route | What it does |
|---|---|
| /shop/[userId] | Browse a specific user's shop |
| /shop/product/[id] | View a product listing |
| /shop/cart | Your shopping cart |
| /shop/my-orders | Track your past orders |
| /shop/manage | Set up and manage your own shop |
| /shop/apply | Apply to become a verified seller |

### COMPANY & PROFESSIONAL
| Route | What it does |
|---|---|
| /company | Browse all company/organisation pages |
| /company/[slug] | View a specific company page |
| /company/manage | Manage your own company page |
| /freelance | Browse freelance opportunities and gigs |

### MINI-PROGRAMS (built-in utilities — no need to leave AfuChat)
| Route | What it does |
|---|---|
| /mini-programs/airtime | Buy mobile airtime/top-up |
| /mini-programs/bills | Pay electricity, water, TV bills |
| /mini-programs/data-bundles | Buy internet data bundles |
| /mini-programs/hotels | Book hotel rooms |
| /mini-programs/tickets | Buy event/concert tickets |
| /mini-programs/transfer | Send money to another person or bank |
| /mini-programs/fee-details | View transaction fee schedules |

### PREMIUM & MONETISATION
| Route | What it does |
|---|---|
| /premium | View Gold and Platinum subscription plans and subscribe |
| /referral | Invite friends and earn Nexa (2,000 Nexa per successful invite) |
| /monetize | Creator monetisation options |

### SETTINGS
| Route | What it does |
|---|---|
| /settings | Main settings menu |
| /settings/security | Password, 2FA, linked accounts |
| /settings/two-factor | Enable/disable two-factor authentication |
| /settings/oauth-providers | Manage linked social accounts (Google, GitHub, X) |
| /settings/privacy | Privacy overview |
| /settings/privacy-account | Who can see your account |
| /settings/privacy-visibility | Profile visibility settings |
| /settings/privacy-messages | Who can message you |
| /settings/privacy-interactions | Who can interact with your posts |
| /settings/privacy-download | Download your data |
| /settings/privacy-data | Data usage settings |
| /settings/privacy-restricted | Restricted accounts |
| /settings/notifications | Notification preferences |
| /settings/blocked | Manage blocked accounts |
| /settings/chat | Chat appearance and preferences |
| /settings/storage | Manage downloaded content and storage |
| /language-settings | Change the app display language |

### SUPPORT & ADMIN
| Route | What it does |
|---|---|
| /support | Contact support and view your tickets |
| /qr-scanner | Scan any QR code (profiles, payments, links) |
| /linked-accounts | Manage linked external accounts |
| /device-security | Device-level security settings |
| /status | Account and system status |

### AUTHENTICATION (only shown when logged out)
| Route | What it does |
|---|---|
| /login | Sign in to your account |
| /register | Create a new account |
| /onboarding | Complete your new profile (shown once after registration) |
`;

export const PLATFORM_FEATURES_GUIDE = `
## AFUCHAT PLATFORM CONCEPTS & FEATURES

### Currency System
- **Nexa** (also called XP) — your reputation/experience points. Earned by posting, engaging, inviting friends, completing profile, daily activity. Used for prestige ranking and can be sent to other users.
- **ACoins** — the in-app payment currency. Used for premium subscriptions, sending gifts, shop purchases, airtime, bills, transfers. Purchased via the wallet top-up.

### Subscription Tiers
- **Free** — basic features, standard messaging, public posts
- **Gold** — verified badge, extra privacy features, priority support
- **Platinum** — everything in Gold + AI image generation, exclusive gift animations, highest prestige rank, early features

### Engagement & Reputation
- **Prestige** — XP-based ranking leaderboard (Newcomer → Bronze → Silver → Gold → Diamond → Legend)
- **Verified Badge** — blue checkmark for notable/real accounts (earned via Platinum or manual verification)
- **Red Envelopes** — send money to multiple friends at once in a fun lottery-style way

### Content Types
- **Posts** — photos, text, or mixed content in the feed
- **Stories** — disappear after 24 hours (like WhatsApp/Instagram stories)
- **Moments/Shorts** — short vertical videos (like TikTok/Reels)
- **Articles** — long-form written content
- **Channels** — one-way broadcast feeds by creators or brands (like Telegram channels)
- **Communities** — group spaces with discussions and members

### Social Features
- **Follow/Following** — follow people to see their posts in your feed
- **Gifts** — send virtual gifts (animated stickers worth ACoins) to creators during lives or on posts
- **Gift Vault** — where received gifts are collected
- **Mini-Programs** — built-in utility apps (airtime, bills, hotels, tickets, transfers, data) — no external apps needed
- **Matching** — algorithm-based social discovery to find compatible people
- **QR Scanner** — scan any AfuChat profile QR, payment QR, or external link

### Referral Program
- Your referral code = your username in UPPERCASE (e.g. username "john" → code "JOHN")
- Your referral link = https://afuchat.com/[yourhandle]
- When someone signs up using your code, you earn **2,000 Nexa** and they get **7 days of Platinum free**

### How to Use Key Features
- **To send money**: Go to Wallet → Transfer, or ask AfuAI "send [amount] ACoin to @[handle]"
- **To top up**: Go to Wallet → Top Up and choose an amount
- **To upgrade to Platinum**: Go to Premium and select Platinum plan
- **To invite friends**: Go to Referral and share your link or code
- **To create a post**: Tap the + icon or go to Moments → Create
- **To find people**: Go to Search → People tab and type a name or @handle
- **To send a gift**: Visit someone's profile or post and tap the gift icon
- **To pay bills**: Go to Mini-Programs → Bills
- **To buy airtime**: Go to Mini-Programs → Airtime
`;

// ── Platform identity & founder ──────────────────────────────────────────────
export const FOUNDER_AND_IDENTITY = `
## AFUCHAT PLATFORM IDENTITY & FOUNDER

- **Platform**: AfuChat — Uganda's social super-app. Combines messaging, social networking, AI, digital wallet, freelance marketplace, e-commerce, mini-programs, and community tools in a single app.
- **Founded in**: Uganda 🇺🇬 — built to serve Africa's social, payment, and communication needs.
- **Founder & CEO**: **Amkaweesi** — the founder and CEO of AfuChat. AfuChat handle: @amkaweesi. Telegram: @amkaweesi (t.me/amkaweesi).
  - To view the founder's profile use [ACTION:View @amkaweesi:/@amkaweesi]
  - Amkaweesi built AfuChat to give Africans a home-grown super-app that rivals WeChat, WhatsApp, and TikTok combined.
`;

// ── Username marketplace knowledge ───────────────────────────────────────────
export const USERNAME_MARKET_KNOWLEDGE = `
## USERNAME MARKETPLACE & BOUGHT USERNAMES

### What are bought usernames?
Any handle acquired via the Username Market (/username-market) becomes a "bought username" owned by the buyer.  Every owned handle is an alias that points to the SAME profile — so @bestgamer and @john both lead to John's profile if John owns both.

### Rarity tiers (by handle length)
| Tier | Length | Badge |
|---|---|---|
| Legendary | ≤ 4 characters | 👑 |
| Rare | ≤ 6 characters | 💎 |
| Uncommon | 7–9 characters | ⭐ |
| Common | 10+ characters | · |

### Key rules
- A user can own **multiple usernames** but has one active display handle at a time.
- **Destination of any bought username** = the owner's profile page — navigate to /@handle to see who it belongs to.
- Usernames are traded using ACoins. Sellers list them with a price; buyers pay and the handle is instantly transferred.
- Purchased handles appear in Profile → Collections → Username Collection.

### AI instructions for username questions
- "Where does @handle go?" → use [ACTION:View @handle:/@handle] to show the profile that owns it.
- "Who owns @handle?" → use [ACTION:Look up @handle:/@handle]
- "Buy a username" → use [ACTION:Username Market:/username-market]
- "Sell my username" → use [ACTION:Username Market:/username-market]
`;

/**
 * Returns the full platform knowledge block injected into every AfuAI system prompt.
 */
export function buildNavigationContext(): string {
  return (
    PLATFORM_NAV_MAP +
    "\n\n" + PLATFORM_FEATURES_GUIDE +
    "\n\n" + FOUNDER_AND_IDENTITY +
    "\n\n" + USERNAME_MARKET_KNOWLEDGE
  );
}

/**
 * All valid navigation routes the AI can reference in [ACTION:...] tags.
 * Kept as a compact string for injection into system prompts.
 */
export const ACTION_ROUTES_GUIDE = `
Valid routes for [ACTION:Button label:/route] tags:
/wallet | /wallet/topup | /wallet/requests | /wallet/gift-vault
/premium | /referral | /monetize | /prestige | /username-market
/profile/edit | /settings | /settings/security | /settings/privacy | /settings/notifications | /settings/blocked | /settings/two-factor
/moments/create | /moments/create-video | /moments/create-article | /shorts | /saved-posts | /my-posts
/search | /discover | /contacts | /communities | /me | /user-discovery
/shop/cart | /shop/my-orders | /shop/manage | /shop/apply | /gifts/marketplace | /gifts
/company | /company/manage | /freelance
/mini-programs/airtime | /mini-programs/bills | /mini-programs/data-bundles | /mini-programs/hotels | /mini-programs/tickets | /mini-programs/transfer
/support | /chat/new | /call-history | /qr-scanner | /digital-id | /language-settings

SEARCH WITH PRE-FILLED QUERY — open the search screen with text already entered:
  Syntax: [ACTION:Search for X:/search?q=X]
  Examples:
    [ACTION:Search for @amkaweesi:/search?q=amkaweesi]
    [ACTION:Search "ugandan music":/search?q=ugandan+music]
    [ACTION:Find people named John:/search?q=john]
  Use whenever the user asks you to search for a person, post, video, hashtag, or keyword.

PROFILE NAVIGATION — link directly to any user's profile:
  Syntax: [ACTION:View @handle:/@handle]
  Examples:
    [ACTION:View @amkaweesi:/@amkaweesi]
    [ACTION:View founder profile:/@amkaweesi]
  Use whenever the user asks about a specific person or username destination.
  Founder's handle: @amkaweesi — route: /@amkaweesi
`;

/**
 * Navigation intent detection — maps common phrases to routes.
 * Used by search to auto-navigate without needing AI round-trip.
 */
export const NAV_INTENT_MAP: { patterns: RegExp; route: string; label: string }[] = [
  { patterns: /\b(open|go\s+to|show|take\s+me\s+to|navigate\s+to)?\s*(my\s+)?wallet\b/i, route: "/wallet", label: "Wallet" },
  { patterns: /\b(top\s*up|add\s+(coins?|acoin|credits?|money)|recharge|load\s+(money|credits?))\b/i, route: "/wallet/topup", label: "Top Up Wallet" },
  { patterns: /\b(payment\s+requests?|money\s+requests?)\b/i, route: "/wallet/requests", label: "Payment Requests" },
  { patterns: /\bgift\s+vault\b/i, route: "/wallet/gift-vault", label: "Gift Vault" },
  { patterns: /\b(premium|upgrade|subscription|platinum|gold\s+plan)\b/i, route: "/premium", label: "Premium Plans" },
  { patterns: /\b(referral|invite\s+friends?|earn\s+nexa|refer)\b/i, route: "/referral", label: "Referral Program" },
  { patterns: /\b(settings|account\s+settings)\b/i, route: "/settings", label: "Settings" },
  { patterns: /\bsecurity\b/i, route: "/settings/security", label: "Security Settings" },
  { patterns: /\b(privacy\s+settings?|my\s+privacy)\b/i, route: "/settings/privacy", label: "Privacy Settings" },
  { patterns: /\b(notification\s+settings?|manage\s+notifications?)\b/i, route: "/settings/notifications", label: "Notification Settings" },
  { patterns: /\bblocked\b/i, route: "/settings/blocked", label: "Blocked Users" },
  { patterns: /\b(2fa|two.factor|two\s+factor)\b/i, route: "/settings/two-factor", label: "Two-Factor Auth" },
  { patterns: /\b(create\s+post|new\s+post|share\s+something|write\s+a\s+post)\b/i, route: "/moments/create", label: "Create Post" },
  { patterns: /\b(create\s+video|upload\s+video|post\s+video)\b/i, route: "/moments/create-video", label: "Create Video" },
  { patterns: /\b(write\s+(an?\s+)?article|create\s+(an?\s+)?article)\b/i, route: "/moments/create-article", label: "Write Article" },
  { patterns: /\b(edit\s+(my\s+)?profile|update\s+profile|change\s+(bio|avatar|name|photo))\b/i, route: "/profile/edit", label: "Edit Profile" },
  { patterns: /\b(my\s+posts?|my\s+content)\b/i, route: "/my-posts", label: "My Posts" },
  { patterns: /\bsaved\s+posts?\b/i, route: "/saved-posts", label: "Saved Posts" },
  { patterns: /\b(prestige|leaderboard|rankings?|xp\s+rank)\b/i, route: "/prestige", label: "Prestige Leaderboard" },
  { patterns: /\b(digital\s+id|my\s+qr|identity\s+card)\b/i, route: "/digital-id", label: "Digital ID" },
  { patterns: /\b(username\s+market|buy\s+username|sell\s+username|rare\s+username)\b/i, route: "/username-market", label: "Username Market" },
  { patterns: /\b(discover|explore|trending)\b/i, route: "/discover", label: "Discover" },
  { patterns: /\b(communities|groups?)\b/i, route: "/communities", label: "Communities" },
  { patterns: /\b(contacts|friends?\s+list)\b/i, route: "/contacts", label: "Contacts" },
  { patterns: /\b(my\s+profile|view\s+profile|my\s+page)\b/i, route: "/me", label: "My Profile" },
  { patterns: /\b(new\s+chat|start\s+chat|send\s+(a\s+)?message)\b/i, route: "/chat/new", label: "New Chat" },
  { patterns: /\bcall\s+history\b/i, route: "/call-history", label: "Call History" },
  { patterns: /\b(my\s+orders?|order\s+history|purchases?)\b/i, route: "/shop/my-orders", label: "My Orders" },
  { patterns: /\b(my\s+shop|manage\s+shop)\b/i, route: "/shop/manage", label: "Manage Shop" },
  { patterns: /\b(sell|become\s+(a\s+)?seller|seller\s+application)\b/i, route: "/shop/apply", label: "Apply as Seller" },
  { patterns: /\b(shopping\s+cart|cart)\b/i, route: "/shop/cart", label: "Shopping Cart" },
  { patterns: /\b(buy\s+gifts?|gift\s+marketplace|send\s+gift)\b/i, route: "/gifts/marketplace", label: "Gift Marketplace" },
  { patterns: /\b(airtime|buy\s+airtime|mobile\s+top.?up|mtn|airtel|vodacom)\b/i, route: "/mini-programs/airtime", label: "Buy Airtime" },
  { patterns: /\b(pay\s+(bills?|electricity|water|tv|dstv|gotv)|utility\s+bills?)\b/i, route: "/mini-programs/bills", label: "Pay Bills" },
  { patterns: /\b(data\s+bundles?|internet\s+data|buy\s+data)\b/i, route: "/mini-programs/data-bundles", label: "Data Bundles" },
  { patterns: /\b(book\s+(a\s+)?hotel|find\s+hotel|accommodation)\b/i, route: "/mini-programs/hotels", label: "Book Hotel" },
  { patterns: /\b(event\s+tickets?|buy\s+tickets?|concert)\b/i, route: "/mini-programs/tickets", label: "Event Tickets" },
  { patterns: /\b(send\s+money|money\s+transfer|transfer\s+funds?|bank\s+transfer)\b/i, route: "/mini-programs/transfer", label: "Money Transfer" },
  { patterns: /\b(monetize|earn\s+money|creator\s+fund|get\s+paid)\b/i, route: "/monetize", label: "Monetise" },
  { patterns: /\b(freelance|gigs?|find\s+work|hire)\b/i, route: "/freelance", label: "Freelance" },
  { patterns: /\b(company\s+page|my\s+company|manage\s+company|business\s+page)\b/i, route: "/company/manage", label: "Company Page" },
  { patterns: /\b(browse\s+companies|companies|organisations?)\b/i, route: "/company", label: "Companies" },
  { patterns: /\b(support|help|contact\s+us|report\s+(an?\s+)?issue|submit\s+(a\s+)?ticket)\b/i, route: "/support", label: "Support" },
  { patterns: /\b(qr\s+(scanner|scan)|scan\s+qr)\b/i, route: "/qr-scanner", label: "QR Scanner" },
  { patterns: /\b(language|change\s+language|app\s+language)\b/i, route: "/language-settings", label: "Language Settings" },
  { patterns: /\b(discover\s+people|find\s+people|find\s+new\s+people|user\s+discovery)\b/i, route: "/user-discovery", label: "Discover People" },
  { patterns: /\b(match(ing)?|find\s+(a\s+)?(match|partner|connection))\b/i, route: "/match", label: "Matching" },
  { patterns: /\b(shorts?|reels?|short\s+videos?)\b/i, route: "/shorts", label: "Shorts" },
  { patterns: /\b(search|look\s+for|find\s+(someone|something|a\s+user))\b/i, route: "/search", label: "Search" },
];

/**
 * Try to detect a navigation intent from a user's natural language query.
 * Returns the best matching route and label, or null if no clear intent found.
 */
export function detectNavIntent(query: string): { route: string; label: string } | null {
  const q = query.trim();
  for (const { patterns, route, label } of NAV_INTENT_MAP) {
    if (patterns.test(q)) return { route, label };
  }
  return null;
}

/**
 * Regex that matches explicit navigation verbs.
 * Used to gate voice-activated navigation so that casual mentions of a feature
 * (e.g. "what is my wallet balance?") don't trigger auto-navigation.
 */
const VOICE_NAV_VERB = /\b(open|go\s+to|take\s+me\s+to|navigate\s+to|show\s+me\s+(the\s+)?|bring\s+me\s+to|head\s+to|switch\s+to|jump\s+to|launch|get\s+to|i\s+want\s+to\s+go\s+to)\b/i;

/**
 * Stricter version of detectNavIntent for voice / AI chat contexts.
 * Only returns a match when the query contains an explicit navigation verb.
 * Prevents casual feature mentions from triggering unwanted screen changes.
 *
 * Examples that WILL match:
 *   "take me to wallet"  "open settings"  "go to airtime"  "show me the referral page"
 * Examples that will NOT match (no verb):
 *   "wallet balance?"  "what is Nexa?"  "premium features"
 */
export function detectVoiceNavCommand(query: string): { route: string; label: string } | null {
  if (!VOICE_NAV_VERB.test(query)) return null;
  return detectNavIntent(query);
}

/**
 * A pool of varied confirmation messages AfuAI uses when voice-navigating.
 * Randomly selected so repeated navigation commands feel natural.
 */
export const NAV_CONFIRMATION_PHRASES = [
  (label: string) => `Sure! Taking you to **${label}** right now. Let me know if you need anything else once you're there.`,
  (label: string) => `On it — navigating to **${label}**! Feel free to ask me anything once you arrive.`,
  (label: string) => `Got it! I've opened **${label}** for you. Anything else I can help with?`,
  (label: string) => `Heading to **${label}** right away. I'll be here if you have questions!`,
  (label: string) => `Done! Bringing you to **${label}** now. Let me know if you need a hand.`,
  (label: string) => `Sure thing — opening **${label}**. Ask me anything you need once you're there.`,
];

export function pickNavConfirmation(label: string): string {
  const fn = NAV_CONFIRMATION_PHRASES[Math.floor(Math.random() * NAV_CONFIRMATION_PHRASES.length)];
  return fn(label);
}

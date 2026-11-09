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
| /apps | Apps | Wallet, marketplace, games, music, events, and other AfuChat tools |
| /search | Search | Find people, posts, videos, jobs, events, gifts, market items |
| /me | My Profile | Your personal profile and stats |

### MESSAGING
| Route | What it does |
|---|---|
| /chat/[id] | Open a specific conversation |
| /chat/new | Start a new direct message conversation |
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
| /app/afusaved | Posts you have bookmarked/saved |
| /my-posts | All posts you have created |

### WALLET & FINANCE
| Route | What it does |
|---|---|
| /app/afupay | Main wallet — ACoins balance, transaction history |
| /app/afupay?section=topup | Add ACoins to your wallet (buy credits) |
| /app/afupay?section=requests | View and manage payment requests |
| /app/afupay?section=send | Send ACoin or Nexa to another user |
| /app/afupay?section=receive | Show your Wallet QR and AfuPay ID |
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
| /app/afuusernames | Browse, buy, or sell rare usernames |
| /app/afumatch | Social matching — find compatible people |
| /app/afumatch?section=preferences | Set your matching preferences |
| /app/afumatch?section=onboarding | Set up your match profile |

### GIFTS
| Route | What it does |
|---|---|
| /app/afugifts | Your gift overview and received gifts |
| /app/afugifts?section=marketplace | Browse and buy virtual gifts to send to creators |

### COMMERCE & SHOPPING
| Route | What it does |
|---|---|
| /app/afumarket?section=storefront&userId=... | Browse a specific user's shop |
| /app/afumarket?section=product&id=... | View a product listing |
| /app/afumarket?section=cart | Your shopping cart |
| /app/afumarket?section=orders | Track your past orders |
| /app/afumarket?section=manage | Set up and manage your own shop |
| /app/afumarket?section=apply | Apply to become a verified seller |

### COMPANY & PROFESSIONAL
| Route | What it does |
|---|---|
| /company | Browse all company/organisation pages |
| /company/[slug] | View a specific company page |
| /company/manage | Manage your own company page |
| /app/afufreelance | Browse freelance opportunities and gigs |

### WALLET SERVICES (built-in utilities — all inside Wallet)
| Route | What it does |
|---|---|
| /app/afupay?section=airtime | Buy mobile airtime/top-up |
| /app/afupay?section=bills | Pay electricity, water, TV bills |
| /app/afupay?section=data-bundles | Buy internet data bundles |
| /app/afupay?section=hotels | Book hotel rooms |
| /app/afupay?section=tickets | Buy event/concert tickets |
| /app/afupay?section=transfer | Send money to another person or bank |
| /app/afupay?section=fee-details | View transaction fee schedules |

### PREMIUM & MONETISATION
| Route | What it does |
|---|---|
| /premium | View Gold and Platinum subscription plans and subscribe |
| /monetize | Creator monetisation options |

### SETTINGS
| Route | What it does |
|---|---|
| /settings | Main settings menu |
| /settings/security | Password, 2FA, linked accounts |
| /settings/two-factor | Enable/disable two-factor authentication |
| /settings/oauth-providers | Manage linked social accounts (GitHub, X) |
| /settings/privacy | Privacy overview |
| /settings/privacy-account | Who can see your account |
| /settings/privacy-visibility | Profile visibility settings |
| /settings/privacy-messages | Who can message you |
| /settings/privacy-interactions | Who can interact with your posts |
| /settings/privacy-download | Download your data |
| /settings/privacy-data | Data usage settings |
| /settings/privacy-restricted | Restricted accounts |
| /settings/blocked | Manage blocked accounts |
| /settings/chat | Chat appearance and preferences |
| /language-settings | Change the app display language |

### SUPPORT & ADMIN
| Route | What it does |
|---|---|
| /support | Contact support and view your tickets |
| /qr-scanner | Scan any QR code (profiles, payments, links) |
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
- **Channels** — one-way broadcast feeds by creators or brands
- **Communities** — group spaces with discussions and members

### Social Features
- **Follow/Following** — follow people to see their posts in your feed
- **Gifts** — send virtual gifts (animated stickers worth ACoins) to creators during lives or on posts
- **Gift Vault** — where received gifts are collected
- **Wallet Services** — built-in airtime, bills, hotels, tickets, transfers, and data tools inside Wallet
- **Matching** — algorithm-based social discovery to find compatible people
- **QR Scanner** — scan any AfuChat profile QR, payment QR, or external link

### How to Use Key Features
- **To send money**: Go to Wallet → Transfer, or ask AfuAI "send [amount] ACoin to @[handle]"
- **To top up**: Go to Wallet → Top Up and choose an amount
- **To upgrade to Platinum**: Go to Premium and select Platinum plan
- **To create a post**: Tap the + icon or go to Moments → Create
- **To find people**: Go to Search → People tab and type a name or @handle
- **To send a gift**: Visit someone's profile or post and tap the gift icon
- **To pay bills**: Open Wallet → Services → Bills & Utilities
- **To buy airtime**: Open Wallet → Services → Airtime
`;

// ── Platform identity & founder ──────────────────────────────────────────────
export const FOUNDER_AND_IDENTITY = `
## AFUCHAT PLATFORM IDENTITY & FOUNDER

- **Platform**: AfuChat — Uganda's social super-app. Combines messaging, social networking, AI, Wallet services, freelance marketplace, e-commerce, and community tools in a single app.
- **Founded in**: Uganda 🇺🇬 — built to serve Africa's social, payment, and communication needs.
- **Founder & CEO**: **Amkaweesi** — the founder and CEO of AfuChat. AfuChat handle: @amkaweesi.
  - To view the founder's profile use [ACTION:View @amkaweesi:/@amkaweesi]
  - Amkaweesi built AfuChat to give Africans a home-grown super-app that rivals WeChat, WhatsApp, and TikTok combined.
`;

// ── Username marketplace knowledge ───────────────────────────────────────────
export const USERNAME_MARKET_KNOWLEDGE = `
## USERNAME MARKETPLACE & BOUGHT USERNAMES

### What are bought usernames?
Any handle acquired via the Username Market (/app/afuusernames) becomes a "bought username" owned by the buyer.  Every owned handle is an alias that points to the SAME profile. For example, @bestgamer and @john both lead to John's profile if John owns both.

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
- "Buy a username" → use [ACTION:Username Market:/app/afuusernames]
- "Sell my username" → use [ACTION:Username Market:/app/afuusernames]
`;

// ── Verification knowledge ───────────────────────────────────────────────────
export const VERIFICATION_KNOWLEDGE = `
## VERIFICATION ON AFUCHAT

### Two types of verified badge

**1. Personal Verification — Blue ✓ Checkmark**
- Appears next to the name of individual users, creators, journalists, and public figures.
- Confirms the account is real and belongs to who it claims to be.
- **How to get it:**
  - **Fastest route:** Upgrade to Gold or Platinum premium plan — the verified badge is included with both tiers.
  - **Manual review route:** Notable accounts (celebrities, activists, public officials, journalists) can apply for free. AfuChat reviews the application and may approve without a premium plan.
- Once granted, the badge stays active as long as your account is in good standing.
- The badge cannot be transferred — even if you sell your username, the badge remains tied to your account, not the handle.

**2. Organisation Verification — Gold ◆ Business Badge + Square Avatar**
- Appears on company, brand, NGO, government body, and educational institution profiles.
- The profile picture is displayed as a **square** (not circular) with a gold outline — visually distinct from personal accounts.
- **How to get it:** Apply via Settings → Business → Apply for Organisation Verification.
- Requirements: official business registration, legitimate email domain, minimum presence/follower threshold.

### What Verification Unlocks
- Higher trust and credibility with other users
- Elevated ranking in search results
- Access to advanced analytics (organisation accounts)
- Unlocks the "Creator" monetisation programme
- Silver subscription badge is shown separately and does not include verification — only Gold+ includes the checkmark

### Email & Phone Verification (Account Security)
- Separate from the social verified badge — this is basic account security.
- **Email verification:** Done at registration (6-digit code to your email). Re-trigger in Settings → Security → Verify Email.
- **Phone verification:** Optional but recommended. It adds 2-step recovery. Settings → Security → Add Phone Number.
- **Two-factor authentication (2FA):** Settings → Security → Two-Factor Authentication. Strongly recommended.

### Common Questions AfuAI handles about Verification
- "How do I get verified?" → Explain Gold/Platinum path for speed, manual review for notable accounts. Add [ACTION:Premium Plans:/premium]
- "Am I verified?" → Check USER CONTEXT — if Premium shows Gold or Platinum, the user has a verified badge.
- "What is the blue checkmark?" → Explained above.
- "Difference between Gold/Platinum badge and Org badge?" → Personal = blue circle ✓ · Organisation = gold square ◆
- "Apply for business/org verification" → [ACTION:Settings:/settings] then navigate to Business section
- "My badge disappeared" → Ask user to check their subscription status — badge requires active Gold/Platinum plan (or manual approval).
`;

/**
 * Returns the full platform knowledge block injected into every AfuAI system prompt.
 */
export function buildNavigationContext(): string {
  return (
    PLATFORM_NAV_MAP +
    "\n\n" + PLATFORM_FEATURES_GUIDE +
    "\n\n" + FOUNDER_AND_IDENTITY +
    "\n\n" + USERNAME_MARKET_KNOWLEDGE +
    "\n\n" + VERIFICATION_KNOWLEDGE
  );
}

/**
 * All valid navigation routes the AI can reference in [ACTION:...] tags.
 * Kept as a compact string for injection into system prompts.
 */
export const ACTION_ROUTES_GUIDE = `
Valid routes for [ACTION:Button label:/route] tags:
/app/afupay | /app/afupay?section=topup | /app/afupay?section=requests | /app/afupay?section=services
/premium | /monetize | /prestige | /app/afuusernames
/profile/edit | /settings | /settings/security | /settings/privacy | /settings/blocked | /settings/two-factor
/moments/create | /moments/create-video | /moments/create-article | /shorts | /app/afusaved | /my-posts
/search | /discover | /contacts | /communities | /me | /user-discovery
/app/afumarket?section=cart | /app/afumarket?section=orders | /app/afumarket?section=manage | /app/afumarket?section=apply
/app/afugifts | /app/afugifts?section=marketplace | /company | /company/manage | /app/afufreelance
/app/afupay?section=airtime | /app/afupay?section=bills | /app/afupay?section=data-bundles | /app/afupay?section=hotels | /app/afupay?section=tickets | /app/afupay?section=transfer | /app/afupay?section=fee-details
/support | /chat/new | /qr-scanner | /digital-id | /language-settings

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
  { patterns: /\b(open|go\s+to|show|take\s+me\s+to|navigate\s+to)?\s*(my\s+)?wallet\b/i, route: "/app/afupay", label: "Wallet" },
  { patterns: /\b(top\s*up|add\s+(coins?|acoin|credits?|money)|recharge|load\s+(money|credits?))\b/i, route: "/app/afupay?section=topup", label: "Top Up Wallet" },
  { patterns: /\b(payment\s+requests?|money\s+requests?)\b/i, route: "/app/afupay?section=requests", label: "Payment Requests" },
  { patterns: /\b(premium|upgrade|subscription|platinum|gold\s+plan)\b/i, route: "/premium", label: "Premium Plans" },
  { patterns: /\b(settings|account\s+settings)\b/i, route: "/settings", label: "Settings" },
  { patterns: /\bsecurity\b/i, route: "/settings/security", label: "Security Settings" },
  { patterns: /\b(privacy\s+settings?|my\s+privacy)\b/i, route: "/settings/privacy", label: "Privacy Settings" },
  { patterns: /\bblocked\b/i, route: "/settings/blocked", label: "Blocked Users" },
  { patterns: /\b(2fa|two.factor|two\s+factor)\b/i, route: "/settings/two-factor", label: "Two-Factor Auth" },
  { patterns: /\b(create\s+post|new\s+post|share\s+something|write\s+a\s+post)\b/i, route: "/moments/create", label: "Create Post" },
  { patterns: /\b(create\s+video|upload\s+video|post\s+video)\b/i, route: "/moments/create-video", label: "Create Video" },
  { patterns: /\b(write\s+(an?\s+)?article|create\s+(an?\s+)?article)\b/i, route: "/moments/create-article", label: "Write Article" },
  { patterns: /\b(edit\s+(my\s+)?profile|update\s+profile|change\s+(bio|avatar|name|photo))\b/i, route: "/profile/edit", label: "Edit Profile" },
  { patterns: /\b(my\s+posts?|my\s+content)\b/i, route: "/my-posts", label: "My Posts" },
  { patterns: /\bsaved\s+posts?\b/i, route: "/app/afusaved", label: "Saved Posts" },
  { patterns: /\b(prestige|leaderboard|rankings?|xp\s+rank)\b/i, route: "/prestige", label: "Prestige Leaderboard" },
  { patterns: /\b(digital\s+id|my\s+qr|identity\s+card)\b/i, route: "/digital-id", label: "Digital ID" },
  { patterns: /\b(username\s+market|buy\s+username|sell\s+username|rare\s+username)\b/i, route: "/app/afuusernames", label: "Username Market" },
  { patterns: /\b(discover|explore|trending)\b/i, route: "/discover", label: "Discover" },
  { patterns: /\b(communities|groups?)\b/i, route: "/communities", label: "Communities" },
  { patterns: /\b(contacts|friends?\s+list)\b/i, route: "/contacts", label: "Contacts" },
  { patterns: /\b(my\s+profile|view\s+profile|my\s+page)\b/i, route: "/me", label: "My Profile" },
  { patterns: /\b(new\s+chat|start\s+chat|send\s+(a\s+)?message)\b/i, route: "/chat/new", label: "New Chat" },
  { patterns: /\b(my\s+orders?|order\s+history|purchases?)\b/i, route: "/app/afumarket?section=orders", label: "My Orders" },
  { patterns: /\b(my\s+shop|manage\s+shop)\b/i, route: "/app/afumarket?section=manage", label: "Manage Shop" },
  { patterns: /\b(sell|become\s+(a\s+)?seller|seller\s+application)\b/i, route: "/app/afumarket?section=apply", label: "Apply as Seller" },
  { patterns: /\b(shopping\s+cart|cart)\b/i, route: "/app/afumarket?section=cart", label: "Shopping Cart" },
  { patterns: /\b(buy\s+gifts?|gift\s+marketplace|send\s+gift)\b/i, route: "/app/afugifts?section=marketplace", label: "Gift Marketplace" },
  { patterns: /\b(airtime|buy\s+airtime|mobile\s+top.?up|mtn|airtel|vodacom)\b/i, route: "/app/afupay?section=airtime", label: "Buy Airtime" },
  { patterns: /\b(pay\s+(bills?|electricity|water|tv|dstv|gotv)|utility\s+bills?)\b/i, route: "/app/afupay?section=bills", label: "Pay Bills" },
  { patterns: /\b(data\s+bundles?|internet\s+data|buy\s+data)\b/i, route: "/app/afupay?section=data-bundles", label: "Data Bundles" },
  { patterns: /\b(book\s+(a\s+)?hotel|find\s+hotel|accommodation)\b/i, route: "/app/afupay?section=hotels", label: "Book Hotel" },
  { patterns: /\b(event\s+tickets?|buy\s+tickets?|concert)\b/i, route: "/app/afupay?section=tickets", label: "Event Tickets" },
  { patterns: /\b(send\s+money|money\s+transfer|transfer\s+funds?|bank\s+transfer)\b/i, route: "/app/afupay?section=transfer", label: "Money Transfer" },
  { patterns: /\b(monetize|earn\s+money|creator\s+fund|get\s+paid)\b/i, route: "/monetize", label: "Monetise" },
  { patterns: /\b(freelance|gigs?|find\s+work|hire)\b/i, route: "/app/afufreelance", label: "Freelance" },
  { patterns: /\b(company\s+page|my\s+company|manage\s+company|business\s+page)\b/i, route: "/company/manage", label: "Company Page" },
  { patterns: /\b(browse\s+companies|companies|organisations?)\b/i, route: "/company", label: "Companies" },
  { patterns: /\b(support|help|contact\s+us|report\s+(an?\s+)?issue|submit\s+(a\s+)?ticket)\b/i, route: "/support", label: "Support" },
  { patterns: /\b(qr\s+(scanner|scan)|scan\s+qr)\b/i, route: "/qr-scanner", label: "QR Scanner" },
  { patterns: /\b(language|change\s+language|app\s+language)\b/i, route: "/language-settings", label: "Language Settings" },
  { patterns: /\b(discover\s+people|find\s+people|find\s+new\s+people|user\s+discovery)\b/i, route: "/user-discovery", label: "Discover People" },
  { patterns: /\b(match(ing)?|find\s+(a\s+)?(match|partner|connection))\b/i, route: "/app/afumatch", label: "Matching" },
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
 *   "take me to wallet"  "open settings"  "go to airtime"
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
  (label: string) => `On it. Navigating to **${label}**! Feel free to ask me anything once you arrive.`,
  (label: string) => `Got it! I've opened **${label}** for you. Anything else I can help with?`,
  (label: string) => `Heading to **${label}** right away. I'll be here if you have questions!`,
  (label: string) => `Done! Bringing you to **${label}** now. Let me know if you need a hand.`,
  (label: string) => `Sure thing. Opening **${label}**. Ask me anything you need once you're there.`,
];

export function pickNavConfirmation(label: string): string {
  const fn = NAV_CONFIRMATION_PHRASES[Math.floor(Math.random() * NAV_CONFIRMATION_PHRASES.length)];
  return fn(label);
}

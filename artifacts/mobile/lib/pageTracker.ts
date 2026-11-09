/**
 * PageTracker — module-level store for the current Expo Router pathname.
 *
 * Mini apps are always-mounted components (kept in the React tree even when
 * minimised), so they can't use usePathname() to track the main-app route.
 * Instead, a PageWatcher component (in _layout.tsx) writes here on every
 * navigation, and any mini app can call getCurrentPage() at any time.
 */

export type PageInfo = {
  pathname: string;
  name: string;
  summary: string;
  actions?: string[];
};

let _current: PageInfo = {
  pathname: "/",
  name: "Home Feed",
  summary: "The AfuChat home feed showing posts, stories, and updates from people you follow.",
};

export function setCurrentPage(info: PageInfo): void {
  _current = info;
}

export function getCurrentPage(): PageInfo {
  return _current;
}

// ── Route → PageInfo table ────────────────────────────────────────────────────
// Entries are tested in order — more specific patterns must come first.

const ROUTE_MAP: Array<{ match: RegExp; name: string; summary: string }> = [
  // Messaging
  { match: /^\/chat\/new/, name: "New Chat", summary: "Start a new direct message conversation." },
  { match: /^\/chat\//, name: "Chat", summary: "A direct message conversation." },
  { match: /^\/contact\//, name: "User Profile", summary: "A user's AfuChat profile page." },

  // Content creation
  { match: /^\/moments\/create-video/, name: "Create Video", summary: "Upload and publish a new video post." },
  { match: /^\/moments\/create-article/, name: "Write Article", summary: "Write and publish a long-form article." },
  { match: /^\/moments\/create-duet/, name: "Create Duet", summary: "Create a duet/collab with another user's video." },
  { match: /^\/moments\/create/, name: "Create Post", summary: "Create and publish a new post — photo, text, or mixed content." },
  { match: /^\/moments/, name: "Moments", summary: "Browse short-form videos and posts in the Moments feed." },
  { match: /^\/shorts/, name: "Shorts", summary: "Browse vertical short videos (like TikTok/Reels)." },
  { match: /^\/stories/, name: "Stories", summary: "View 24-hour disappearing stories from people you follow." },
  { match: /^\/post\//, name: "Post", summary: "A specific post and its comments." },
  { match: /^\/video\//, name: "Video", summary: "Full-screen video player." },
  { match: /^\/article\//, name: "Article", summary: "A long-form article." },
  { match: /^\/app\/afusaved/, name: "Saved Posts", summary: "Posts you've bookmarked and saved for later." },
  { match: /^\/my-posts/, name: "My Posts", summary: "All posts you've published." },

  // Wallet
  { match: /^\/app\/afupay\?section=topup/, name: "Top Up Wallet", summary: "Add ACoins to your wallet by purchasing credits." },
  { match: /^\/app\/afupay\?section=requests/, name: "Payment Requests", summary: "View and manage incoming payment requests." },
  { match: /^\/wallet\/scan/, name: "QR Payment", summary: "Scan a QR code to make a payment." },
  { match: /^\/app\/afupay/, name: "Wallet", summary: "Your AfuChat wallet — ACoins balance, transaction history, top-up, and payment options." },
  { match: /^\/red-envelope\//, name: "Red Envelope", summary: "Send or receive a red envelope — a fun group money gift." },

  // Social / Profile
  { match: /^\/profile\/edit/, name: "Edit Profile", summary: "Edit your profile — name, bio, avatar, and other details." },
  { match: /^\/followers/, name: "Followers & Following", summary: "See who follows you and who you follow." },
  { match: /^\/user-discovery/, name: "Discover People", summary: "Discover new people to follow based on interests and connections." },
  { match: /^\/digital-id/, name: "Digital ID", summary: "Your AfuChat digital identity card — a shareable QR code for your profile." },
  { match: /^\/prestige/, name: "Prestige Leaderboard", summary: "The XP-based prestige rankings: Newcomer → Bronze → Silver → Gold → Diamond → Legend." },
  { match: /^\/app\/afuusernames/, name: "Username Market", summary: "Browse, buy, or sell rare AfuChat usernames using ACoins." },
  { match: /^\/match\/preferences/, name: "Match Preferences", summary: "Set your social matching preferences." },
  { match: /^\/match/, name: "Matching", summary: "AfuChat's social discovery feature — find compatible people." },
  { match: /^\/achievements/, name: "Achievements", summary: "Your AfuChat achievements and badges." },

  // Gifts
  { match: /^\/gifts\/marketplace/, name: "Gift Marketplace", summary: "Browse and buy virtual gifts to send to creators." },
  { match: /^\/gifts/, name: "Gifts", summary: "Your gifts overview and the gifts you've received." },

  // Commerce & Shop
  { match: /^\/shop\/product\//, name: "Product", summary: "A product listing — you can view details and add it to your cart." },
  { match: /^\/shop\/cart/, name: "Shopping Cart", summary: "Your shopping cart — review items before checkout." },
  { match: /^\/shop\/my-orders/, name: "My Orders", summary: "Your past orders and their current status." },
  { match: /^\/shop\/manage/, name: "Manage Shop", summary: "Set up and manage your AfuChat shop." },
  { match: /^\/shop\/apply/, name: "Seller Application", summary: "Apply to become a verified seller on AfuChat." },
  { match: /^\/shop\//, name: "Shop", summary: "A user's AfuChat shop — browse their products." },

  // Freelance
  { match: /^\/freelance\/[^/]+/, name: "Freelance Listing", summary: "A freelance service listing. You can view details, see the seller, and place an order with ACoins." },
  { match: /^\/app\/afufreelance/, name: "AfuFreelance", summary: "The AfuChat freelance marketplace — browse services, hire talent, or post your own gigs." },

  // Wallet services
  { match: /^\/app\/afupay/, name: "Wallet", summary: "Manage money, transfers, payments, and built-in services in one place." },

  // Premium & monetisation
  { match: /^\/premium/, name: "Premium Plans", summary: "View AfuChat Gold and Platinum subscription plans and subscribe." },
  { match: /^\/monetize/, name: "Monetisation", summary: "Creator monetisation options — how to earn money from your content on AfuChat." },

  // Company
  { match: /^\/company\/manage/, name: "Manage Company Page", summary: "Manage your company or organisation page on AfuChat." },
  { match: /^\/company\//, name: "Company Page", summary: "A company or organisation page on AfuChat." },
  { match: /^\/company/, name: "Companies", summary: "Browse all company and organisation pages on AfuChat." },

  // Communities / Groups / Channels
  { match: /^\/communities/, name: "Communities", summary: "Browse and participate in group communities on AfuChat." },
  { match: /^\/channel\//, name: "Channel", summary: "A creator or brand's broadcast channel." },
  { match: /^\/group\//, name: "Group Chat", summary: "A group conversation." },
  { match: /^\/paid-communities/, name: "Paid Communities", summary: "Browse paid community memberships." },
  { match: /^\/app\/afuevents/, name: "Digital Events", summary: "Browse and join digital events." },
  { match: /^\/app\/afucollections/, name: "Collections", summary: "Your saved collections." },

  // Settings
  { match: /^\/settings\/two-factor/, name: "Two-Factor Auth", summary: "Enable or disable two-factor authentication for your account." },
  { match: /^\/settings\/oauth-providers/, name: "Linked Accounts (Settings)", summary: "Manage linked external accounts — GitHub, X." },
  { match: /^\/settings\/privacy-account/, name: "Account Privacy", summary: "Control who can see your account on AfuChat." },
  { match: /^\/settings\/privacy-visibility/, name: "Profile Visibility", summary: "Control your profile visibility settings." },
  { match: /^\/settings\/privacy-messages/, name: "Message Privacy", summary: "Control who can send you messages." },
  { match: /^\/settings\/privacy-interactions/, name: "Interaction Privacy", summary: "Control who can interact with your posts." },
  { match: /^\/settings\/privacy-download/, name: "Download My Data", summary: "Download a copy of all your AfuChat data." },
  { match: /^\/settings\/privacy-data/, name: "Data Usage", summary: "Control how AfuChat uses your data." },
  { match: /^\/settings\/privacy-restricted/, name: "Restricted Accounts", summary: "Manage accounts you've restricted from interacting with you." },
  { match: /^\/settings\/privacy/, name: "Privacy Settings", summary: "Manage your privacy settings — who can see and interact with your account." },
  { match: /^\/settings\/security/, name: "Security Settings", summary: "Password, two-factor authentication, and linked accounts." },
  { match: /^\/settings\/blocked/, name: "Blocked Users", summary: "View and manage the accounts you've blocked." },
  { match: /^\/settings\/chat/, name: "Chat Settings", summary: "Chat appearance and message preferences." },
  { match: /^\/settings/, name: "Settings", summary: "AfuChat account, privacy, and app settings." },

  // AI
  { match: /^\/ai/, name: "AfuAI", summary: "The AfuAI assistant screen." },

  // Support & misc
  { match: /^\/support/, name: "Support", summary: "Contact AfuChat support and view your open tickets." },
  { match: /^\/qr-scanner/, name: "QR Scanner", summary: "Scan any QR code — profiles, payments, or external links." },
  { match: /^\/language-settings/, name: "Language Settings", summary: "Change the app display language." },
  { match: /^\/device-security/, name: "Device Security", summary: "Device-level security settings." },
  { match: /^\/status/, name: "Account Status", summary: "Your account and system status." },
  { match: /^\/business-verification/, name: "Business Verification", summary: "Apply for business account verification." },
  { match: /^\/about/, name: "About AfuChat", summary: "Information about the AfuChat platform and team." },
  { match: /^\/careers/, name: "Careers", summary: "Job openings and career opportunities at AfuChat." },
  { match: /^\/download/, name: "Download App", summary: "Download the AfuChat app on iOS or Android." },
  { match: /^\/features/, name: "Features", summary: "Overview of AfuChat's features and capabilities." },

  // Tabs (catch-all after specific routes)
  { match: /^\/discover/, name: "Discover", summary: "Trending content, hashtags, and new people to follow." },
  { match: /^\/contacts/, name: "Contacts", summary: "Your contacts and friends list." },
  { match: /^\/(tabs\/)?apps/, name: "Apps", summary: "Access Wallet and AfuChat's other built-in apps." },
  { match: /^\/me$/, name: "My Profile", summary: "Your personal AfuChat profile, posts, followers, and stats." },
  { match: /^\/search/, name: "Search", summary: "Find people, posts, videos, jobs, events, and more across AfuChat." },

  // Handle-based profile routes — /@handle or /[handle]
  { match: /^\/@/, name: "User Profile", summary: "A user's public AfuChat profile page." },

  // Home
  { match: /^\/$/, name: "Home Feed", summary: "The AfuChat home feed — posts, stories, and updates from people you follow." },
];

/**
 * Resolve a raw Expo Router pathname into a PageInfo object.
 * Strips query strings and trailing slashes before matching.
 */
export function resolvePageInfo(pathname: string): PageInfo {
  const clean = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  for (const { match, name, summary } of ROUTE_MAP) {
    if (match.test(clean)) return { pathname: clean, name, summary };
  }
  return {
    pathname: clean,
    name: "AfuChat",
    summary: `You're on the ${clean} screen of AfuChat.`,
  };
}

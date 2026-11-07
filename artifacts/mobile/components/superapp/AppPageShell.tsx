import React from "react";
import { Platform, View } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import AppBottomNav, { type AppNavItem } from "./AppBottomNav";
import type { FullAppId } from "@/lib/superapp/appRouteIds";

export type { FullAppId } from "@/lib/superapp/appRouteIds";

const NAV: Record<FullAppId, AppNavItem[]> = {
  afupay: [
    { key: "home", label: "Overview", icon: "wallet-outline", href: "/app/afupay" },
    { key: "history", label: "Activity", icon: "receipt-outline", href: "/app/afupay?section=history" },
    { key: "topup", label: "Top up", icon: "add-circle-outline", href: "/app/afupay?section=topup" },
    { key: "requests", label: "Requests", icon: "arrow-down-circle-outline", href: "/app/afupay?section=requests" },
    { key: "services", label: "Services", icon: "grid-outline", href: "/app/afupay?section=services" },
  ],
  afumarket: [
    { key: "browse", label: "Browse", icon: "storefront-outline", href: "/app/afumarket" },
    { key: "cart", label: "Cart", icon: "cart-outline", href: "/app/afumarket?section=cart" },
    { key: "orders", label: "Orders", icon: "receipt-outline", href: "/app/afumarket?section=orders" },
    { key: "sell", label: "Sell", icon: "pricetag-outline", href: "/app/afumarket?section=apply-seller" },
  ],
  afugames: [
    { key: "games", label: "AfuGames", icon: "game-controller-outline", href: "/app/afugames" },
  ],
  afubusiness: [
    { key: "home", label: "Overview", icon: "home-outline", href: "/app/afubusiness" },
    { key: "analytics", label: "Analytics", icon: "bar-chart-outline", href: "/app/afubusiness?section=analytics" },
    { key: "products", label: "Products", icon: "pricetag-outline", href: "/app/afubusiness?section=products" },
    { key: "orders", label: "Orders", icon: "receipt-outline", href: "/app/afubusiness?section=orders" },
  ],
  afusearch: [],
  afufreelance: [
    { key: "browse", label: "Browse", icon: "search-outline", href: "/app/afufreelance" },
    { key: "post-gig", label: "Post a gig", icon: "add-circle-outline", href: "/app/afufreelance?section=post-gig" },
  ],
  afufiles: [
    { key: "library", label: "Library", icon: "folder-outline", href: "/app/afufiles" },
  ],
  afugifts: [
    { key: "gifts", label: "My gifts", icon: "gift-outline", href: "/app/afugifts" },
    { key: "marketplace", label: "Marketplace", icon: "storefront-outline", href: "/app/afugifts?section=marketplace" },
  ],
  afuevents: [
    { key: "upcoming", label: "Upcoming", icon: "calendar-outline", href: "/app/afuevents" },
    { key: "online", label: "Online", icon: "globe-outline", href: "/app/afuevents?section=online" },
    { key: "free", label: "Free", icon: "ticket-outline", href: "/app/afuevents?section=free" },
  ],
  afumatch: [
    { key: "discover", label: "Discover", icon: "heart-outline", href: "/app/afumatch" },
    { key: "matches", label: "My matches", icon: "people-outline", href: "/app/afumatch?section=matches" },
    { key: "preferences", label: "Preferences", icon: "options-outline", href: "/app/afumatch?section=preferences" },
  ],
  afucollections: [
    { key: "collections", label: "Collections", icon: "albums-outline", href: "/app/afucollections" },
  ],
  afuusernames: [
    { key: "market", label: "Market", icon: "storefront-outline", href: "/app/afuusernames" },
    { key: "owned", label: "Owned", icon: "at-outline", href: "/app/afuusernames?section=owned" },
    { key: "mine", label: "My listings", icon: "pricetag-outline", href: "/app/afuusernames?section=mine" },
  ],
  afuqr: [
    { key: "scan", label: "Scan", icon: "qr-code-outline", href: "/app/afuqr" },
  ],
  afusaved: [
    { key: "saved", label: "Saved", icon: "bookmark-outline", href: "/app/afusaved" },
  ],
  afumusic: [
    { key: "discover", label: "Explore", icon: "compass-outline", activeIcon: "compass", href: "/app/afumusic" },
    { key: "library", label: "My Music", icon: "albums-outline", activeIcon: "albums", href: "/app/afumusic?section=library" },
    { key: "offline", label: "Downloads", icon: "cloud-download-outline", activeIcon: "cloud-download", href: "/app/afumusic?section=offline" },
    { key: "studio", label: "Studio", icon: "musical-notes-outline", activeIcon: "musical-notes", href: "/app/afumusic?section=studio" },
  ],
};

// App modules own their in-flow header and back control. The shell places the
// shared floating navigation over pages that define app destinations.

export function getAppNav(appId: FullAppId) {
  const items = NAV[appId];
  // Offline music caching uses the native file cache and is not available in browsers.
  return appId === "afumusic" && Platform.OS === "web"
    ? items.filter((item) => item.key !== "offline")
    : items;
}

export function normalizeAppNavKey(section?: string) {
  if (section === "apply-seller") return "sell";
  if (section === "apply" || section === "manage" || section === "storefront" || section === "product" || section === "order") return "browse";
  if (section === "post-gig") return "post-gig";
  if (["airtime", "data-bundles", "bills", "transfer", "hotels", "tickets", "fee-details"].includes(section ?? "")) {
    return "services";
  }
  return section;
}

type Props = {
  appId: FullAppId;
  activeKey?: string;
  showNav?: boolean;
  children: React.ReactNode;
};

export default function AppPageShell({ appId, activeKey, showNav = true, children }: Props) {
  const { colors } = useTheme();
  const items = getAppNav(appId);
  const shouldShowNav = showNav && items.length > 1;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1, minHeight: 0, position: "relative" }}>{children}</View>
      {shouldShowNav && <AppBottomNav items={items} activeKey={activeKey} />}
    </View>
  );
}
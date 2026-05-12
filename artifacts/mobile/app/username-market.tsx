/**
 * Username Marketplace — open to ALL users (no admin gate).
 *
 * Ownership model
 * ───────────────
 * Every handle a user acquires is stored in the `owned_usernames` table:
 *   (id, handle TEXT UNIQUE, owner_id UUID, is_primary BOOL, acquired_at TIMESTAMPTZ)
 *
 * When someone buys a listed handle it is added to their owned_usernames row and
 * removed from the seller's row.  The buyer's `profiles.handle` (display handle) is
 * NOT changed — they can change it any time from profile settings.  ALL handles they
 * own still route to the same profile via the alias resolution in [handle].tsx.
 *
 * Required DB migration (run once in Supabase SQL editor):
 * ─────────────────────────────────────────────────────────
 * CREATE TABLE IF NOT EXISTS owned_usernames (
 *   id         UUID      DEFAULT gen_random_uuid() PRIMARY KEY,
 *   handle     TEXT      UNIQUE NOT NULL,
 *   owner_id   UUID      NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 *   is_primary BOOLEAN   DEFAULT FALSE,
 *   acquired_at TIMESTAMPTZ DEFAULT NOW()
 * );
 * CREATE INDEX IF NOT EXISTS owned_usernames_owner_id_idx ON owned_usernames(owner_id);
 * ALTER TABLE owned_usernames ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "public read"  ON owned_usernames FOR SELECT USING (true);
 * CREATE POLICY "owner insert" ON owned_usernames FOR INSERT WITH CHECK (auth.uid() = owner_id);
 * CREATE POLICY "owner delete" ON owned_usernames FOR DELETE USING (auth.uid() = owner_id);
 * CREATE POLICY "owner update" ON owned_usernames FOR UPDATE USING (auth.uid() = owner_id);
 *
 * CREATE TABLE IF NOT EXISTS username_listings (
 *   id          UUID      DEFAULT gen_random_uuid() PRIMARY KEY,
 *   username    TEXT      NOT NULL,
 *   price       INTEGER   NOT NULL,
 *   seller_id   UUID      NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 *   description TEXT,
 *   is_active   BOOLEAN   DEFAULT TRUE,
 *   views       INTEGER   DEFAULT 0,
 *   created_at  TIMESTAMPTZ DEFAULT NOW(),
 *   sold_to_id  UUID      REFERENCES profiles(id) ON DELETE SET NULL  -- set when purchased; prevents re-listing
 * );
 * -- Run this if the table already exists:
 * ALTER TABLE username_listings ADD COLUMN IF NOT EXISTS sold_to_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import { MarketplaceCardSkeleton } from "@/components/ui/Skeleton";
import Colors from "@/constants/colors";
import { transferAcoin } from "@/lib/monetize";
import { showAlert } from "@/lib/alert";
import * as Haptics from "@/lib/haptics";
import * as Clipboard from "expo-clipboard";

/* ─── Types ────────────────────────────────────────────────── */

type Listing = {
  id: string;
  username: string;
  price: number;
  seller_id: string;
  seller_name: string;
  seller_handle: string;
  description: string;
  is_active: boolean;
  views: number;
  created_at: string;
};

type OwnedUsername = {
  id: string;
  handle: string;
  is_primary: boolean;
  acquired_at: string;
  listed?: boolean;
  listing_price?: number;
  listing_id?: string;
};

type SortKey = "price_desc" | "price_asc" | "newest" | "rarity";

/* ─── Rarity helpers ───────────────────────────────────────── */

const RARITY_TIERS = [
  { max: 4,        label: "Legendary", color: "#FF9500", emoji: "👑" },
  { max: 6,        label: "Rare",      color: "#BF5AF2", emoji: "💎" },
  { max: 9,        label: "Uncommon",  color: "#007AFF", emoji: "⭐" },
  { max: Infinity, label: "Common",    color: "#8E8E93", emoji: "·"  },
];

function getRarity(handle: string) {
  const len = handle.length;
  return RARITY_TIERS.find((r) => len <= r.max) ?? RARITY_TIERS[3];
}

function fmtPrice(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 30)  return `${d}d ago`;
  const m = Math.floor(d / 30);
  return `${m}mo ago`;
}

/* ─── Main screen ──────────────────────────────────────────── */

type TabKey = "browse" | "mine" | "sell";

export default function UsernameMarketScreen() {
  const { colors, accent } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<TabKey>("browse");
  const [listings, setListings] = useState<Listing[]>([]);
  const [ownedUsernames, setOwnedUsernames] = useState<OwnedUsername[]>([]);
  const [loading, setLoading] = useState(true);
  const [ownedLoading, setOwnedLoading] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("price_desc");
  const [sortOpen, setSortOpen] = useState(false);

  // Sell / list form
  const [listHandle, setListHandle] = useState("");
  const [listPrice, setListPrice] = useState("500");
  const [listDesc, setListDesc] = useState("");
  const [listing, setListing] = useState(false);
  const [sellFromOwned, setSellFromOwned] = useState<OwnedUsername | null>(null);

  /* ── Data loading ── */

  const loadListings = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("username_listings")
      .select(
        "id, username, price, seller_id, description, is_active, views, created_at, profiles!username_listings_seller_id_fkey(display_name, handle)"
      )
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(80);

    if (data) {
      const mapped: Listing[] = data.map((l: any) => ({
        id: l.id,
        username: l.username,
        price: l.price,
        seller_id: l.seller_id,
        description: l.description || "",
        is_active: l.is_active,
        views: l.views || 0,
        created_at: l.created_at,
        seller_name: l.profiles?.display_name || "Seller",
        seller_handle: l.profiles?.handle || "",
      }));
      setListings(mapped);
    }
    setLoading(false);
  }, []);

  const loadOwnedUsernames = useCallback(async () => {
    if (!user) return;
    setOwnedLoading(true);

    const { data: owned } = await supabase
      .from("owned_usernames")
      .select("id, handle, is_primary, acquired_at")
      .eq("owner_id", user.id)
      .order("acquired_at", { ascending: false });

    const handles: OwnedUsername[] = owned ? [...owned] : [];

    // Include the primary profile handle only if it hasn't been sold to someone else.
    // If it was sold, the seller keeps using it as their display @handle but loses
    // marketplace ownership — so we must NOT add it back into the sellable collection.
    if (profile?.handle && !handles.find((h) => h.handle === profile.handle)) {
      const { data: otherOwner } = await supabase
        .from("owned_usernames")
        .select("id")
        .eq("handle", profile.handle)
        .neq("owner_id", user.id)
        .maybeSingle();

      if (!otherOwner) {
        // Nobody else has marketplace ownership — it still belongs to this user
        handles.unshift({
          id: "primary",
          handle: profile.handle,
          is_primary: true,
          acquired_at: (profile as any).created_at || new Date().toISOString(),
        });
      }
      // If otherOwner exists the handle was sold; skip adding it so the seller
      // cannot re-list it. Their profiles.handle is untouched (they still use it).
    }

    // Mark which are currently listed for sale
    const handleList = handles.map((h) => h.handle);
    if (handleList.length > 0) {
      const { data: activeListings } = await supabase
        .from("username_listings")
        .select("id, username, price")
        .in("username", handleList)
        .eq("is_active", true);

      const listedMap: Record<string, { id: string; price: number }> = {};
      (activeListings || []).forEach((l: any) => {
        listedMap[l.username] = { id: l.id, price: l.price };
      });

      setOwnedUsernames(
        handles.map((h) => ({
          ...h,
          listed: !!listedMap[h.handle],
          listing_price: listedMap[h.handle]?.price,
          listing_id: listedMap[h.handle]?.id,
        }))
      );
    } else {
      setOwnedUsernames(handles);
    }
    setOwnedLoading(false);
  }, [user, profile?.handle, (profile as any)?.created_at]);

  // Reload market listings whenever screen gains focus (catches stale data after buy)
  useFocusEffect(
    useCallback(() => {
      loadListings();
    }, [loadListings])
  );

  useEffect(() => {
    if (tab === "mine" || tab === "sell") loadOwnedUsernames();
  }, [tab, loadOwnedUsernames]);

  /* ── Filtering + sorting (browse tab only) ── */

  const displayListings = useMemo(() => {
    let result = listings;
    // Hide listings belonging to current user from browse tab
    // (they manage them from "mine" tab)
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (l) => l.username.toLowerCase().includes(q) || l.description.toLowerCase().includes(q)
      );
    }
    switch (sort) {
      case "price_asc":  return [...result].sort((a, b) => a.price - b.price);
      case "price_desc": return [...result].sort((a, b) => b.price - a.price);
      case "newest":     return [...result].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      case "rarity":     return [...result].sort((a, b) => a.username.length - b.username.length);
      default:           return result;
    }
  }, [listings, search, sort]);

  /* ── Buy action ── */

  async function buyUsername(item: Listing) {
    if (!user || !profile) { router.push("/(auth)/login"); return; }
    if (item.seller_id === user.id) {
      showAlert("Your listing", "You cannot buy your own listing.");
      return;
    }

    const myAcoin = profile.acoin || 0;
    if (myAcoin < item.price) {
      showAlert(
        "Not enough ACoin",
        `You need ${fmtPrice(item.price)} ACoin but only have ${fmtPrice(myAcoin)}.`,
        [{ text: "Top Up Wallet", onPress: () => router.push("/wallet") }, { text: "Cancel" }]
      );
      return;
    }

    showAlert(
      `Buy @${item.username}?`,
      `Cost: ${fmtPrice(item.price)} ACoin\n\nThis handle will be added to your username collection. You can set it as your primary handle anytime.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Buy Now",
          onPress: async () => {
            setBuying(item.id);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

            // 1. Transfer ACoin buyer → seller
            const result = await transferAcoin({
              buyerId: user.id,
              sellerId: item.seller_id,
              buyerCurrentAcoin: myAcoin,
              amount: item.price,
              transactionType: "monetize_username_market",
              metadata: { username: item.username, listing_id: item.id },
            });

            if (!result.success) {
              setBuying(null);
              showAlert("Purchase Failed", result.error || "Something went wrong.");
              return;
            }

            // 2. Deactivate the listing and record who bought it.
            //    sold_to_id acts as the permanent "sold" marker — it prevents
            //    anyone (including the buyer) from ever re-listing this handle.
            await supabase
              .from("username_listings")
              .update({ is_active: false, sold_to_id: user.id })
              .eq("id", item.id);

            // 3. Transfer ownership: upsert buyer's row, delete seller's row.
            //    If the handle was the seller's profiles.handle, their display
            //    handle is intentionally left unchanged — they keep using it.
            await supabase.from("owned_usernames").upsert(
              { handle: item.username, owner_id: user.id, is_primary: false },
              { onConflict: "handle" }
            );
            await supabase
              .from("owned_usernames")
              .delete()
              .eq("handle", item.username)
              .eq("owner_id", item.seller_id);

            // 4. Remove from local listings state immediately
            setListings((prev) => prev.filter((l) => l.id !== item.id));
            setBuying(null);

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            showAlert(
              "Username Acquired! 🎉",
              `@${item.username} is now permanently in your collection — it cannot be re-sold. Visit "My Usernames" to manage it or set it as your primary handle.`,
              [
                { text: "My Collection", onPress: () => { loadOwnedUsernames(); setTab("mine"); } },
                { text: "OK" },
              ]
            );
          },
        },
      ]
    );
  }

  /* ── Delist action ── */

  async function delistUsername(listingId: string, username: string) {
    showAlert(
      `Remove @${username} from market?`,
      "This will take it off sale. You keep the username and can re-list it anytime.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove Listing",
          style: "destructive",
          onPress: async () => {
            await supabase
              .from("username_listings")
              .update({ is_active: false })
              .eq("id", listingId);
            // Remove from browse listings immediately
            setListings((prev) => prev.filter((l) => l.id !== listingId));
            loadOwnedUsernames();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          },
        },
      ]
    );
  }

  /* ── Re-list from "My Usernames" tab ── */

  function relistHandle(h: OwnedUsername) {
    setSellFromOwned(h);
    setListHandle("");
    setListPrice("500");
    setListDesc("");
    setTab("sell");
  }

  /* ── Submit listing ── */

  async function submitListing() {
    if (!user) return;

    const handle = sellFromOwned
      ? sellFromOwned.handle
      : listHandle.trim().toLowerCase().replace(/[^a-z0-9_.]/g, "");

    if (!handle) { showAlert("Invalid", "Enter a valid username."); return; }

    const price = parseInt(listPrice, 10);
    if (!price || price < 10) { showAlert("Invalid price", "Minimum price is 10 ACoin."); return; }

    // ── Guard 1: Verify the current user owns this handle ──────────────────
    const { data: ownershipRow } = await supabase
      .from("owned_usernames")
      .select("id")
      .eq("handle", handle)
      .eq("owner_id", user.id)
      .maybeSingle();

    const isPrimaryHandle = handle === profile?.handle;

    if (!ownershipRow && !isPrimaryHandle) {
      showAlert("Not Your Handle", `You don't own @${handle}. You can only list usernames you own.`);
      return;
    }

    // ── Guard 2: Reject if another user has marketplace ownership ───────────
    // Catches the case where the seller sold their primary handle — their
    // profiles.handle is unchanged (they still display it) but the marketplace
    // ownership now belongs to the buyer.
    const { data: otherOwner } = await supabase
      .from("owned_usernames")
      .select("id")
      .eq("handle", handle)
      .neq("owner_id", user.id)
      .maybeSingle();

    if (otherOwner) {
      showAlert(
        "No Longer Yours",
        `@${handle} was sold and is now owned by another user. You keep using it as your display handle but cannot re-list it.`
      );
      return;
    }

    // ── Guard 3: Block re-listing of any handle that was ever sold ──────────
    // sold_to_id is set permanently when a listing is purchased — this prevents
    // the buyer (or anyone else) from ever trading this handle again.
    const { data: soldRecord } = await supabase
      .from("username_listings")
      .select("id")
      .eq("username", handle)
      .not("sold_to_id", "is", null)
      .maybeSingle();

    if (soldRecord) {
      showAlert(
        "Final Sale Only",
        `@${handle} was already sold on the marketplace. Purchased usernames are permanently owned and cannot be re-listed.`
      );
      return;
    }

    // ── Guard 4: Already active listing ────────────────────────────────────
    const { data: existing } = await supabase
      .from("username_listings")
      .select("id")
      .eq("username", handle)
      .eq("is_active", true)
      .maybeSingle();

    if (existing) {
      showAlert("Already Listed", `@${handle} is already on the market.`);
      return;
    }

    setListing(true);
    const { error } = await supabase.from("username_listings").insert({
      username: handle,
      price,
      seller_id: user.id,
      description: listDesc.trim(),
      is_active: true,
      views: 0,
    });
    setListing(false);

    if (error) { showAlert("Error", error.message); return; }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showAlert("Listed! 🏷️", `@${handle} is now on the market for ${fmtPrice(price)} ACoin.`);
    setListHandle("");
    setListPrice("500");
    setListDesc("");
    setSellFromOwned(null);
    loadListings();
    loadOwnedUsernames();
    setTab("mine");
  }

  /* ── Set primary handle ── */

  async function setPrimaryHandle(handle: string) {
    if (!user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error } = await supabase
      .from("profiles")
      .update({ handle })
      .eq("id", user.id);
    if (error) { showAlert("Error", error.message); return; }
    await supabase
      .from("owned_usernames")
      .update({ is_primary: false })
      .eq("owner_id", user.id);
    await supabase
      .from("owned_usernames")
      .upsert({ handle, owner_id: user.id, is_primary: true }, { onConflict: "handle" });
    showAlert("Primary Handle Updated", `Your profile will now show @${handle} as your main handle.`);
    loadOwnedUsernames();
  }

  /* ── Copy handle ── */

  function copyHandle(handle: string) {
    Clipboard.setStringAsync(`@${handle}`);
    Haptics.selectionAsync();
  }

  /* ─── Render ─────────────────────────────────────────────── */

  const TABS: { key: TabKey; label: string; icon: string }[] = [
    { key: "browse", label: "Browse",        icon: "storefront-outline" },
    { key: "mine",   label: "My Usernames",  icon: "person-outline"     },
    { key: "sell",   label: "List Handle",   icon: "pricetag-outline"   },
  ];

  const SORT_LABELS: Record<SortKey, string> = {
    price_desc: "Price: High to Low",
    price_asc:  "Price: Low to High",
    newest:     "Newest First",
    rarity:     "Rarest First",
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>

      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Username Market</Text>
          <Text style={[styles.headerSub, { color: colors.textMuted }]}>
            Buy, sell and collect premium handles
          </Text>
        </View>
        {profile && (
          <View style={[styles.acoinPill, { backgroundColor: Colors.gold + "18" }]}>
            <Text style={[styles.acoinText, { color: Colors.gold }]}>
              🪙 {fmtPrice(profile.acoin || 0)}
            </Text>
          </View>
        )}
      </View>

      {/* ── Rarity guide strip ── */}
      <View style={[styles.rarityStrip, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {RARITY_TIERS.map((r) => (
          <View key={r.label} style={styles.rarityItem}>
            <View style={[styles.rarityDot, { backgroundColor: r.color }]} />
            <Text style={[styles.rarityLabel, { color: colors.textMuted }]}>{r.label}</Text>
          </View>
        ))}
        <TouchableOpacity
          style={[styles.walletBtn, { borderColor: colors.border }]}
          onPress={() => router.push("/wallet")}
        >
          <Ionicons name="wallet-outline" size={13} color={colors.textMuted} />
          <Text style={[styles.walletBtnText, { color: colors.textMuted }]}>Wallet</Text>
        </TouchableOpacity>
      </View>

      {/* ── Tab bar ── */}
      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, active && { borderBottomColor: accent, borderBottomWidth: 2.5 }]}
              onPress={() => setTab(t.key)}
            >
              <Ionicons name={t.icon as any} size={15} color={active ? accent : colors.textMuted} />
              <Text style={[styles.tabText, { color: active ? accent : colors.textMuted }]}>
                {t.label}
              </Text>
              {t.key === "mine" && ownedUsernames.length > 0 && (
                <View style={[styles.tabBadge, { backgroundColor: accent }]}>
                  <Text style={styles.tabBadgeText}>{ownedUsernames.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ─────────── BROWSE TAB ─────────── */}
      {tab === "browse" && (
        <>
          <View style={[styles.searchRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <View style={[styles.searchBox, { backgroundColor: colors.backgroundSecondary }]}>
              <Ionicons name="search-outline" size={15} color={colors.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Search handles…"
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch("")} hitSlop={8}>
                  <Ionicons name="close-circle" size={15} color={colors.textMuted} />
                </Pressable>
              )}
            </View>
            <TouchableOpacity
              style={[styles.sortBtn, { backgroundColor: colors.backgroundSecondary }]}
              onPress={() => setSortOpen(true)}
            >
              <Ionicons name="funnel-outline" size={15} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={{ padding: 12, gap: 10 }}>
              {[1, 2, 3].map((i) => <MarketplaceCardSkeleton key={i} />)}
            </View>
          ) : (
            <FlatList
              data={displayListings}
              keyExtractor={(l) => l.id}
              contentContainerStyle={{ gap: 8, padding: 12, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyEmoji}>🏷️</Text>
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>
                    {search ? "No results" : "No handles for sale yet"}
                  </Text>
                  <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                    Check back soon or list your own handle!
                  </Text>
                  <TouchableOpacity
                    style={[styles.emptyBtn, { backgroundColor: accent }]}
                    onPress={() => setTab("sell")}
                  >
                    <Text style={styles.emptyBtnText}>List a Handle</Text>
                  </TouchableOpacity>
                </View>
              }
              renderItem={({ item }) => (
                <ListingCard
                  item={item}
                  currentUserId={user?.id}
                  buying={buying}
                  colors={colors}
                  accent={accent}
                  onBuy={() => buyUsername(item)}
                  onDelist={() => delistUsername(item.id, item.username)}
                  onCopy={() => copyHandle(item.username)}
                />
              )}
            />
          )}
        </>
      )}

      {/* ─────────── MY USERNAMES TAB ─────────── */}
      {tab === "mine" && (
        <>
          {ownedLoading ? (
            <View style={{ padding: 16, gap: 10 }}>
              {[1, 2, 3].map((i) => <MarketplaceCardSkeleton key={i} />)}
            </View>
          ) : ownedUsernames.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>👤</Text>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No usernames yet</Text>
              <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                Buy handles from the market to build your collection
              </Text>
              <TouchableOpacity
                style={[styles.emptyBtn, { backgroundColor: accent }]}
                onPress={() => setTab("browse")}
              >
                <Text style={styles.emptyBtnText}>Browse Market</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={ownedUsernames}
              keyExtractor={(h) => h.id}
              contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                <Text style={[styles.sectionSub, { color: colors.textMuted, marginBottom: 4 }]}>
                  {ownedUsernames.length} username{ownedUsernames.length !== 1 ? "s" : ""} owned
                  · tap a handle to manage it
                </Text>
              }
              renderItem={({ item: h }) => {
                const rarity = getRarity(h.handle);
                return (
                  <View style={[styles.ownedCard, { backgroundColor: colors.surface, borderColor: rarity.color + "33" }]}>
                    {/* Handle + badges */}
                    <View style={styles.ownedCardTop}>
                      <View style={[styles.handleBubble, { backgroundColor: rarity.color + "18" }]}>
                        <Text style={[styles.handleText, { color: rarity.color }]}>@{h.handle}</Text>
                      </View>
                      <View style={styles.ownedBadgeRow}>
                        <View style={[styles.rarityTag, { backgroundColor: rarity.color + "22" }]}>
                          <Text style={[styles.rarityTagText, { color: rarity.color }]}>
                            {rarity.emoji} {rarity.label}
                          </Text>
                        </View>
                        {h.is_primary && (
                          <View style={[styles.rarityTag, { backgroundColor: accent + "22" }]}>
                            <Text style={[styles.rarityTagText, { color: accent }]}>⭐ Primary</Text>
                          </View>
                        )}
                        {h.listed && (
                          <View style={[styles.rarityTag, { backgroundColor: "#FF950022" }]}>
                            <Text style={[styles.rarityTagText, { color: "#FF9500" }]}>
                              🏷️ {fmtPrice(h.listing_price || 0)} ACoin
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Meta */}
                    <Text style={[styles.ownedMeta, { color: colors.textMuted }]}>
                      {h.handle.length} chars · acquired {timeAgo(h.acquired_at)}
                    </Text>

                    {/* Listed notice */}
                    {h.listed && (
                      <View style={[styles.listedNotice, { backgroundColor: "#FF950012", borderColor: "#FF950033" }]}>
                        <Ionicons name="storefront-outline" size={13} color="#FF9500" />
                        <Text style={[styles.listedNoticeText, { color: "#FF9500" }]}>
                          Currently listed on market for {fmtPrice(h.listing_price || 0)} ACoin
                        </Text>
                      </View>
                    )}

                    {/* Actions */}
                    <View style={styles.ownedActions}>
                      <TouchableOpacity
                        style={[styles.ownedActionChip, { backgroundColor: colors.backgroundSecondary }]}
                        onPress={() => copyHandle(h.handle)}
                      >
                        <Ionicons name="copy-outline" size={14} color={colors.textMuted} />
                        <Text style={[styles.ownedActionChipText, { color: colors.textMuted }]}>Copy</Text>
                      </TouchableOpacity>

                      {!h.is_primary && (
                        <TouchableOpacity
                          style={[styles.ownedActionChip, { backgroundColor: accent + "18" }]}
                          onPress={() => setPrimaryHandle(h.handle)}
                        >
                          <Ionicons name="star-outline" size={14} color={accent} />
                          <Text style={[styles.ownedActionChipText, { color: accent }]}>Set Primary</Text>
                        </TouchableOpacity>
                      )}

                      {h.listed && h.listing_id ? (
                        <TouchableOpacity
                          style={[styles.ownedActionChip, { backgroundColor: "#FF3B3018" }]}
                          onPress={() => delistUsername(h.listing_id!, h.handle)}
                        >
                          <Ionicons name="close-circle-outline" size={14} color="#FF3B30" />
                          <Text style={[styles.ownedActionChipText, { color: "#FF3B30" }]}>Delist</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={[styles.ownedActionChip, { backgroundColor: "#34C75918" }]}
                          onPress={() => relistHandle(h)}
                        >
                          <Ionicons name="pricetag-outline" size={14} color="#34C759" />
                          <Text style={[styles.ownedActionChipText, { color: "#34C759" }]}>List for Sale</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              }}
            />
          )}
        </>
      )}

      {/* ─────────── SELL / LIST TAB ─────────── */}
      {tab === "sell" && (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>List a Handle for Sale</Text>
          <Text style={[styles.sectionSub, { color: colors.textMuted }]}>
            You can only list handles you own. The buyer pays ACoin directly to you.
          </Text>

          {/* Pick from owned usernames */}
          {ownedLoading ? (
            <ActivityIndicator color={accent} />
          ) : ownedUsernames.length > 0 ? (
            <View>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
                Your Handles
              </Text>
              <View style={styles.ownedGrid}>
                {ownedUsernames.map((h) => {
                  const isSelected = sellFromOwned?.handle === h.handle;
                  const rarity = getRarity(h.handle);
                  return (
                    <TouchableOpacity
                      key={h.id}
                      style={[
                        styles.ownedChip,
                        {
                          backgroundColor: isSelected ? accent + "22" : colors.backgroundSecondary,
                          borderColor: isSelected ? accent : h.listed ? "#FF950044" : colors.border,
                        },
                      ]}
                      onPress={() => {
                        if (h.listed) {
                          showAlert("Already Listed", `@${h.handle} is already on the market. Delist it from "My Usernames" tab first.`);
                          return;
                        }
                        setSellFromOwned(isSelected ? null : h);
                        setListHandle("");
                      }}
                    >
                      <Text style={[styles.ownedChipText, { color: isSelected ? accent : rarity.color }]}>
                        @{h.handle}
                      </Text>
                      {h.is_primary && (
                        <View style={[styles.primaryBadge, { backgroundColor: accent + "30" }]}>
                          <Text style={[styles.primaryBadgeText, { color: accent }]}>primary</Text>
                        </View>
                      )}
                      {h.listed && (
                        <View style={[styles.listedBadge, { backgroundColor: "#FF950020" }]}>
                          <Text style={styles.listedBadgeText}>listed</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* Or enter manually */}
          {!sellFromOwned && (
            <View>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
                {ownedUsernames.length > 0 ? "Or enter a handle manually" : "Handle to Sell"}
              </Text>
              <View style={[styles.field, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.atSign, { color: colors.textMuted }]}>@</Text>
                <TextInput
                  style={[styles.fieldInput, { color: colors.text }]}
                  placeholder="handlename"
                  placeholderTextColor={colors.textMuted}
                  value={listHandle}
                  onChangeText={setListHandle}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={30}
                />
              </View>
            </View>
          )}

          {sellFromOwned && (
            <View style={[styles.selectedHandleCard, { backgroundColor: colors.surface, borderColor: accent + "44" }]}>
              <View>
                <Text style={[styles.selectedHandleLabel, { color: colors.textMuted }]}>Listing handle</Text>
                <Text style={[styles.selectedHandleText, { color: getRarity(sellFromOwned.handle).color }]}>
                  @{sellFromOwned.handle}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSellFromOwned(null)} hitSlop={10}>
                <Ionicons name="close-circle" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          )}

          <View>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Asking Price (ACoin)</Text>
            <View style={[styles.field, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={{ fontSize: 16 }}>🪙</Text>
              <TextInput
                style={[styles.fieldInput, { color: colors.text }]}
                placeholder="500"
                placeholderTextColor={colors.textMuted}
                value={listPrice}
                onChangeText={setListPrice}
                keyboardType="number-pad"
                maxLength={9}
              />
              <Text style={[{ color: colors.textMuted, fontSize: 13 }]}>ACoin</Text>
            </View>
            <Text style={[styles.fieldHint, { color: colors.textMuted }]}>
              Minimum 10 ACoin · You receive 100% of the sale
            </Text>
          </View>

          <View>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Description (optional)</Text>
            <View style={[styles.fieldMultiline, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TextInput
                style={[styles.fieldInput, { color: colors.text }]}
                placeholder="Why is this handle valuable?"
                placeholderTextColor={colors.textMuted}
                value={listDesc}
                onChangeText={setListDesc}
                multiline
                numberOfLines={3}
                maxLength={200}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: accent, opacity: listing ? 0.7 : 1 }]}
            onPress={submitListing}
            disabled={listing}
          >
            {listing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="pricetag" size={18} color="#fff" />
                <Text style={styles.submitBtnText}>List for Sale</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ── Sort modal ── */}
      <Modal visible={sortOpen} transparent animationType="fade" onRequestClose={() => setSortOpen(false)}>
        <Pressable style={styles.sortBackdrop} onPress={() => setSortOpen(false)} />
        <View style={[styles.sortSheet, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sortTitle, { color: colors.text }]}>Sort By</Text>
          {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
            <TouchableOpacity
              key={key}
              style={[styles.sortOption, sort === key && { backgroundColor: accent + "14" }]}
              onPress={() => { setSort(key); setSortOpen(false); }}
            >
              <Text style={[styles.sortOptionText, { color: sort === key ? accent : colors.text }]}>
                {SORT_LABELS[key]}
              </Text>
              {sort === key && <Ionicons name="checkmark" size={18} color={accent} />}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>
    </View>
  );
}

/* ─── Listing Card ─────────────────────────────────────────── */

function ListingCard({
  item,
  currentUserId,
  buying,
  colors,
  accent,
  onBuy,
  onDelist,
  onCopy,
}: {
  item: Listing;
  currentUserId?: string;
  buying: string | null;
  colors: any;
  accent: string;
  onBuy: () => void;
  onDelist: () => void;
  onCopy: () => void;
}) {
  const rarity = getRarity(item.username);
  const isOwn = item.seller_id === currentUserId;
  const isBuying = buying === item.id;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: rarity.color + "44", borderWidth: 1 },
      ]}
    >
      <View style={styles.cardTop}>
        <View style={[styles.handleBubble, { backgroundColor: rarity.color + "18" }]}>
          <Text style={[styles.handleText, { color: rarity.color }]}>@{item.username}</Text>
        </View>
        <View style={styles.cardTopRight}>
          <View style={[styles.rarityTag, { backgroundColor: rarity.color + "22" }]}>
            <Text style={[styles.rarityTagText, { color: rarity.color }]}>
              {rarity.emoji} {rarity.label}
            </Text>
          </View>
          <Text style={[styles.charCount, { color: colors.textMuted }]}>
            {item.username.length} chars
          </Text>
        </View>
      </View>

      <Text style={[styles.sellerLine, { color: colors.textMuted }]}>
        Listed by @{item.seller_handle || "unknown"}
      </Text>

      {item.description ? (
        <Text style={[styles.descText, { color: colors.textSecondary }]} numberOfLines={2}>
          {item.description}
        </Text>
      ) : null}

      <View style={styles.cardBottom}>
        <View style={styles.cardMeta}>
          <Ionicons name="eye-outline" size={12} color={colors.textMuted} />
          <Text style={[styles.metaText, { color: colors.textMuted }]}>{item.views}</Text>
        </View>

        <View style={{ flex: 1 }} />

        <TouchableOpacity onPress={onCopy} hitSlop={8} style={styles.copyBtn}>
          <Ionicons name="copy-outline" size={14} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={[styles.pricePill, { backgroundColor: Colors.gold + "1A" }]}>
          <Text style={[styles.priceText, { color: Colors.gold }]}>
            🪙 {fmtPrice(item.price)}
          </Text>
        </View>

        {isOwn ? (
          <TouchableOpacity
            style={[styles.delistBtn, { borderColor: "#FF3B30" }]}
            onPress={onDelist}
          >
            <Text style={[styles.delistBtnText, { color: "#FF3B30" }]}>Delist</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.buyBtn, { backgroundColor: rarity.color }]}
            onPress={onBuy}
            disabled={isBuying}
          >
            {isBuying ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buyBtnText}>Buy</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

/* ─── Styles ───────────────────────────────────────────────── */

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  acoinPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  acoinText: { fontSize: 13, fontFamily: "Inter_700Bold" },

  rarityStrip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rarityItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  rarityDot: { width: 7, height: 7, borderRadius: 4 },
  rarityLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  walletBtn: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  walletBtnText: { fontSize: 11, fontFamily: "Inter_500Medium" },

  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 11,
  },
  tabText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  tabBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  tabBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 38,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  sortBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  card: { borderRadius: 16, padding: 14 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 8 },
  handleBubble: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 22, flexShrink: 1 },
  handleText: { fontSize: 20, fontFamily: "Inter_700Bold" },
  cardTopRight: { gap: 4, alignItems: "flex-end" },
  charCount: { fontSize: 11, fontFamily: "Inter_400Regular" },
  sellerLine: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 4 },
  descText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, marginBottom: 8 },
  cardBottom: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 3 },
  metaText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  copyBtn: { padding: 4 },
  pricePill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  priceText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  buyBtn: { paddingHorizontal: 20, paddingVertical: 9, borderRadius: 20, minWidth: 60, alignItems: "center" },
  buyBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
  delistBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  delistBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  rarityTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  rarityTagText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  emptyState: { alignItems: "center", paddingVertical: 60, gap: 10, paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },
  emptyBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20, marginTop: 8 },
  emptyBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 14 },

  sectionTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  sectionSub: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },

  // Owned username card (My Usernames tab)
  ownedCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    gap: 8,
  },
  ownedCardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10, flexWrap: "wrap" },
  ownedBadgeRow: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 5, alignItems: "center" },
  ownedMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  listedNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: StyleSheet.hairlineWidth,
  },
  listedNoticeText: { fontSize: 12, fontFamily: "Inter_500Medium", flex: 1 },
  ownedActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  ownedActionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  ownedActionChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 8 },
  fieldHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 6 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  fieldMultiline: {
    flexDirection: "row",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 80,
  },
  fieldInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  atSign: { fontSize: 20, fontFamily: "Inter_700Bold" },

  ownedGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  ownedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  ownedChipText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  primaryBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  primaryBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  listedBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  listedBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#FF9500" },

  selectedHandleCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1.5,
  },
  selectedHandleLabel: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 2 },
  selectedHandleText: { fontSize: 18, fontFamily: "Inter_700Bold" },

  submitBtn: {
    height: 54,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  submitBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },

  sortBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  sortSheet: {
    position: "absolute",
    right: 12,
    top: "35%",
    borderRadius: 16,
    padding: 8,
    minWidth: 220,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  sortTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", paddingHorizontal: 12, paddingVertical: 8, opacity: 0.6 },
  sortOption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10 },
  sortOptionText: { fontSize: 14, fontFamily: "Inter_500Medium" },
});

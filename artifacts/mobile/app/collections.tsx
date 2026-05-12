import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { ComingSoonView } from "@/components/ui/ComingSoonView";
import { ListRowSkeleton, PostSkeleton } from "@/components/ui/Skeleton";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "@/lib/haptics";
import { storage, KEYS } from "@/lib/storage";

type Collection = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  item_count: number;
  created_at: string;
  is_private: boolean;
};

type CollectionItem = {
  id: string;
  item_type: "post" | "link" | "image" | "file";
  item_id: string;
  url?: string;
  title?: string;
  preview?: string;
  added_at: string;
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

const PALETTE = ["#00BCD4", "#BF5AF2", "#FF9500", "#34C759", "#007AFF", "#FF3B30", "#D4A853", "#AF52DE"];
const EMOJIS = ["📁", "⭐", "💡", "📌", "🔖", "🎯", "🧠", "❤️", "🔥", "✨", "🎵", "📚"];

const ITEM_TYPE_META: Record<string, { icon: string; label: string; bg: string }> = {
  post:  { icon: "newspaper-outline",  label: "Post",  bg: "#007AFF" },
  link:  { icon: "link-outline",       label: "Link",  bg: "#34C759" },
  image: { icon: "image-outline",      label: "Image", bg: "#FF9500" },
  file:  { icon: "document-outline",   label: "File",  bg: "#BF5AF2" },
};

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
  return `${Math.floor(d / 30)}mo ago`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) return "Today";
  if (diff < 172800000) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function CreateSheet({
  colors,
  isDark,
  onClose,
  onCreate,
}: {
  colors: any;
  isDark: boolean;
  onClose: () => void;
  onCreate: (name: string, emoji: string, color: string, isPrivate: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("📁");
  const [color, setColor] = useState(colors.accent);
  const [isPrivate, setIsPrivate] = useState(false);
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!name.trim()) { showAlert("Required", "Enter a collection name"); return; }
    setCreating(true);
    await onCreate(name.trim(), emoji, color, isPrivate);
    setCreating(false);
  }

  return (
    <View style={[sheet.overlay]}>
      <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[sheet.container, { backgroundColor: colors.surface }]}>
        <View style={sheet.handleBar} />
        <Text style={[sheet.title, { color: colors.text }]}>New Collection</Text>

        <Text style={[sheet.label, { color: colors.textMuted }]}>ICON</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={sheet.emojiScroll} contentContainerStyle={{ gap: 8 }}>
          {EMOJIS.map((e) => (
            <TouchableOpacity
              key={e}
              style={[sheet.emojiBtn, { backgroundColor: emoji === e ? color + "28" : colors.backgroundTertiary }, emoji === e && { borderColor: color, borderWidth: 2 }]}
              onPress={() => setEmoji(e)}
            >
              <Text style={{ fontSize: 22 }}>{e}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={[sheet.label, { color: colors.textMuted }]}>NAME</Text>
        <View style={[sheet.inputRow, { backgroundColor: colors.backgroundTertiary }]}>
          <Text style={{ fontSize: 20 }}>{emoji}</Text>
          <TextInput
            style={[sheet.input, { color: colors.text }]}
            placeholder="My collection"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
            autoFocus
          />
        </View>

        <Text style={[sheet.label, { color: colors.textMuted }]}>COLOR</Text>
        <View style={sheet.colorRow}>
          {PALETTE.map((c) => (
            <TouchableOpacity
              key={c}
              style={[sheet.colorDot, { backgroundColor: c }, color === c && sheet.colorDotActive]}
              onPress={() => setColor(c)}
            >
              {color === c && <Ionicons name="checkmark" size={14} color="#fff" />}
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[sheet.privacyRow, { backgroundColor: colors.backgroundTertiary }]}
          onPress={() => setIsPrivate((p) => !p)}
          activeOpacity={0.7}
        >
          <View style={[sheet.privacyIcon, { backgroundColor: isPrivate ? "#FF9500" + "22" : colors.backgroundSecondary }]}>
            <Ionicons name={isPrivate ? "lock-closed" : "globe-outline"} size={18} color={isPrivate ? "#FF9500" : colors.textMuted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[sheet.privacyTitle, { color: colors.text }]}>
              {isPrivate ? "Private" : "Public"}
            </Text>
            <Text style={[sheet.privacySub, { color: colors.textMuted }]}>
              {isPrivate ? "Only you can see this" : "Visible to everyone"}
            </Text>
          </View>
          <View style={[sheet.toggle, { backgroundColor: isPrivate ? "#FF9500" : colors.backgroundSecondary }]}>
            <View style={[sheet.toggleThumb, { transform: [{ translateX: isPrivate ? 20 : 2 }] }]} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[sheet.createBtn, { backgroundColor: color, opacity: creating ? 0.7 : 1 }]}
          onPress={handleCreate}
          disabled={creating}
        >
          {creating
            ? <ActivityIndicator color="#fff" />
            : <Text style={sheet.createBtnText}>Create Collection</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

type MainTab = "collections" | "usernames";

export default function CollectionsScreen() {
  const { colors, isDark, accent } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();

  const [mainTab, setMainTab] = useState<MainTab>("collections");

  // Collections state
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [collectionItems, setCollectionItems] = useState<CollectionItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  // Usernames state
  const [ownedUsernames, setOwnedUsernames] = useState<OwnedUsername[]>([]);
  const [usernamesLoading, setUsernamesLoading] = useState(false);
  const [usernamesLoaded, setUsernamesLoaded] = useState(false);

  const loadCollections = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("collections")
      .select("id, name, emoji, color, item_count, created_at, is_private")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setCollections(data || []);
    setLoading(false);
  }, [user]);

  const loadOwnedUsernames = useCallback(async () => {
    if (!user) return;
    setUsernamesLoading(true);

    const { data: owned } = await supabase
      .from("owned_usernames")
      .select("id, handle, is_primary, acquired_at")
      .eq("owner_id", user.id)
      .order("acquired_at", { ascending: false });

    const handles: OwnedUsername[] = owned ? [...owned] : [];

    // Include primary profile handle if not in owned_usernames yet
    if (profile?.handle && !handles.find((h) => h.handle === profile.handle)) {
      handles.unshift({
        id: "primary",
        handle: profile.handle,
        is_primary: true,
        acquired_at: (profile as any).created_at || new Date().toISOString(),
      });
    }

    // Mark which are currently listed on market
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

    setUsernamesLoading(false);
    setUsernamesLoaded(true);
  }, [user, profile?.handle, (profile as any)?.created_at]);

  useEffect(() => { loadCollections(); }, [loadCollections]);

  useEffect(() => {
    if (mainTab === "usernames" && !usernamesLoaded) {
      loadOwnedUsernames();
    }
  }, [mainTab, usernamesLoaded, loadOwnedUsernames]);

  async function openCollection(col: Collection) {
    setSelectedCollection(col);
    setLoadingItems(true);
    const { data } = await supabase
      .from("collection_items")
      .select("id, item_type, item_id, url, title, preview, added_at")
      .eq("collection_id", col.id)
      .order("added_at", { ascending: false });
    setCollectionItems(data || []);
    setLoadingItems(false);
  }

  async function handleCreate(name: string, emoji: string, color: string, isPrivate: boolean) {
    if (!user) return;
    const { data, error } = await supabase.from("collections").insert({
      user_id: user.id, name, emoji, color, is_private: isPrivate, item_count: 0,
    }).select().single();
    if (error) { showAlert("Error", error.message); return; }
    setCollections((prev) => [data, ...prev]);
    setShowCreate(false);
    showAlert("Created!", `${emoji} ${name} is ready`);
  }

  async function deleteCollection(col: Collection) {
    showAlert("Delete Collection?", `This will permanently remove "${col.name}" and all saved items.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          await supabase.from("collection_items").delete().eq("collection_id", col.id);
          await supabase.from("collections").delete().eq("id", col.id);
          setCollections((prev) => prev.filter((c) => c.id !== col.id));
          if (selectedCollection?.id === col.id) setSelectedCollection(null);
        },
      },
    ]);
  }

  async function removeItem(item: CollectionItem) {
    await supabase.from("collection_items").delete().eq("id", item.id);
    if (selectedCollection) {
      await supabase.from("collections")
        .update({ item_count: Math.max(0, selectedCollection.item_count - 1) })
        .eq("id", selectedCollection.id);
    }
    setCollectionItems((prev) => prev.filter((i) => i.id !== item.id));
  }

  function copyHandle(handle: string) {
    Clipboard.setStringAsync(`@${handle}`);
    Haptics.selectionAsync();
    showAlert("Copied!", `@${handle} copied to clipboard`);
  }

  async function setPrimaryHandle(handle: string) {
    if (!user) return;
    const storedMs = storage.getString(KEYS.HANDLE_CHANGED_AT_PREFIX + user.id);
    if (storedMs) {
      const elapsed   = Date.now() - parseInt(storedMs, 10);
      const remaining = 30 * 24 * 60 * 60 * 1000 - elapsed;
      if (remaining > 0) {
        const daysLeft = Math.ceil(remaining / (24 * 60 * 60 * 1000));
        showAlert(
          "Username Locked",
          `You can change your username again in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}.`
        );
        return;
      }
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error } = await supabase.from("profiles").update({ handle }).eq("id", user.id);
    if (error) { showAlert("Error", error.message); return; }
    await supabase.from("owned_usernames").update({ is_primary: false }).eq("owner_id", user.id);
    await supabase.from("owned_usernames").upsert({ handle, owner_id: user.id, is_primary: true }, { onConflict: "handle" });
    storage.setString(KEYS.HANDLE_CHANGED_AT_PREFIX + user.id, Date.now().toString());
    showAlert("Primary Handle Updated", `Your profile now shows @${handle}.`);
    loadOwnedUsernames();
  }

  const bg = isDark ? "#0d0d0d" : "#f7f9fb";

  // ── Collection detail view ──
  if (selectedCollection) {
    return (
      <View style={[styles.root, { backgroundColor: bg, paddingTop: insets.top }]}>
        <View style={[styles.detailHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => setSelectedCollection(null)} style={styles.backBtn} hitSlop={10}>
            <Ionicons name="chevron-back" size={22} color={colors.accent} />
          </TouchableOpacity>
          <View style={[styles.colIconBig, { backgroundColor: selectedCollection.color + "22" }]}>
            <Text style={{ fontSize: 28 }}>{selectedCollection.emoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[styles.detailTitle, { color: colors.text }]}>{selectedCollection.name}</Text>
              {selectedCollection.is_private && (
                <Ionicons name="lock-closed" size={13} color={colors.textMuted} />
              )}
            </View>
            <Text style={[styles.detailSub, { color: colors.textMuted }]}>
              {selectedCollection.item_count} saved item{selectedCollection.item_count !== 1 ? "s" : ""}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => deleteCollection(selectedCollection)}
            style={[styles.iconBtn, { backgroundColor: "#FF3B30" + "18" }]}
            hitSlop={8}
          >
            <Ionicons name="trash-outline" size={18} color="#FF3B30" />
          </TouchableOpacity>
        </View>

        {loadingItems ? (
          <View style={{ paddingTop: 8, gap: 8 }}>
            {[1,2,3].map(i => <PostSkeleton key={i} />)}
          </View>
        ) : collectionItems.length === 0 ? (
          <View style={styles.center}>
            <Text style={{ fontSize: 56 }}>{selectedCollection.emoji}</Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Empty collection</Text>
            <Text style={[styles.emptySub, { color: colors.textMuted }]}>
              Save posts, links, and media here from anywhere in the app
            </Text>
          </View>
        ) : (
          <FlatList
            data={collectionItems}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingVertical: 12, gap: 1 }}
            renderItem={({ item }) => {
              const meta = ITEM_TYPE_META[item.item_type] || ITEM_TYPE_META.file;
              return (
                <TouchableOpacity
                  style={[styles.itemCard, { backgroundColor: colors.surface }]}
                  onPress={() => item.url && router.push(item.url as any)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.itemTypeDot, { backgroundColor: meta.bg + "22" }]}>
                    <Ionicons name={meta.icon as any} size={20} color={meta.bg} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={2}>
                      {item.title || item.url || "Saved item"}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
                      <View style={[styles.typePill, { backgroundColor: meta.bg + "18" }]}>
                        <Text style={[styles.typePillText, { color: meta.bg }]}>{meta.label}</Text>
                      </View>
                      <Text style={[styles.itemDate, { color: colors.textMuted }]}>{formatDate(item.added_at)}</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => removeItem(item)} hitSlop={10} style={styles.removeBtn}>
                    <Ionicons name="close-circle-outline" size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    );
  }

  if (Platform.OS === "web" && !profile?.is_admin) {
    return <ComingSoonView title="Collections" description="AfuCollections is coming to web soon. Organize and share your curated content on the mobile app today." />;
  }

  return (
    <View style={[styles.root, { backgroundColor: bg, paddingTop: insets.top }]}>

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Collections</Text>
        {mainTab === "collections" && (
          <TouchableOpacity
            style={[styles.newBtn, { backgroundColor: colors.accent }]}
            onPress={() => setShowCreate(true)}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.newBtnText}>New</Text>
          </TouchableOpacity>
        )}
        {mainTab === "usernames" && (
          <TouchableOpacity
            style={[styles.newBtn, { backgroundColor: colors.accent }]}
            onPress={() => router.push("/username-market")}
          >
            <Ionicons name="storefront-outline" size={15} color="#fff" />
            <Text style={styles.newBtnText}>Market</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Main tab bar */}
      <View style={[styles.mainTabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {(["collections", "usernames"] as MainTab[]).map((t) => {
          const active = mainTab === t;
          const labels: Record<MainTab, string> = { collections: "Collections", usernames: "Usernames" };
          const icons: Record<MainTab, string> = { collections: "bookmark-outline", usernames: "at-outline" };
          return (
            <TouchableOpacity
              key={t}
              style={[styles.mainTab, active && { borderBottomColor: colors.accent, borderBottomWidth: 2.5 }]}
              onPress={() => setMainTab(t)}
            >
              <Ionicons name={icons[t] as any} size={16} color={active ? colors.accent : colors.textMuted} />
              <Text style={[styles.mainTabText, { color: active ? colors.accent : colors.textMuted }]}>
                {labels[t]}
              </Text>
              {t === "usernames" && ownedUsernames.length > 0 && (
                <View style={[styles.tabBadge, { backgroundColor: colors.accent }]}>
                  <Text style={styles.tabBadgeText}>{ownedUsernames.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── COLLECTIONS TAB ── */}
      {mainTab === "collections" && (
        <>
          {loading ? (
            <View style={{ paddingTop: 8 }}>
              {[1,2,3,4,5].map(i => <ListRowSkeleton key={i} />)}
            </View>
          ) : collections.length === 0 ? (
            <View style={styles.center}>
              <View style={[styles.emptyIconWrap, { backgroundColor: colors.accent + "18" }]}>
                <Ionicons name="bookmark-outline" size={44} color={colors.accent} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No collections yet</Text>
              <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                Organize your saved posts, links, and media into themed folders
              </Text>
              <TouchableOpacity style={[styles.emptyAction, { backgroundColor: colors.accent }]} onPress={() => setShowCreate(true)}>
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.emptyActionText}>Create your first collection</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={collections}
              keyExtractor={(item) => item.id}
              numColumns={2}
              contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 40 }}
              columnWrapperStyle={{ gap: 12 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.colCard, { backgroundColor: colors.surface, flex: 1 }]}
                  onPress={() => openCollection(item)}
                  onLongPress={() => deleteCollection(item)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.colCardHeader, { backgroundColor: item.color + "18" }]}>
                    <Text style={styles.colEmoji}>{item.emoji}</Text>
                    {item.is_private && (
                      <View style={[styles.privateBadge, { backgroundColor: colors.surface + "dd" }]}>
                        <Ionicons name="lock-closed" size={10} color={colors.textMuted} />
                      </View>
                    )}
                  </View>
                  <View style={styles.colCardBody}>
                    <Text style={[styles.colName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={[styles.colCount, { color: colors.textMuted }]}>
                        {item.item_count} item{item.item_count !== 1 ? "s" : ""}
                      </Text>
                      <View style={[styles.colorDot, { backgroundColor: item.color }]} />
                    </View>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </>
      )}

      {/* ── USERNAMES TAB ── */}
      {mainTab === "usernames" && (
        <>
          {usernamesLoading ? (
            <View style={{ paddingTop: 8 }}>
              {[1,2,3,4].map(i => <ListRowSkeleton key={i} />)}
            </View>
          ) : ownedUsernames.length === 0 ? (
            <View style={styles.center}>
              <View style={[styles.emptyIconWrap, { backgroundColor: Colors.gold + "18" }]}>
                <Ionicons name="at-outline" size={44} color={Colors.gold} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No usernames owned</Text>
              <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                Buy premium handles from the Username Market to build your collection
              </Text>
              <TouchableOpacity
                style={[styles.emptyAction, { backgroundColor: Colors.gold }]}
                onPress={() => router.push("/username-market")}
              >
                <Ionicons name="storefront-outline" size={18} color="#fff" />
                <Text style={styles.emptyActionText}>Browse Username Market</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={ownedUsernames}
              keyExtractor={(h) => h.id}
              contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                <View style={[styles.usernameHeader, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.usernameHeaderLeft}>
                    <Text style={[styles.usernameHeaderCount, { color: colors.text }]}>
                      {ownedUsernames.length}
                    </Text>
                    <Text style={[styles.usernameHeaderLabel, { color: colors.textMuted }]}>
                      username{ownedUsernames.length !== 1 ? "s" : ""} owned
                    </Text>
                  </View>
                  <View style={styles.usernameHeaderRight}>
                    {RARITY_TIERS.map((r) => {
                      const count = ownedUsernames.filter((h) => getRarity(h.handle).label === r.label).length;
                      if (count === 0) return null;
                      return (
                        <View key={r.label} style={[styles.rarityPill, { backgroundColor: r.color + "18" }]}>
                          <Text style={[styles.rarityPillText, { color: r.color }]}>
                            {r.emoji} {count}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              }
              renderItem={({ item: h }) => {
                const rarity = getRarity(h.handle);
                return (
                  <View style={[styles.usernameCard, { backgroundColor: colors.surface, borderColor: rarity.color + "33" }]}>
                    {/* Top row: handle + rarity */}
                    <View style={styles.usernameCardTop}>
                      <View style={[styles.handleBubble, { backgroundColor: rarity.color + "18" }]}>
                        <Text style={[styles.handleText, { color: rarity.color }]}>@{h.handle}</Text>
                      </View>
                      <View style={styles.badgeRow}>
                        <View style={[styles.rarityTag, { backgroundColor: rarity.color + "22" }]}>
                          <Text style={[styles.rarityTagText, { color: rarity.color }]}>
                            {rarity.emoji} {rarity.label}
                          </Text>
                        </View>
                        {h.is_primary && (
                          <View style={[styles.rarityTag, { backgroundColor: colors.accent + "22" }]}>
                            <Text style={[styles.rarityTagText, { color: colors.accent }]}>⭐ Primary</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Meta */}
                    <Text style={[styles.usernameMeta, { color: colors.textMuted }]}>
                      {h.handle.length} chars · acquired {timeAgo(h.acquired_at)}
                    </Text>

                    {/* Market status */}
                    {h.listed ? (
                      <View style={[styles.listedBanner, { backgroundColor: "#FF950012", borderColor: "#FF950033" }]}>
                        <Ionicons name="storefront-outline" size={13} color="#FF9500" />
                        <Text style={[styles.listedBannerText, { color: "#FF9500" }]}>
                          Listed on market · {fmtPrice(h.listing_price || 0)} ACoin
                        </Text>
                        <View style={{ flex: 1 }} />
                        <TouchableOpacity
                          onPress={() => router.push("/username-market")}
                          hitSlop={8}
                        >
                          <Text style={[styles.listedBannerLink, { color: "#FF9500" }]}>Manage →</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={[styles.unlistedBanner, { backgroundColor: colors.backgroundSecondary }]}>
                        <Ionicons name="lock-closed-outline" size={13} color={colors.textMuted} />
                        <Text style={[styles.unlistedBannerText, { color: colors.textMuted }]}>
                          Not listed · only you own this
                        </Text>
                      </View>
                    )}

                    {/* Actions */}
                    <View style={styles.usernameActions}>
                      <TouchableOpacity
                        style={[styles.actionChip, { backgroundColor: colors.backgroundSecondary }]}
                        onPress={() => copyHandle(h.handle)}
                      >
                        <Ionicons name="copy-outline" size={14} color={colors.textMuted} />
                        <Text style={[styles.actionChipText, { color: colors.textMuted }]}>Copy</Text>
                      </TouchableOpacity>

                      {!h.is_primary && (
                        <TouchableOpacity
                          style={[styles.actionChip, { backgroundColor: colors.accent + "18" }]}
                          onPress={() => setPrimaryHandle(h.handle)}
                        >
                          <Ionicons name="star-outline" size={14} color={colors.accent} />
                          <Text style={[styles.actionChipText, { color: colors.accent }]}>Set Primary</Text>
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity
                        style={[styles.actionChip, { backgroundColor: Colors.gold + "18" }]}
                        onPress={() => router.push("/username-market")}
                      >
                        <Ionicons name="pricetag-outline" size={14} color={Colors.gold} />
                        <Text style={[styles.actionChipText, { color: Colors.gold }]}>
                          {h.listed ? "Manage Listing" : "List for Sale"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </>
      )}

      {showCreate && (
        <CreateSheet
          colors={colors}
          isDark={isDark}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 2 },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  newBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },

  mainTabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mainTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  mainTabText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  tabBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 36 },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
  emptyAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 6,
  },
  emptyActionText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 },

  colCard: { borderRadius: 18, overflow: "hidden" },
  colCardHeader: {
    aspectRatio: 1.5,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  colEmoji: { fontSize: 44 },
  privateBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  colCardBody: { padding: 14, gap: 4 },
  colName: { fontSize: 15, fontFamily: "Inter_700Bold" },
  colCount: { fontSize: 12, fontFamily: "Inter_400Regular" },
  colorDot: { width: 10, height: 10, borderRadius: 5 },

  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  colIconBig: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  detailTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  detailSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 12,
    marginVertical: 2,
    borderRadius: 16,
  },
  itemTypeDot: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  itemTitle: { fontSize: 14, fontFamily: "Inter_500Medium", lineHeight: 20 },
  typePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  typePillText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  itemDate: { fontSize: 12, fontFamily: "Inter_400Regular" },
  removeBtn: { padding: 4 },

  // Username collection styles
  usernameHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 14,
    padding: 14,
    marginBottom: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  usernameHeaderLeft: { gap: 2 },
  usernameHeaderCount: { fontSize: 28, fontFamily: "Inter_700Bold" },
  usernameHeaderLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  usernameHeaderRight: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "flex-end", maxWidth: "60%" },
  rarityPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  rarityPillText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  usernameCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    gap: 8,
  },
  usernameCardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10, flexWrap: "wrap" },
  handleBubble: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 22, flexShrink: 1 },
  handleText: { fontSize: 20, fontFamily: "Inter_700Bold" },
  badgeRow: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 5, alignItems: "center" },
  rarityTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  rarityTagText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  usernameMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },

  listedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  listedBannerText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  listedBannerLink: { fontSize: 12, fontFamily: "Inter_700Bold" },
  unlistedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  unlistedBannerText: { fontSize: 12, fontFamily: "Inter_400Regular" },

  usernameActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  actionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  actionChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});

const sheet = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
    zIndex: 100,
  },
  container: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: Platform.OS === "ios" ? 40 : 28,
    gap: 0,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(128,128,128,0.3)",
    alignSelf: "center",
    marginBottom: 20,
  },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 20 },
  label: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginBottom: 10, marginTop: 16 },
  emojiScroll: { marginBottom: 4 },
  emojiBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
    marginBottom: 4,
  },
  input: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular" },
  colorRow: { flexDirection: "row", gap: 10, marginBottom: 4 },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  colorDotActive: {
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.8)",
  },
  privacyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    padding: 14,
    marginTop: 8,
    marginBottom: 4,
  },
  privacyIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  privacyTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  privacySub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  toggle: { width: 44, height: 24, borderRadius: 12, position: "relative", justifyContent: "center" },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff", position: "absolute" },
  createBtn: {
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  createBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
});

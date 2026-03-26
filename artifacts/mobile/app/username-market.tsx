import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import { transferAcoin } from "@/lib/monetize";
import { showAlert } from "@/lib/alert";

type UsernameListing = {
  id: string;
  username: string;
  price: number;
  seller_id: string;
  seller_name: string;
  seller_handle: string;
  description: string;
  is_active: boolean;
  views: number;
};

const RARITY_COLORS = [
  { max: 5, label: "Legendary", color: "#FF9500" },
  { max: 7, label: "Rare", color: "#BF5AF2" },
  { max: 10, label: "Uncommon", color: "#007AFF" },
  { max: Infinity, label: "Common", color: "#8E8E93" },
];

function getRarity(username: string) {
  const len = username.length;
  return RARITY_COLORS.find((r) => len <= r.max) ?? RARITY_COLORS[3];
}

export default function UsernameMarketScreen() {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<"browse" | "mine" | "list">("browse");
  const [listings, setListings] = useState<UsernameListing[]>([]);
  const [myListings, setMyListings] = useState<UsernameListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);

  const [listUsernameValue, setListUsernameValue] = useState("");
  const [listPrice, setListPrice] = useState("500");
  const [listDesc, setListDesc] = useState("");
  const [listing, setListing] = useState(false);

  const loadListings = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("username_listings")
      .select(`id, username, price, seller_id, description, is_active, views, profiles!username_listings_seller_id_fkey(display_name, handle)`)
      .eq("is_active", true)
      .order("price", { ascending: false })
      .limit(40);

    if (data) {
      const mapped: UsernameListing[] = data.map((l: any) => ({
        id: l.id, username: l.username, price: l.price, seller_id: l.seller_id,
        description: l.description || "", is_active: l.is_active, views: l.views || 0,
        seller_name: l.profiles?.display_name || "Seller",
        seller_handle: l.profiles?.handle || "seller",
      }));
      setListings(mapped);
      setMyListings(mapped.filter((l) => l.seller_id === user?.id));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { loadListings(); }, [loadListings]);

  async function buyUsername(item: UsernameListing) {
    if (!user || !profile) { router.push("/(auth)/login"); return; }
    if (item.seller_id === user.id) { showAlert("Own listing", "You can't buy your own username"); return; }
    if ((profile.acoin || 0) < item.price) {
      showAlert("Not enough ACoin", `Need ${item.price} ACoin.`, [
        { text: "Wallet", onPress: () => router.push("/wallet") }, { text: "Cancel" }
      ]); return;
    }

    showAlert(
      `Buy @${item.username}?`,
      `This will cost ${item.price} ACoin. Your current handle will be replaced.`,
      [
        { text: "Cancel" },
        {
          text: "Buy Now",
          onPress: async () => {
            setBuying(item.id);
            const result = await transferAcoin({
              buyerId: user.id, sellerId: item.seller_id,
              buyerCurrentAcoin: profile.acoin || 0, amount: item.price,
              transactionType: "monetize_username_market",
              metadata: { username: item.username, listing_id: item.id },
            });

            if (result.success) {
              // Update buyer's handle
              await supabase.from("profiles").update({ handle: item.username }).eq("id", user.id);
              // Deactivate listing
              await supabase.from("username_listings").update({ is_active: false }).eq("id", item.id);
              setListings((prev) => prev.filter((l) => l.id !== item.id));
              showAlert("🎉 Username Acquired!", `@${item.username} is now yours!`);
            } else {
              showAlert("Failed", result.error || "Purchase failed");
            }
            setBuying(null);
          },
        },
      ]
    );
  }

  async function submitListing() {
    if (!user) return;
    const handle = listUsernameValue.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!handle) { showAlert("Invalid", "Enter a valid username"); return; }
    const price = parseInt(listPrice);
    if (!price || price < 1) { showAlert("Invalid price", "Enter a valid ACoin price"); return; }

    setListing(true);
    const { error } = await supabase.from("username_listings").insert({
      username: handle, price, seller_id: user.id,
      description: listDesc.trim(), is_active: true, views: 0,
    });
    setListing(false);
    if (error) { showAlert("Error", error.message); return; }
    showAlert("Listed!", `@${handle} is now on the market for ${price} ACoin.`);
    setListUsernameValue(""); setListPrice("500"); setListDesc("");
    setTab("mine"); loadListings();
  }

  const renderCard = ({ item }: { item: UsernameListing }) => {
    const rarity = getRarity(item.username);
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: rarity.color + "33", borderWidth: 1 }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.handleBubble, { backgroundColor: rarity.color + "18" }]}>
            <Text style={[styles.handleText, { color: rarity.color }]}>@{item.username}</Text>
          </View>
          <View style={[styles.rarityTag, { backgroundColor: rarity.color + "22" }]}>
            <Text style={[styles.rarityText, { color: rarity.color }]}>{rarity.label}</Text>
          </View>
        </View>
        <Text style={[styles.sellerText, { color: colors.textMuted }]}>Listed by @{item.seller_handle}</Text>
        {item.description ? <Text style={[styles.descText, { color: colors.textSecondary }]}>{item.description}</Text> : null}
        <View style={styles.cardFooter}>
          <View style={styles.metaItem}>
            <Ionicons name="eye-outline" size={13} color={colors.textMuted} />
            <Text style={[styles.metaText, { color: colors.textMuted }]}>{item.views} views</Text>
          </View>
          <View style={{ flex: 1 }} />
          <View style={[styles.pricePill, { backgroundColor: Colors.gold + "22" }]}>
            <Text style={[styles.priceText, { color: Colors.gold }]}>{item.price} 🪙</Text>
          </View>
          <TouchableOpacity
            style={[styles.buyBtn, { backgroundColor: item.seller_id === user?.id ? colors.backgroundTertiary : rarity.color }]}
            onPress={() => buyUsername(item)}
            disabled={item.seller_id === user?.id || buying === item.id}
          >
            {buying === item.id ? <ActivityIndicator color="#fff" size="small" /> : (
              <Text style={[styles.buyBtnText, { color: item.seller_id === user?.id ? colors.textMuted : "#fff" }]}>
                {item.seller_id === user?.id ? "Your listing" : "Buy"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>🏷️ Username Market</Text>
          <Text style={[styles.headerSub, { color: colors.textMuted }]}>Buy rare handles with ACoin</Text>
        </View>
      </View>

      <View style={[styles.rarityGuide, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {RARITY_COLORS.map((r) => (
          <View key={r.label} style={styles.rarityGuideItem}>
            <View style={[styles.rarityDot, { backgroundColor: r.color }]} />
            <Text style={[styles.rarityGuideLabel, { color: colors.textMuted }]}>{r.label}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {(["browse", "mine", "list"] as const).map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && { borderBottomColor: Colors.brand, borderBottomWidth: 2 }]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, { color: tab === t ? Colors.brand : colors.textMuted }]}>
              {t === "browse" ? "Browse" : t === "mine" ? "My Listings" : "+ List Handle"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "list" ? (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
          <Text style={[styles.createTitle, { color: colors.text }]}>List a Username for Sale</Text>
          <Text style={[styles.createSub, { color: colors.textMuted }]}>
            List any handle you own. The buyer will receive the handle and you receive ACoin.
          </Text>
          <View>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Username to Sell</Text>
            <View style={[styles.field, { backgroundColor: colors.surface }]}>
              <Text style={[styles.atSign, { color: colors.textMuted }]}>@</Text>
              <TextInput style={[styles.fieldInput, { color: colors.text }]} placeholder="handlename" placeholderTextColor={colors.textMuted} value={listUsernameValue} onChangeText={setListUsernameValue} autoCapitalize="none" maxLength={30} />
            </View>
          </View>
          <View>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Asking Price (ACoin)</Text>
            <View style={[styles.field, { backgroundColor: colors.surface }]}>
              <Ionicons name="wallet-outline" size={18} color={colors.textMuted} />
              <TextInput style={[styles.fieldInput, { color: colors.text }]} placeholder="500" placeholderTextColor={colors.textMuted} value={listPrice} onChangeText={setListPrice} keyboardType="number-pad" maxLength={8} />
              <Text style={{ color: colors.textMuted }}>ACoin</Text>
            </View>
          </View>
          <View>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Description (optional)</Text>
            <View style={[styles.field, { backgroundColor: colors.surface }]}>
              <TextInput style={[styles.fieldInput, { color: colors.text }]} placeholder="Why is this handle valuable?" placeholderTextColor={colors.textMuted} value={listDesc} onChangeText={setListDesc} />
            </View>
          </View>
          <TouchableOpacity style={[styles.createBtn, { backgroundColor: Colors.brand, opacity: listing ? 0.7 : 1 }]} onPress={submitListing} disabled={listing}>
            {listing ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>List for Sale</Text>}
          </TouchableOpacity>
        </ScrollView>
      ) : loading ? (
        <ActivityIndicator color={Colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={tab === "mine" ? myListings : listings}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          contentContainerStyle={{ gap: 8, padding: 12, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 48 }}>🏷️</Text>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No handles for sale</Text>
              <TouchableOpacity style={[styles.createBtn, { backgroundColor: Colors.brand }]} onPress={() => setTab("list")}>
                <Text style={styles.createBtnText}>List Your Handle</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  rarityGuide: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 8, gap: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  rarityGuideItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  rarityDot: { width: 8, height: 8, borderRadius: 4 },
  rarityGuideLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  tabBar: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  card: { borderRadius: 16, padding: 16 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  handleBubble: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  handleText: { fontSize: 18, fontFamily: "Inter_700Bold" },
  rarityTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  rarityText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  sellerText: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 4 },
  descText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, marginBottom: 8 },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 8 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  pricePill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  priceText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  buyBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  buyBtnText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 6 },
  field: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 14, height: 52, gap: 8 },
  fieldInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  atSign: { fontSize: 18, fontFamily: "Inter_700Bold" },
  createTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 4 },
  createSub: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  createBtn: { height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  createBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  emptyState: { alignItems: "center", paddingVertical: 50, gap: 10 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
});

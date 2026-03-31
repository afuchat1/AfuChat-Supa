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
import { ComingSoonView } from "@/components/ui/ComingSoonView";

type Listing = {
  id: string;
  title: string;
  description: string;
  price: number;
  delivery_days: number;
  category: string;
  emoji: string;
  seller_id: string;
  seller_name: string;
  seller_handle: string;
  seller_avatar: string | null;
  orders_count: number;
  rating: number;
};

const CATEGORIES = ["All", "Design", "Writing", "Dev", "Marketing", "Video", "Music", "AI", "Other"];

export default function FreelanceScreen() {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<"browse" | "mine" | "create">("browse");
  const [selectedCat, setSelectedCat] = useState("All");
  const [listings, setListings] = useState<Listing[]>([]);
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState<string | null>(null);

  const [createTitle, setCreateTitle] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createPrice, setCreatePrice] = useState("200");
  const [createEmoji, setCreateEmoji] = useState("💼");
  const [createCategory, setCreateCategory] = useState("Design");
  const [createDays, setCreateDays] = useState("3");
  const [creating, setCreating] = useState(false);

  const loadListings = useCallback(async () => {
    setLoading(true);
    const query = supabase
      .from("freelance_listings")
      .select(`id, title, description, price, delivery_days, category, emoji, seller_id, orders_count, rating, profiles!freelance_listings_seller_id_fkey(display_name, handle, avatar_url)`)
      .eq("is_active", true)
      .order("orders_count", { ascending: false })
      .limit(40);

    const { data } = await query;
    if (data) {
      const mapped: Listing[] = data.map((l: any) => ({
        id: l.id, title: l.title, description: l.description, price: l.price,
        delivery_days: l.delivery_days || 3, category: l.category || "Other", emoji: l.emoji || "💼",
        seller_id: l.seller_id, seller_name: l.profiles?.display_name || "Seller",
        seller_handle: l.profiles?.handle || "seller", seller_avatar: l.profiles?.avatar_url || null,
        orders_count: l.orders_count || 0, rating: l.rating || 5.0,
      }));
      setListings(mapped);
      setMyListings(mapped.filter((l) => l.seller_id === user?.id));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { loadListings(); }, [loadListings]);

  async function placeOrder(listing: Listing) {
    if (!user || !profile) { router.push("/(auth)/login"); return; }
    if (listing.seller_id === user.id) { showAlert("Own listing", "You can't order your own service"); return; }
    if ((profile.acoin || 0) < listing.price) {
      showAlert("Not enough ACoin", `Need ${listing.price} ACoin.`, [
        { text: "Wallet", onPress: () => router.push("/wallet") }, { text: "Cancel" }
      ]); return;
    }

    setOrdering(listing.id);
    const result = await transferAcoin({
      buyerId: user.id, sellerId: listing.seller_id,
      buyerCurrentAcoin: profile.acoin || 0, amount: listing.price,
      transactionType: "monetize_freelance",
      metadata: { listing_id: listing.id, listing_title: listing.title },
    });

    if (result.success) {
      await supabase.from("freelance_orders").insert({
        listing_id: listing.id, buyer_id: user.id, seller_id: listing.seller_id,
        price_paid: listing.price, status: "pending",
      });
      await supabase.from("freelance_listings").update({ orders_count: listing.orders_count + 1 }).eq("id", listing.id);

      // Open a chat with the seller
      const { data: chatData } = await supabase.rpc("get_or_create_direct_chat", { other_user_id: listing.seller_id });
      showAlert("Order Placed! 🎉", `Payment sent. A chat with the seller will open.`, [
        { text: "Open Chat", onPress: () => chatData && router.push({ pathname: "/chat/[id]", params: { id: chatData } }) },
        { text: "OK" },
      ]);
      setListings((prev) => prev.map((l) => l.id === listing.id ? { ...l, orders_count: l.orders_count + 1 } : l));
    } else {
      showAlert("Failed", result.error || "Order failed");
    }
    setOrdering(null);
  }

  async function createListing() {
    if (!user) return;
    if (!createTitle.trim()) { showAlert("Required", "Enter a service title"); return; }
    const price = parseInt(createPrice);
    if (!price || price < 1) { showAlert("Invalid price", "Enter a valid ACoin price"); return; }

    setCreating(true);
    const { error } = await supabase.from("freelance_listings").insert({
      title: createTitle.trim(), description: createDesc.trim(), price, emoji: createEmoji,
      category: createCategory, delivery_days: parseInt(createDays) || 3,
      seller_id: user.id, is_active: true, orders_count: 0, rating: 5.0,
    });
    setCreating(false);
    if (error) { showAlert("Error", error.message); return; }
    showAlert("Service Listed!", "Your service is now visible in the marketplace.");
    setCreateTitle(""); setCreateDesc(""); setCreatePrice("200"); setCreateDays("3");
    setTab("mine"); loadListings();
  }

  const filtered = selectedCat === "All" ? listings : listings.filter((l) => l.category === selectedCat);

  const renderCard = ({ item }: { item: Listing }) => (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardEmoji}>{item.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{item.title}</Text>
          <Text style={[styles.cardSeller, { color: colors.textMuted }]}>@{item.seller_handle}</Text>
        </View>
        <View style={[styles.catTag, { backgroundColor: Colors.brand + "18" }]}>
          <Text style={[styles.catTagText, { color: Colors.brand }]}>{item.category}</Text>
        </View>
      </View>
      <Text style={[styles.cardDesc, { color: colors.textSecondary }]} numberOfLines={3}>{item.description}</Text>
      <View style={styles.cardMeta}>
        <View style={styles.metaItem}>
          <Ionicons name="time-outline" size={13} color={colors.textMuted} />
          <Text style={[styles.metaText, { color: colors.textMuted }]}>{item.delivery_days}d delivery</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="star" size={13} color="#FFD60A" />
          <Text style={[styles.metaText, { color: colors.textMuted }]}>{item.rating.toFixed(1)}</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="bag-check-outline" size={13} color={colors.textMuted} />
          <Text style={[styles.metaText, { color: colors.textMuted }]}>{item.orders_count} orders</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={[styles.pricePill, { backgroundColor: Colors.gold + "22" }]}>
          <Text style={[styles.priceText, { color: Colors.gold }]}>{item.price} 🪙</Text>
        </View>
        <TouchableOpacity
          style={[styles.orderBtn, { backgroundColor: item.seller_id === user?.id ? colors.backgroundTertiary : Colors.brand }]}
          onPress={() => placeOrder(item)}
          disabled={item.seller_id === user?.id || ordering === item.id}
        >
          {ordering === item.id ? <ActivityIndicator color="#fff" size="small" /> : (
            <Text style={[styles.orderBtnText, { color: item.seller_id === user?.id ? colors.textMuted : "#fff" }]}>
              {item.seller_id === user?.id ? "Your Listing" : "Order"}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  if (Platform.OS === "web" && !profile?.is_admin) {
    return <ComingSoonView title="Freelance" description="AfuFreelance is coming to web soon. Hire talent or find work on the mobile app today." />;
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>💼 Freelance Market</Text>
          <Text style={[styles.headerSub, { color: colors.textMuted }]}>Buy and sell services with ACoin</Text>
        </View>
      </View>

      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {(["browse", "mine", "create"] as const).map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && { borderBottomColor: Colors.brand, borderBottomWidth: 2 }]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, { color: tab === t ? Colors.brand : colors.textMuted }]}>
              {t === "browse" ? "Browse" : t === "mine" ? "My Services" : "+ List Service"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "browse" && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.catFilter, { backgroundColor: selectedCat === cat ? Colors.brand : colors.surface, borderColor: selectedCat === cat ? Colors.brand : colors.border }]}
              onPress={() => setSelectedCat(cat)}
            >
              <Text style={[styles.catFilterText, { color: selectedCat === cat ? "#fff" : colors.textMuted }]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {tab === "create" ? (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
          <Text style={[styles.createTitle, { color: colors.text }]}>List a Service</Text>
          {[
            { label: "Emoji", val: createEmoji, set: setCreateEmoji, placeholder: "💼", max: 4 },
            { label: "Service Title", val: createTitle, set: setCreateTitle, placeholder: "What do you offer?", max: 80 },
            { label: "Category", val: createCategory, set: setCreateCategory, placeholder: "Design / Writing / Dev...", max: 40 },
            { label: "Price (ACoin)", val: createPrice, set: setCreatePrice, placeholder: "200", max: 10 },
            { label: "Delivery (days)", val: createDays, set: setCreateDays, placeholder: "3", max: 3 },
          ].map((f) => (
            <View key={f.label}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{f.label}</Text>
              <View style={[styles.field, { backgroundColor: colors.surface }]}>
                <TextInput style={[styles.fieldInput, { color: colors.text }]} placeholder={f.placeholder} placeholderTextColor={colors.textMuted} value={f.val} onChangeText={f.set} maxLength={f.max} />
              </View>
            </View>
          ))}
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Description</Text>
          <View style={[styles.field, { backgroundColor: colors.surface, height: 100, alignItems: "flex-start", paddingTop: 12 }]}>
            <TextInput style={[styles.fieldInput, { color: colors.text }]} placeholder="Describe your service in detail…" placeholderTextColor={colors.textMuted} value={createDesc} onChangeText={setCreateDesc} multiline />
          </View>
          <TouchableOpacity style={[styles.createBtn, { backgroundColor: Colors.brand, opacity: creating ? 0.7 : 1 }]} onPress={createListing} disabled={creating}>
            {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>List Service</Text>}
          </TouchableOpacity>
        </ScrollView>
      ) : loading ? (
        <ActivityIndicator color={Colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={tab === "mine" ? myListings : filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          contentContainerStyle={{ gap: 8, padding: 12, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 48 }}>💼</Text>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No services yet</Text>
              <TouchableOpacity style={[styles.createBtn, { backgroundColor: Colors.brand }]} onPress={() => setTab("create")}>
                <Text style={styles.createBtnText}>List a Service</Text>
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
  tabBar: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  catFilter: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  catFilterText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  card: { borderRadius: 16, padding: 16 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  cardEmoji: { fontSize: 28, width: 44, textAlign: "center" },
  cardTitle: { fontSize: 15, fontFamily: "Inter_700Bold", flex: 1 },
  cardSeller: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  catTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  catTagText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  cardDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, marginBottom: 10 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  metaText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  pricePill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  priceText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  orderBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  orderBtnText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 6 },
  field: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 14, height: 52 },
  fieldInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  createTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 4 },
  createBtn: { height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  createBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  emptyState: { alignItems: "center", paddingVertical: 50, gap: 10 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
});

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";
import { transferAcoin } from "@/lib/monetize";
import { showAlert } from "@/lib/alert";

type Community = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  price: number;
  member_count: number;
  creator_id: string;
  creator_name: string;
  creator_handle: string;
  is_member: boolean;
  tags: string[];
};

export default function PaidCommunitiesScreen() {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<"browse" | "mine" | "create">("browse");
  const [communities, setCommunities] = useState<Community[]>([]);
  const [myCommunities, setMyCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);

  // Create form
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createEmoji, setCreateEmoji] = useState("🏰");
  const [createPrice, setCreatePrice] = useState("100");
  const [createTags, setCreateTags] = useState("");
  const [creating, setCreating] = useState(false);

  const loadCommunities = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("paid_communities")
      .select(`
        id, name, description, emoji, price, member_count, creator_id, tags,
        profiles!paid_communities_creator_id_fkey(display_name, handle)
      `)
      .order("member_count", { ascending: false })
      .limit(30);

    if (data) {
      let memberSet = new Set<string>();
      if (user) {
        const { data: memberships } = await supabase
          .from("community_members")
          .select("community_id")
          .eq("user_id", user.id);
        memberSet = new Set((memberships || []).map((m: any) => m.community_id));
      }

      const mapped: Community[] = data.map((c: any) => ({
        id: c.id, name: c.name, description: c.description, emoji: c.emoji || "🏰",
        price: c.price, member_count: c.member_count || 0, creator_id: c.creator_id,
        creator_name: c.profiles?.display_name || "Creator",
        creator_handle: c.profiles?.handle || "creator",
        is_member: memberSet.has(c.id),
        tags: c.tags || [],
      }));
      setCommunities(mapped);
      setMyCommunities(mapped.filter((c) => c.creator_id === user?.id || c.is_member));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { loadCommunities(); }, [loadCommunities]);

  async function joinCommunity(community: Community) {
    if (!user || !profile) { router.push("/(auth)/login"); return; }
    if (community.is_member) return;
    if ((profile.acoin || 0) < community.price) {
      showAlert("Not enough ACoin", `You need ${community.price} ACoin to join. Top up your wallet.`, [
        { text: "Go to Wallet", onPress: () => router.push("/wallet") },
        { text: "Cancel" },
      ]);
      return;
    }

    setJoining(community.id);
    const result = await transferAcoin({
      buyerId: user.id,
      sellerId: community.creator_id,
      buyerCurrentAcoin: profile.acoin || 0,
      amount: community.price,
      transactionType: "monetize_paid_communities",
      metadata: { community_id: community.id, community_name: community.name },
    });

    if (result.success) {
      await supabase.from("community_members").insert({ community_id: community.id, user_id: user.id });
      await supabase.from("paid_communities").update({ member_count: community.member_count + 1 }).eq("id", community.id);
      setCommunities((prev) => prev.map((c) => c.id === community.id ? { ...c, is_member: true, member_count: c.member_count + 1 } : c));
      showAlert("Joined!", `Welcome to ${community.name}!`);
    } else {
      showAlert("Failed", result.error || "Could not join community");
    }
    setJoining(null);
  }

  async function createCommunity() {
    if (!user) return;
    if (!createName.trim()) { showAlert("Required", "Enter a community name"); return; }
    const price = parseInt(createPrice);
    if (!price || price < 1) { showAlert("Invalid price", "Enter a valid ACoin price"); return; }

    setCreating(true);
    const { data, error } = await supabase.from("paid_communities").insert({
      name: createName.trim(),
      description: createDesc.trim(),
      emoji: createEmoji,
      price,
      creator_id: user.id,
      tags: createTags.split(",").map((t) => t.trim()).filter(Boolean),
      member_count: 0,
    }).select().single();

    setCreating(false);
    if (error) { showAlert("Error", error.message); return; }

    showAlert("Created!", `${createEmoji} ${createName} is live!`);
    setCreateName(""); setCreateDesc(""); setCreateEmoji("🏰"); setCreatePrice("100"); setCreateTags("");
    setTab("mine");
    loadCommunities();
  }

  const renderCommunityCard = ({ item }: { item: Community }) => (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardEmojiWrap}>
          <Text style={styles.cardEmoji}>{item.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardName, { color: colors.text }]}>{item.name}</Text>
          <Text style={[styles.cardCreator, { color: colors.textMuted }]}>by @{item.creator_handle}</Text>
        </View>
        <View style={[styles.pricePill, { backgroundColor: Colors.gold + "22" }]}>
          <Text style={[styles.priceText, { color: Colors.gold }]}>{item.price} 🪙</Text>
        </View>
      </View>
      {item.description ? (
        <Text style={[styles.cardDesc, { color: colors.textSecondary }]} numberOfLines={2}>{item.description}</Text>
      ) : null}
      <View style={styles.cardFooter}>
        <View style={styles.memberCount}>
          <Ionicons name="people" size={14} color={colors.textMuted} />
          <Text style={[styles.memberText, { color: colors.textMuted }]}>{item.member_count} members</Text>
        </View>
        {item.tags.slice(0, 3).map((tag) => (
          <View key={tag} style={[styles.tag, { backgroundColor: Colors.brand + "18" }]}>
            <Text style={[styles.tagText, { color: Colors.brand }]}>{tag}</Text>
          </View>
        ))}
        <TouchableOpacity
          style={[styles.joinBtn, { backgroundColor: item.is_member ? colors.backgroundTertiary : Colors.brand }]}
          onPress={() => joinCommunity(item)}
          disabled={item.is_member || joining === item.id}
        >
          {joining === item.id ? <ActivityIndicator color="#fff" size="small" /> : (
            <Text style={[styles.joinBtnText, { color: item.is_member ? colors.textMuted : "#fff" }]}>
              {item.is_member ? "Joined ✓" : "Join"}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Paid Communities</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {(["browse", "mine", "create"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && { borderBottomColor: Colors.brand, borderBottomWidth: 2 }]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, { color: tab === t ? Colors.brand : colors.textMuted }]}>
              {t === "browse" ? "Browse" : t === "mine" ? "My Communities" : "+ Create"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "create" ? (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
          <Text style={[styles.createTitle, { color: colors.text }]}>Create a Paid Community</Text>
          <View style={[styles.field, { backgroundColor: colors.surface }]}>
            <TextInput style={[styles.fieldInput, { color: colors.text }]} placeholder="Emoji (e.g. 🏰)" placeholderTextColor={colors.textMuted} value={createEmoji} onChangeText={setCreateEmoji} maxLength={4} />
          </View>
          <View style={[styles.field, { backgroundColor: colors.surface }]}>
            <TextInput style={[styles.fieldInput, { color: colors.text }]} placeholder="Community name" placeholderTextColor={colors.textMuted} value={createName} onChangeText={setCreateName} maxLength={60} />
          </View>
          <View style={[styles.field, { backgroundColor: colors.surface, height: 100, alignItems: "flex-start", paddingTop: 14 }]}>
            <TextInput style={[styles.fieldInput, { color: colors.text }]} placeholder="Description (optional)" placeholderTextColor={colors.textMuted} value={createDesc} onChangeText={setCreateDesc} multiline numberOfLines={3} />
          </View>
          <View style={[styles.field, { backgroundColor: colors.surface }]}>
            <Ionicons name="wallet-outline" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
            <TextInput style={[styles.fieldInput, { color: colors.text }]} placeholder="Entry price in ACoin" placeholderTextColor={colors.textMuted} value={createPrice} onChangeText={setCreatePrice} keyboardType="number-pad" />
            <Text style={{ color: colors.textMuted, fontFamily: "Inter_500Medium" }}>ACoin</Text>
          </View>
          <View style={[styles.field, { backgroundColor: colors.surface }]}>
            <TextInput style={[styles.fieldInput, { color: colors.text }]} placeholder="Tags (comma-separated)" placeholderTextColor={colors.textMuted} value={createTags} onChangeText={setCreateTags} />
          </View>
          <TouchableOpacity style={[styles.createBtn, { backgroundColor: Colors.brand, opacity: creating ? 0.7 : 1 }]} onPress={createCommunity} disabled={creating}>
            {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Launch Community</Text>}
          </TouchableOpacity>
        </ScrollView>
      ) : loading ? (
        <ActivityIndicator color={Colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={tab === "mine" ? myCommunities : communities}
          keyExtractor={(item) => item.id}
          renderItem={renderCommunityCard}
          contentContainerStyle={{ gap: 8, padding: 12, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 48 }}>🏰</Text>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {tab === "mine" ? "No communities yet" : "No communities yet"}
              </Text>
              <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                {tab === "mine" ? "Create or join a community" : "Be the first to create one"}
              </Text>
              <TouchableOpacity style={[styles.createBtn, { backgroundColor: Colors.brand }]} onPress={() => setTab("create")}>
                <Text style={styles.createBtnText}>Create Community</Text>
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
  headerTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  tabBar: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  card: { borderRadius: 16, padding: 16 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  cardEmojiWrap: { width: 48, height: 48, borderRadius: 14, backgroundColor: "#BF5AF215", alignItems: "center", justifyContent: "center" },
  cardEmoji: { fontSize: 26 },
  cardName: { fontSize: 16, fontFamily: "Inter_700Bold" },
  cardCreator: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  pricePill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  priceText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  cardDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, marginBottom: 10 },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  memberCount: { flexDirection: "row", alignItems: "center", gap: 4, marginRight: 4 },
  memberText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  tagText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  joinBtn: { marginLeft: "auto" as any, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  joinBtnText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  createTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 4 },
  field: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 14, height: 52, gap: 8 },
  fieldInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  createBtn: { height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 4 },
  createBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  emptyState: { alignItems: "center", paddingVertical: 50, gap: 10 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular" },
});

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
import { Platform } from "react-native";
import Colors from "@/constants/colors";
import { transferAcoin } from "@/lib/monetize";
import { showAlert } from "@/lib/alert";
import { ComingSoonView } from "@/components/ui/ComingSoonView";

type DigitalEvent = {
  id: string;
  title: string;
  description: string;
  emoji: string;
  price: number;
  event_date: string;
  capacity: number;
  tickets_sold: number;
  creator_id: string;
  creator_name: string;
  creator_handle: string;
  has_ticket: boolean;
  category: string;
};

function formatEventDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

export default function DigitalEventsScreen() {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<"browse" | "mine" | "create">("browse");
  const [events, setEvents] = useState<DigitalEvent[]>([]);
  const [myEvents, setMyEvents] = useState<DigitalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);

  const [createTitle, setCreateTitle] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createEmoji, setCreateEmoji] = useState("🎫");
  const [createPrice, setCreatePrice] = useState("50");
  const [createDate, setCreateDate] = useState("");
  const [createCapacity, setCreateCapacity] = useState("100");
  const [createCategory, setCreateCategory] = useState("Online");
  const [creating, setCreating] = useState(false);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("digital_events")
      .select(`id, title, description, emoji, price, event_date, capacity, tickets_sold, creator_id, category, profiles!digital_events_creator_id_fkey(display_name, handle)`)
      .gte("event_date", new Date().toISOString())
      .order("event_date", { ascending: true })
      .limit(30);

    if (data) {
      let ticketSet = new Set<string>();
      if (user) {
        const { data: tickets } = await supabase.from("event_tickets").select("event_id").eq("user_id", user.id);
        ticketSet = new Set((tickets || []).map((t: any) => t.event_id));
      }
      const mapped: DigitalEvent[] = data.map((e: any) => ({
        id: e.id, title: e.title, description: e.description, emoji: e.emoji || "🎫",
        price: e.price, event_date: e.event_date, capacity: e.capacity || 0,
        tickets_sold: e.tickets_sold || 0, creator_id: e.creator_id, category: e.category || "Online",
        creator_name: e.profiles?.display_name || "Organizer",
        creator_handle: e.profiles?.handle || "organizer",
        has_ticket: ticketSet.has(e.id),
      }));
      setEvents(mapped);
      setMyEvents(mapped.filter((e) => e.creator_id === user?.id || e.has_ticket));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  async function buyTicket(event: DigitalEvent) {
    if (!user || !profile) { router.push("/(auth)/login"); return; }
    if (event.has_ticket) return;
    if (event.capacity > 0 && event.tickets_sold >= event.capacity) {
      showAlert("Sold Out", "This event is at capacity."); return;
    }
    if ((profile.acoin || 0) < event.price) {
      showAlert("Not enough ACoin", `Need ${event.price} ACoin.`, [
        { text: "Wallet", onPress: () => router.push("/wallet") }, { text: "Cancel" }
      ]); return;
    }

    setBuying(event.id);
    const result = await transferAcoin({
      buyerId: user.id, sellerId: event.creator_id,
      buyerCurrentAcoin: profile.acoin || 0, amount: event.price,
      transactionType: "monetize_digital_events",
      metadata: { event_id: event.id, event_title: event.title },
    });

    if (result.success) {
      await supabase.from("event_tickets").insert({ event_id: event.id, user_id: user.id });
      await supabase.from("digital_events").update({ tickets_sold: event.tickets_sold + 1 }).eq("id", event.id);
      setEvents((prev) => prev.map((e) => e.id === event.id ? { ...e, has_ticket: true, tickets_sold: e.tickets_sold + 1 } : e));
      showAlert("🎫 Ticket Purchased!", `You're going to ${event.title}!`);
    } else {
      showAlert("Failed", result.error || "Could not purchase ticket");
    }
    setBuying(null);
  }

  async function createEvent() {
    if (!user) return;
    if (!createTitle.trim()) { showAlert("Required", "Enter an event title"); return; }
    if (!createDate.trim()) { showAlert("Required", "Enter an event date (YYYY-MM-DD HH:MM)"); return; }
    const price = parseInt(createPrice);
    if (!price || price < 0) { showAlert("Invalid price", "Enter a valid price (0 for free)"); return; }

    setCreating(true);
    const { error } = await supabase.from("digital_events").insert({
      title: createTitle.trim(), description: createDesc.trim(), emoji: createEmoji,
      price, event_date: new Date(createDate).toISOString(),
      capacity: parseInt(createCapacity) || 0, creator_id: user.id,
      category: createCategory.trim() || "Online", tickets_sold: 0,
    });
    setCreating(false);
    if (error) { showAlert("Error", error.message); return; }
    showAlert("Event Created!", "Your event is now live.");
    setCreateTitle(""); setCreateDesc(""); setCreateDate(""); setCreatePrice("50"); setCreateCapacity("100");
    setTab("mine"); loadEvents();
  }

  const renderEventCard = ({ item }: { item: DigitalEvent }) => {
    const isSoldOut = item.capacity > 0 && item.tickets_sold >= item.capacity;
    const spotsLeft = item.capacity > 0 ? item.capacity - item.tickets_sold : null;
    return (
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.cardTop}>
          <Text style={styles.cardEmoji}>{item.emoji}</Text>
          <View style={[styles.catBadge, { backgroundColor: Colors.brand + "18" }]}>
            <Text style={[styles.catText, { color: Colors.brand }]}>{item.category}</Text>
          </View>
        </View>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{item.title}</Text>
        <Text style={[styles.cardDate, { color: Colors.brand }]}>
          <Ionicons name="calendar-outline" size={13} /> {formatEventDate(item.event_date)}
        </Text>
        {item.description ? <Text style={[styles.cardDesc, { color: colors.textSecondary }]} numberOfLines={2}>{item.description}</Text> : null}
        <Text style={[styles.cardOrganizer, { color: colors.textMuted }]}>by @{item.creator_handle}</Text>
        <View style={styles.cardFooter}>
          {spotsLeft !== null && (
            <Text style={[styles.spotsText, { color: isSoldOut ? "#FF3B30" : colors.textMuted }]}>
              {isSoldOut ? "Sold Out" : `${spotsLeft} spots left`}
            </Text>
          )}
          <View style={{ flex: 1 }} />
          <View style={[styles.pricePill, { backgroundColor: Colors.gold + "22" }]}>
            <Text style={[styles.priceText, { color: Colors.gold }]}>{item.price > 0 ? `${item.price} 🪙` : "Free"}</Text>
          </View>
          <TouchableOpacity
            style={[styles.ticketBtn, { backgroundColor: item.has_ticket ? colors.backgroundTertiary : isSoldOut ? colors.backgroundTertiary : Colors.brand }]}
            onPress={() => buyTicket(item)}
            disabled={item.has_ticket || isSoldOut || buying === item.id}
          >
            {buying === item.id ? <ActivityIndicator color="#fff" size="small" /> : (
              <Text style={[styles.ticketBtnText, { color: item.has_ticket || isSoldOut ? colors.textMuted : "#fff" }]}>
                {item.has_ticket ? "✓ Got Ticket" : isSoldOut ? "Sold Out" : "Get Ticket"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (Platform.OS === "web" && !profile?.is_admin) {
    return <ComingSoonView title="Events" description="Digital Events are coming to web soon. Discover and join events on the mobile app today." />;
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Digital Events</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {(["browse", "mine", "create"] as const).map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && { borderBottomColor: Colors.brand, borderBottomWidth: 2 }]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, { color: tab === t ? Colors.brand : colors.textMuted }]}>
              {t === "browse" ? "Browse" : t === "mine" ? "My Tickets" : "+ Host Event"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "create" ? (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
          <Text style={[styles.createTitle, { color: colors.text }]}>Host a Digital Event</Text>
          {[
            { label: "Emoji", val: createEmoji, set: setCreateEmoji, placeholder: "🎫", type: "default", max: 4 },
            { label: "Event Title", val: createTitle, set: setCreateTitle, placeholder: "What's the event?", type: "default", max: 80 },
            { label: "Category", val: createCategory, set: setCreateCategory, placeholder: "Online / Workshop / AMA", type: "default", max: 40 },
            { label: "Date & Time", val: createDate, set: setCreateDate, placeholder: "YYYY-MM-DD HH:MM", type: "default", max: 20 },
            { label: "Ticket Price (ACoin)", val: createPrice, set: setCreatePrice, placeholder: "0 for free", type: "number-pad" as any, max: 10 },
            { label: "Capacity (0 = unlimited)", val: createCapacity, set: setCreateCapacity, placeholder: "100", type: "number-pad" as any, max: 10 },
          ].map((f) => (
            <View key={f.label}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{f.label}</Text>
              <View style={[styles.field, { backgroundColor: colors.surface }]}>
                <TextInput style={[styles.fieldInput, { color: colors.text }]} placeholder={f.placeholder} placeholderTextColor={colors.textMuted} value={f.val} onChangeText={f.set} keyboardType={f.type as any} maxLength={f.max} />
              </View>
            </View>
          ))}
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Description</Text>
          <View style={[styles.field, { backgroundColor: colors.surface, height: 90, alignItems: "flex-start", paddingTop: 12 }]}>
            <TextInput style={[styles.fieldInput, { color: colors.text }]} placeholder="Describe your event…" placeholderTextColor={colors.textMuted} value={createDesc} onChangeText={setCreateDesc} multiline />
          </View>
          <TouchableOpacity style={[styles.createBtn, { backgroundColor: Colors.brand, opacity: creating ? 0.7 : 1 }]} onPress={createEvent} disabled={creating}>
            {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Create Event</Text>}
          </TouchableOpacity>
        </ScrollView>
      ) : loading ? (
        <ActivityIndicator color={Colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={tab === "mine" ? myEvents : events}
          keyExtractor={(item) => item.id}
          renderItem={renderEventCard}
          contentContainerStyle={{ gap: 8, padding: 12, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 48 }}>🎫</Text>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>{tab === "mine" ? "No events yet" : "No upcoming events"}</Text>
              <TouchableOpacity style={[styles.createBtn, { backgroundColor: Colors.brand }]} onPress={() => setTab("create")}>
                <Text style={styles.createBtnText}>Host an Event</Text>
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
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  cardEmoji: { fontSize: 32 },
  catBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  catText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  cardTitle: { fontSize: 17, fontFamily: "Inter_700Bold", marginBottom: 4 },
  cardDate: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 6 },
  cardDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, marginBottom: 6 },
  cardOrganizer: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 10 },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 8 },
  spotsText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  pricePill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  priceText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  ticketBtn: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20 },
  ticketBtnText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 6 },
  field: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 14, height: 52, gap: 8 },
  fieldInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  createTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 4 },
  createBtn: { height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  createBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  emptyState: { alignItems: "center", paddingVertical: 50, gap: 10 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
});

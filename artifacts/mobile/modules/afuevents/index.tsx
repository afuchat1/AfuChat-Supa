import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image as RNImage,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Image from "@/components/ui/OptimizedImage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { useTheme } from "@/hooks/useTheme";
import { safeRouter } from "@/lib/navUtils";
import { supabase } from "@/lib/supabase";
import { showAlert } from "@/lib/alert";
import Colors from "@/constants/colors";
import { EventCardSkeleton } from "@/components/ui/Skeleton";

type Event = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  cover_url: string | null;
  is_online: boolean;
  attendee_count: number;
  price: number;
  organizer: { display_name: string; avatar_url: string | null } | null;
};

function formatEventDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AfuEventsApp({ initialTab }: { initialTab?: "upcoming" | "online" | "free" }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"upcoming" | "online" | "free">("upcoming");

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("digital_events")
      .select("id,title,description,location,starts_at,ends_at,cover_url,is_online,attendee_count,price,organizer:organizer_id(display_name,avatar_url)")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(30);
    if (tab === "online") query = query.eq("is_online", true);
    if (tab === "free") query = query.eq("price", 0);
    const { data } = await query;
    setEvents((data as unknown as Event[]) || []);
    setLoading(false);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  function renderEvent({ item }: { item: Event }) {
    const freeOrPaid = item.price === 0 ? "Free" : `${item.price} AC`;
    return (
      <TouchableOpacity style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => showAlert(item.title, `${item.description || ""}\n\n📍 ${item.location || (item.is_online ? "Online" : "TBD")}\n🕐 ${formatEventDate(item.starts_at)}\n💰 ${freeOrPaid}`)} activeOpacity={0.8}>
        {item.cover_url ? (
          <Image source={{ uri: item.cover_url }} style={s.cover} resizeMode="cover" />
        ) : (
          <LinearGradient colors={["#FF9500", "#FFCC00"]} style={[s.cover, { alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="calendar" size={36} color="#fff" />
          </LinearGradient>
        )}
        <View style={s.cardBody}>
          <View style={{ flexDirection: "row", gap: 6, marginBottom: 4 }}>
            {item.is_online && (
              <View style={[s.tag, { backgroundColor: "#007AFF18" }]}>
                <Text style={[s.tagText, { color: "#007AFF" }]}>Online</Text>
              </View>
            )}
            <View style={[s.tag, { backgroundColor: item.price === 0 ? "#34C75918" : "#FF950018" }]}>
              <Text style={[s.tagText, { color: item.price === 0 ? "#34C759" : "#FF9500" }]}>{freeOrPaid}</Text>
            </View>
          </View>
          <Text style={[s.cardTitle, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 }}>
            <Ionicons name="calendar-outline" size={13} color={colors.textMuted} />
            <Text style={[s.cardDate, { color: colors.textMuted }]}>{formatEventDate(item.starts_at)}</Text>
          </View>
          {item.location && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 }}>
              <Ionicons name="location-outline" size={13} color={colors.textMuted} />
              <Text style={[s.cardDate, { color: colors.textMuted }]} numberOfLines={1}>{item.location}</Text>
            </View>
          )}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="people-outline" size={13} color={colors.textMuted} />
              <Text style={[s.cardDate, { color: colors.textMuted }]}>{item.attendee_count || 0} attending</Text>
            </View>
            <TouchableOpacity style={[s.rsvpBtn, { backgroundColor: Colors.brand }]}>
              <Text style={s.rsvpText}>RSVP</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
        <View style={[s.header, { borderBottomColor: colors.border, paddingTop: insets.top + 14 }]}>
        <TouchableOpacity onPress={() => safeRouter.back("/apps")} hitSlop={10} style={{ width: 34, height: 40, alignItems: "center", justifyContent: "center" }} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text, flex: 1, textAlign: "center" }]}>Events</Text>
        <TouchableOpacity style={[s.createBtn, { backgroundColor: "#FF9500" }]} onPress={() => showAlert("Create Event", "Event creation coming soon!")}>
          <Ionicons name="add" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
      <View style={[s.tabs, { borderBottomColor: colors.border }]}>
        {(["upcoming", "online", "free"] as const).map(t => (
          <TouchableOpacity key={t} style={[s.tabBtn, tab === t && { borderBottomColor: "#FF9500", borderBottomWidth: 2 }]} onPress={() => setTab(t)}>
            <Text style={[s.tabText, { color: tab === t ? "#FF9500" : colors.textMuted }]}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? (
        <View style={{ padding: 12, gap: 8 }}>
          {[1,2,3,4,5].map(i => <EventCardSkeleton key={i} />)}
        </View>
      ) : events.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="calendar-outline" size={56} color={colors.textMuted} />
          <Text style={[s.emptyTitle, { color: colors.text }]}>No events</Text>
          <Text style={[s.emptySub, { color: colors.textMuted }]}>Check back soon for upcoming events near you.</Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={e => e.id}
          renderItem={renderEvent}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 12 }}
          showsVerticalScrollIndicator={false}
          bounces={false}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  createBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  tabs: { flexDirection: "row" },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 12 },
  tabText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  card: { borderRadius: 16, borderWidth: 0.5, overflow: "hidden" },
  cover: { width: "100%", height: 140 },
  cardBody: { padding: 14 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  cardTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", lineHeight: 22 },
  cardDate: { fontSize: 12, fontFamily: "Inter_400Regular" },
  rsvpBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  rsvpText: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
});

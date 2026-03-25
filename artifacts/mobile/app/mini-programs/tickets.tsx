import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import Colors from "@/constants/colors";
import * as Haptics from "@/lib/haptics";
import { calculateFee, processServiceTransaction } from "@/lib/serviceTransactions";

const EVENTS = [
  { id: "1", name: "Nyege Nyege Festival", date: "Sep 12-15", location: "Jinja", category: "Music", price: 3000, icon: "🎵", color: "#FF6B6B" },
  { id: "2", name: "Comedy Night Live", date: "Mar 28", location: "Kampala", category: "Comedy", price: 500, icon: "😂", color: "#FFD700" },
  { id: "3", name: "Tech Summit Africa", date: "Apr 5-6", location: "Nairobi", category: "Tech", price: 2000, icon: "💻", color: "#2196F3" },
  { id: "4", name: "Football Match", date: "Apr 10", location: "Namboole", category: "Sports", price: 300, icon: "⚽", color: "#4CAF50" },
  { id: "5", name: "Art Exhibition", date: "Apr 15-20", location: "Lagos", category: "Art", price: 800, icon: "🎨", color: "#9C27B0" },
  { id: "6", name: "Food Festival", date: "May 1-3", location: "Kampala", category: "Food", price: 400, icon: "🍽️", color: "#FF9800" },
];

const TICKET_TYPES = [
  { id: "regular", name: "Regular", multiplier: 1 },
  { id: "vip", name: "VIP", multiplier: 2 },
  { id: "vvip", name: "VVIP", multiplier: 4 },
];

export default function TicketsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [selectedEvent, setSelectedEvent] = useState("");
  const [ticketType, setTicketType] = useState("regular");
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);

  const event = EVENTS.find((e) => e.id === selectedEvent);
  const ticket = TICKET_TYPES.find((t) => t.id === ticketType);
  const basePrice = event ? Math.round(event.price * (ticket?.multiplier || 1) * quantity) : 0;
  const fee = basePrice > 0 ? calculateFee("event_ticket", basePrice) : null;

  const handleBuy = async () => {
    if (!user || !event || !ticket) {
      Alert.alert("Error", "Please select an event");
      return;
    }

    setLoading(true);
    const result = await processServiceTransaction(user.id, "event_ticket", basePrice, {
      event_name: event.name,
      event_date: event.date,
      event_location: event.location,
      ticket_type: ticket.name,
      quantity,
    });
    setLoading(false);

    if (result.success) {
      Haptics.notificationAsync("success");
      Alert.alert("Ticket Purchased!", `${quantity}× ${ticket.name} for ${event.name}`, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } else {
      Haptics.notificationAsync("error");
      Alert.alert("Failed", result.error || "Purchase failed");
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Buy Tickets</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={[styles.label, { color: colors.text }]}>Upcoming Events</Text>
        {EVENTS.map((e) => (
          <TouchableOpacity
            key={e.id}
            style={[styles.eventCard, {
              backgroundColor: selectedEvent === e.id ? e.color + "15" : colors.surface,
              borderColor: selectedEvent === e.id ? e.color : colors.border,
            }]}
            onPress={() => { setSelectedEvent(e.id); Haptics.selectionAsync(); }}
          >
            <View style={[styles.eventIcon, { backgroundColor: e.color + "20" }]}>
              <Text style={{ fontSize: 28 }}>{e.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.eventName, { color: colors.text }]}>{e.name}</Text>
              <Text style={[styles.eventDate, { color: colors.textSecondary }]}>
                <Ionicons name="calendar-outline" size={12} /> {e.date}
              </Text>
              <Text style={[styles.eventLocation, { color: colors.textMuted }]}>
                <Ionicons name="location-outline" size={12} /> {e.location}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.eventPrice, { color: e.color }]}>{e.price} 🪙</Text>
              <View style={[styles.catBadge, { backgroundColor: e.color + "20" }]}>
                <Text style={[styles.catText, { color: e.color }]}>{e.category}</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}

        {event && (
          <>
            <Text style={[styles.label, { color: colors.text }]}>Ticket Type</Text>
            <View style={styles.typeRow}>
              {TICKET_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.typeBtn, { backgroundColor: ticketType === t.id ? Colors.brand : colors.surface }]}
                  onPress={() => { setTicketType(t.id); Haptics.selectionAsync(); }}
                >
                  <Text style={[styles.typeName, { color: ticketType === t.id ? "#fff" : colors.text }]}>{t.name}</Text>
                  <Text style={[styles.typePrice, { color: ticketType === t.id ? "rgba(255,255,255,0.7)" : colors.textMuted }]}>
                    {Math.round(event.price * t.multiplier)} 🪙
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.label, { color: colors.text }]}>Quantity</Text>
            <View style={styles.qtyRow}>
              <TouchableOpacity style={[styles.qtyBtn, { backgroundColor: colors.surface }]} onPress={() => setQuantity(Math.max(1, quantity - 1))}>
                <Ionicons name="remove" size={20} color={colors.text} />
              </TouchableOpacity>
              <Text style={[styles.qtyText, { color: colors.text }]}>{quantity}</Text>
              <TouchableOpacity style={[styles.qtyBtn, { backgroundColor: colors.surface }]} onPress={() => setQuantity(Math.min(10, quantity + 1))}>
                <Ionicons name="add" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
          </>
        )}

        {fee && (
          <View style={[styles.feeCard, { backgroundColor: colors.surface }]}>
            <View style={styles.feeRow}>
              <Text style={[styles.feeLabel, { color: colors.textSecondary }]}>{quantity}× {ticket?.name} Ticket</Text>
              <Text style={[styles.feeValue, { color: colors.text }]}>{fee.subtotal} ACoins</Text>
            </View>
            <View style={styles.feeRow}>
              <TouchableOpacity
                style={styles.feeLink}
                onPress={() => router.push({
                  pathname: "/mini-programs/fee-details" as any,
                  params: { service: "event_ticket", amount: fee.subtotal.toString(), fee: fee.feeAmount.toString(), total: fee.total.toString() },
                })}
              >
                <Text style={[styles.feeLinkText, { color: Colors.brand }]}>Service Fee ({fee.feePercent}%)</Text>
                <Ionicons name="information-circle-outline" size={14} color={Colors.brand} />
              </TouchableOpacity>
              <Text style={[styles.feeValue, { color: "#FF9800" }]}>+{fee.feeAmount} ACoins</Text>
            </View>
            <View style={[styles.feeDivider, { backgroundColor: colors.border }]} />
            <View style={styles.feeRow}>
              <Text style={[styles.feeTotalLabel, { color: colors.text }]}>Total</Text>
              <Text style={[styles.feeTotalValue, { color: Colors.brand }]}>{fee.total} ACoins</Text>
            </View>
          </View>
        )}

        {event && (
          <TouchableOpacity
            style={[styles.buyBtn, { backgroundColor: Colors.brand, opacity: loading ? 0.5 : 1 }]}
            onPress={handleBuy}
            disabled={loading}
          >
            <Text style={styles.buyBtnText}>{loading ? "Processing..." : "Buy Ticket"}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  content: { padding: 16, gap: 12 },
  label: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  eventCard: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 14, borderWidth: 1.5, gap: 10 },
  eventIcon: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  eventName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  eventDate: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  eventLocation: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  eventPrice: { fontSize: 15, fontFamily: "Inter_700Bold" },
  catBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginTop: 4 },
  catText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  typeRow: { flexDirection: "row", gap: 8 },
  typeBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", gap: 2 },
  typeName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  typePrice: { fontSize: 12, fontFamily: "Inter_400Regular" },
  qtyRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 20 },
  qtyBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  qtyText: { fontSize: 24, fontFamily: "Inter_700Bold" },
  feeCard: { borderRadius: 14, padding: 16, gap: 10 },
  feeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  feeLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  feeValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  feeLink: { flexDirection: "row", alignItems: "center", gap: 4 },
  feeLinkText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  feeDivider: { height: StyleSheet.hairlineWidth },
  feeTotalLabel: { fontSize: 16, fontFamily: "Inter_700Bold" },
  feeTotalValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  buyBtn: { borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  buyBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
});

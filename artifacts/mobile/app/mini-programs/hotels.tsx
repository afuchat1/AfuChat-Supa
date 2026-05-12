import React, { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { showAlert } from "@/lib/alert";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import Colors from "@/constants/colors";
import * as Haptics from "@/lib/haptics";
import { calculateFee, processServiceTransaction } from "@/lib/serviceTransactions";

const HOTELS = [
  { id: "1", name: "Grand Palace Hotel", location: "Kampala", rating: 4.8, price: 5000, image: "🏨" },
  { id: "2", name: "Serena Hotel", location: "Nairobi", rating: 4.7, price: 7500, image: "🏰" },
  { id: "3", name: "Pearl Continental", location: "Lagos", rating: 4.5, price: 4000, image: "🏢" },
  { id: "4", name: "Hilton Garden", location: "Dar es Salaam", rating: 4.6, price: 6000, image: "🌴" },
  { id: "5", name: "Budget Inn", location: "Entebbe", rating: 4.2, price: 1500, image: "🛏️" },
  { id: "6", name: "Lake View Resort", location: "Jinja", rating: 4.9, price: 8000, image: "🌊" },
];

const ROOM_TYPES = [
  { id: "single", name: "Single", multiplier: 1 },
  { id: "double", name: "Double", multiplier: 1.5 },
  { id: "suite", name: "Suite", multiplier: 2.5 },
];

export default function HotelsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [selectedHotel, setSelectedHotel] = useState("");
  const [roomType, setRoomType] = useState("single");
  const [nights, setNights] = useState("1");
  const [guests, setGuests] = useState("1");
  const [loading, setLoading] = useState(false);

  const hotel = HOTELS.find((h) => h.id === selectedHotel);
  const room = ROOM_TYPES.find((r) => r.id === roomType);
  const numNights = Math.max(1, parseInt(nights) || 1);
  const basePrice = hotel ? Math.round(hotel.price * (room?.multiplier || 1) * numNights) : 0;
  const fee = basePrice > 0 ? calculateFee("hotel_booking", basePrice) : null;

  const handleBook = async () => {
    if (!user || !hotel || !room) {
      showAlert("Error", "Please select a hotel and room type");
      return;
    }

    setLoading(true);
    const result = await processServiceTransaction(user.id, "hotel_booking", basePrice, {
      hotel_name: hotel.name,
      hotel_location: hotel.location,
      room_type: room.name,
      nights: numNights,
      guests: parseInt(guests) || 1,
      check_in: new Date().toISOString().split("T")[0],
    });
    setLoading(false);

    if (result.success) {
      Haptics.notificationAsync("success");
      showAlert("Booked!", `${hotel.name} - ${room.name} room for ${numNights} night(s)`, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } else {
      Haptics.notificationAsync("error");
      showAlert("Failed", result.error || "Booking failed");
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="Book Hotel" />

      <KeyboardAwareScrollViewCompat contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={[styles.label, { color: colors.text }]}>Available Hotels</Text>
        {HOTELS.map((h) => (
          <TouchableOpacity
            key={h.id}
            style={[styles.hotelCard, {
              backgroundColor: selectedHotel === h.id ? colors.accent + "10" : colors.surface,
              borderColor: selectedHotel === h.id ? colors.accent : colors.border,
            }]}
            onPress={() => { setSelectedHotel(h.id); Haptics.selectionAsync(); }}
          >
            <Text style={styles.hotelImage}>{h.image}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.hotelName, { color: colors.text }]}>{h.name}</Text>
              <Text style={[styles.hotelLocation, { color: colors.textSecondary }]}>
                <Ionicons name="location-outline" size={12} /> {h.location}
              </Text>
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={12} color="#FFD60A" />
                <Text style={[styles.ratingText, { color: colors.textMuted }]}>{h.rating}</Text>
              </View>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.hotelPrice, { color: colors.accent }]}>{h.price} 🪙</Text>
              <Text style={[styles.perNight, { color: colors.textMuted }]}>per night</Text>
            </View>
          </TouchableOpacity>
        ))}

        {hotel && (
          <>
            <Text style={[styles.label, { color: colors.text }]}>Room Type</Text>
            <View style={styles.roomRow}>
              {ROOM_TYPES.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  style={[styles.roomBtn, {
                    backgroundColor: roomType === r.id ? colors.accent : colors.surface,
                  }]}
                  onPress={() => { setRoomType(r.id); Haptics.selectionAsync(); }}
                >
                  <Text style={[styles.roomText, { color: roomType === r.id ? "#fff" : colors.text }]}>{r.name}</Text>
                  <Text style={[styles.roomMult, { color: roomType === r.id ? "rgba(255,255,255,0.7)" : colors.textMuted }]}>×{r.multiplier}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.detailsRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.text }]}>Nights</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.input, { color: colors.text, textAlign: "center" }]}
                    value={nights}
                    onChangeText={setNights}
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.text }]}>Guests</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.input, { color: colors.text, textAlign: "center" }]}
                    value={guests}
                    onChangeText={setGuests}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                </View>
              </View>
            </View>
          </>
        )}

        {fee && (
          <View style={[styles.feeCard, { backgroundColor: colors.surface }]}>
            <View style={styles.feeRow}>
              <Text style={[styles.feeLabel, { color: colors.textSecondary }]}>{hotel?.name} ({room?.name} × {numNights})</Text>
              <Text style={[styles.feeValue, { color: colors.text }]}>{fee.subtotal} 🪙</Text>
            </View>
            <View style={styles.feeRow}>
              <TouchableOpacity
                style={styles.feeLink}
                onPress={() => router.push({
                  pathname: "/mini-programs/fee-details" as any,
                  params: { service: "hotel_booking", amount: fee.subtotal.toString(), fee: fee.feeAmount.toString(), total: fee.total.toString() },
                })}
              >
                <Text style={[styles.feeLinkText, { color: colors.accent }]}>Booking Fee ({fee.feePercent}%)</Text>
                <Ionicons name="information-circle-outline" size={14} color={colors.accent} />
              </TouchableOpacity>
              <Text style={[styles.feeValue, { color: "#FF9800" }]}>+{fee.feeAmount} 🪙</Text>
            </View>
            <View style={[styles.feeDivider, { backgroundColor: colors.border }]} />
            <View style={styles.feeRow}>
              <Text style={[styles.feeTotalLabel, { color: colors.text }]}>Total</Text>
              <Text style={[styles.feeTotalValue, { color: colors.accent }]}>{fee.total} ACoins</Text>
            </View>
          </View>
        )}

        {hotel && (
          <TouchableOpacity
            style={[styles.bookBtn, { backgroundColor: colors.accent, opacity: loading ? 0.5 : 1 }]}
            onPress={handleBook}
            disabled={loading}
          >
            <Text style={styles.bookBtnText}>{loading ? "Booking..." : "Book Now"}</Text>
          </TouchableOpacity>
        )}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  content: { padding: 16, gap: 12 },
  label: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  hotelCard: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14, borderWidth: 1.5, gap: 12 },
  hotelImage: { fontSize: 36 },
  hotelName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  hotelLocation: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4 },
  ratingText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  hotelPrice: { fontSize: 16, fontFamily: "Inter_700Bold" },
  perNight: { fontSize: 10, fontFamily: "Inter_400Regular" },
  roomRow: { flexDirection: "row", gap: 8 },
  roomBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", gap: 2 },
  roomText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  roomMult: { fontSize: 11, fontFamily: "Inter_400Regular" },
  detailsRow: { flexDirection: "row", gap: 12 },
  inputWrap: { borderRadius: 12, overflow: "hidden" },
  input: { fontSize: 18, fontFamily: "Inter_600SemiBold", paddingVertical: 12, paddingHorizontal: 14 },
  feeCard: { borderRadius: 14, padding: 16, gap: 10 },
  feeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  feeLabel: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  feeValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  feeLink: { flexDirection: "row", alignItems: "center", gap: 4 },
  feeLinkText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  feeDivider: { height: StyleSheet.hairlineWidth },
  feeTotalLabel: { fontSize: 16, fontFamily: "Inter_700Bold" },
  feeTotalValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  bookBtn: { borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  bookBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
});

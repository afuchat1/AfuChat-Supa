import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import {
  ShopOrder,
  OrderMessage,
  ShopReview,
  ORDER_STATUS_LABELS,
  ESCROW_STATUS_LABELS,
  getOrderById,
  getOrderMessages,
  markMessagesRead,
  sendOrderMessage,
  confirmDelivery,
  raiseDispute,
  submitReview,
  formatShopAcoin,
  PLATFORM_FEE_PCT,
} from "@/lib/shop";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { Avatar } from "@/components/ui/Avatar";

const BRAND = "#00BCD4";
const GOLD = "#D4A853";
const SUCCESS = "#34C759";
const DANGER = "#FF3B30";

function StarRow({ rating, setRating, interactive = true }: { rating: number; setRating?: (n: number) => void; interactive?: boolean }) {
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <TouchableOpacity key={n} onPress={() => interactive && setRating?.(n)} disabled={!interactive} activeOpacity={0.7}>
          <Ionicons name={n <= rating ? "star" : "star-outline"} size={28} color={n <= rating ? GOLD : "#ccc"} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

function ChatBubble({ msg, isMine }: { msg: OrderMessage; isMine: boolean }) {
  const { colors } = useTheme();
  const isSystem = msg.message.startsWith("✅") || msg.message.startsWith("⚠️") || msg.message.startsWith("💰") || msg.message.startsWith("Order placed");
  const time = new Date(msg.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

  if (isSystem) {
    return (
      <View style={sb.systemWrap}>
        <View style={[sb.systemBubble, { backgroundColor: BRAND + "12", borderColor: BRAND + "25" }]}>
          <Text style={{ color: BRAND, fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 }}>
            {msg.message}
          </Text>
        </View>
        <Text style={[sb.msgTime, { color: colors.textMuted, textAlign: "center" }]}>{time}</Text>
      </View>
    );
  }

  return (
    <View style={[sb.bubbleRow, isMine && sb.bubbleRowMine]}>
      {!isMine && (
        <View style={[sb.avatarDot, { backgroundColor: BRAND + "22" }]}>
          <Ionicons name="storefront" size={12} color={BRAND} />
        </View>
      )}
      <View style={{ maxWidth: "72%", gap: 3 }}>
        <View style={[sb.bubble, isMine ? { backgroundColor: BRAND } : { backgroundColor: colors.surface }]}>
          <Text style={{ color: isMine ? "#fff" : colors.text, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 }}>
            {msg.message}
          </Text>
        </View>
        <Text style={[sb.msgTime, { color: colors.textMuted, textAlign: isMine ? "right" : "left" }]}>{time}</Text>
      </View>
    </View>
  );
}

export default function OrderDetailScreen() {
  const { id: orderId } = useLocalSearchParams<{ id: string }>();
  const { user, profile, refreshProfile } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const [order, setOrder] = useState<ShopOrder | null>(null);
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "chat">("details");

  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [submittingDispute, setSubmittingDispute] = useState(false);

  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [hasReviewed, setHasReviewed] = useState(false);

  const isBuyer = order?.buyer_id === user?.id;
  const isSeller = order?.seller_id === user?.id;

  const load = useCallback(async () => {
    if (!orderId) return;
    const [ord, msgs] = await Promise.all([
      getOrderById(orderId),
      getOrderMessages(orderId),
    ]);
    setOrder(ord);
    setMessages(msgs);
    setLoading(false);
    if (user && ord) {
      markMessagesRead(orderId, user.id);
      const { data: existingReview } = await supabase
        .from("shop_reviews").select("id").eq("order_id", orderId).eq("reviewer_id", user.id).maybeSingle();
      setHasReviewed(!!existingReview);
    }
  }, [orderId, user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!orderId) return;
    const channel = supabase
      .channel(`order_msgs_${orderId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "shop_order_messages", filter: `order_id=eq.${orderId}` },
        (payload) => {
          setMessages(prev => {
            const exists = prev.find(m => m.id === (payload.new as OrderMessage).id);
            if (exists) return prev;
            const newMsg = payload.new as OrderMessage;
            if (user) markMessagesRead(orderId, user.id);
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
            return [...prev, newMsg];
          });
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orderId, user]);

  useEffect(() => {
    if (activeTab === "chat") {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 200);
    }
  }, [activeTab]);

  async function handleSendMessage() {
    const text = messageText.trim();
    if (!text || !user || !orderId) return;
    setSending(true);
    setMessageText("");
    const { error } = await sendOrderMessage({ orderId, senderId: user.id, message: text });
    if (error) {
      setMessageText(text);
      showAlert("Error", "Failed to send message. Please try again.");
    }
    setSending(false);
  }

  async function handleConfirmDelivery() {
    if (!user || !order) return;
    showAlert(
      "Confirm Delivery?",
      `By confirming, you're saying you received your order. ${formatShopAcoin(order.escrowed_acoin)} will be released to the seller immediately. This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm & Release", style: "destructive",
          onPress: async () => {
            setConfirming(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const result = await confirmDelivery({ orderId: order.id, buyerId: user.id });
            if (result.success) {
              await load();
              await refreshProfile();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              showAlert("Payment Released", "Thank you! The seller has been paid. Would you like to leave a review?", [
                { text: "Later", style: "cancel" },
                { text: "Leave Review", onPress: () => setShowReviewModal(true) },
              ]);
            } else {
              showAlert("Error", result.error || "Failed to confirm delivery. Please contact support.");
            }
            setConfirming(false);
          },
        },
      ]
    );
  }

  async function handleSubmitDispute() {
    if (!disputeReason.trim() || !user || !order) return;
    setSubmittingDispute(true);
    const result = await raiseDispute({ orderId: order.id, buyerId: user.id, reason: disputeReason.trim() });
    if (result.success) {
      setShowDisputeModal(false);
      setDisputeReason("");
      await load();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      showAlert("Dispute Opened", "Our support team will review your case within 24 hours. Your payment remains held in escrow.");
    } else {
      showAlert("Error", result.error || "Failed to raise dispute.");
    }
    setSubmittingDispute(false);
  }

  async function handleSubmitReview() {
    if (!user || !order) return;
    setSubmittingReview(true);
    const result = await submitReview({
      orderId: order.id,
      reviewerId: user.id,
      shopId: order.shop_id,
      productId: order.items?.[0]?.product_id,
      rating: reviewRating,
      reviewText: reviewText.trim() || undefined,
    });
    if (result.success) {
      setShowReviewModal(false);
      setHasReviewed(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert("Review Submitted", "Thank you for your feedback!");
    } else {
      showAlert("Error", result.error || "Failed to submit review.");
    }
    setSubmittingReview(false);
  }

  if (loading) {
    return (
      <View style={[st.root, { backgroundColor: colors.backgroundSecondary }]}>
        <View style={[st.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={[st.headerTitle, { color: colors.text }]}>Order Detail</Text>
        </View>
        <ActivityIndicator color={BRAND} style={{ marginTop: 60 }} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[st.root, { backgroundColor: colors.backgroundSecondary, alignItems: "center", justifyContent: "center" }]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.textMuted} />
        <Text style={[{ color: colors.text, fontSize: 16, fontFamily: "Inter_500Medium", marginTop: 12 }]}>Order not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20, padding: 12 }}>
          <Text style={{ color: BRAND, fontFamily: "Inter_600SemiBold" }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusMeta = ORDER_STATUS_LABELS[order.status] || ORDER_STATUS_LABELS.pending;
  const escrowMeta = ESCROW_STATUS_LABELS[order.escrow_status] || ESCROW_STATUS_LABELS.held;
  const fee = Math.ceil(order.total_acoin * PLATFORM_FEE_PCT / 100);
  const canConfirm = isBuyer && order.escrow_status === "held" && ["shipped", "processing", "paid"].includes(order.status);
  const canDispute = isBuyer && order.escrow_status === "held" && order.status !== "cancelled";
  const canReview = isBuyer && order.escrow_status === "released" && !hasReviewed;
  const otherParty = isBuyer ? order.seller_profile : order.buyer_profile;

  return (
    <View style={[st.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[st.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[st.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {order.shop?.name || "Order"}
          </Text>
          <Text style={[{ color: colors.textMuted, fontSize: 11, fontFamily: "Inter_400Regular" }]}>
            #{order.id.slice(0, 8).toUpperCase()}
          </Text>
        </View>
        <View style={[st.statusChip, { backgroundColor: statusMeta.color + "15" }]}>
          <Ionicons name={statusMeta.icon as any} size={13} color={statusMeta.color} />
          <Text style={{ color: statusMeta.color, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{statusMeta.label}</Text>
        </View>
      </View>

      {/* Tab bar */}
      <View style={[st.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {(["details", "chat"] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[st.tab, activeTab === t && { borderBottomColor: BRAND, borderBottomWidth: 2 }]}
            onPress={() => { setActiveTab(t); Haptics.selectionAsync(); }}
          >
            <Text style={{ color: activeTab === t ? BRAND : colors.textSecondary, fontFamily: activeTab === t ? "Inter_600SemiBold" : "Inter_400Regular", fontSize: 14 }}>
              {t === "details" ? "Order Details" : "Messages"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === "details" ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
          {/* Escrow status card */}
          <View style={[st.escrowCard, { backgroundColor: escrowMeta.color + "10", borderColor: escrowMeta.color + "25" }]}>
            <Ionicons name={escrowMeta.icon as any} size={26} color={escrowMeta.color} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: escrowMeta.color, fontFamily: "Inter_700Bold", fontSize: 14 }}>
                {escrowMeta.label} — {formatShopAcoin(order.escrow_status === "held" ? order.escrowed_acoin : order.total_acoin)}
              </Text>
              <Text style={{ color: escrowMeta.color, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17, opacity: 0.85 }}>
                {escrowMeta.desc}
              </Text>
            </View>
          </View>

          {/* Action buttons for buyer */}
          {isBuyer && (
            <View style={st.actionsRow}>
              {canConfirm && (
                <TouchableOpacity
                  style={[st.actionBtn, { backgroundColor: SUCCESS }]}
                  onPress={handleConfirmDelivery}
                  disabled={confirming}
                  activeOpacity={0.85}
                >
                  {confirming
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Ionicons name="checkmark-done" size={18} color="#fff" />}
                  <Text style={st.actionBtnText}>Confirm Delivery</Text>
                </TouchableOpacity>
              )}
              {canDispute && (
                <TouchableOpacity
                  style={[st.actionBtn, { backgroundColor: DANGER }]}
                  onPress={() => setShowDisputeModal(true)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="alert-circle-outline" size={18} color="#fff" />
                  <Text style={st.actionBtnText}>Raise Dispute</Text>
                </TouchableOpacity>
              )}
              {canReview && (
                <TouchableOpacity
                  style={[st.actionBtn, { backgroundColor: GOLD }]}
                  onPress={() => setShowReviewModal(true)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="star-outline" size={18} color="#fff" />
                  <Text style={st.actionBtnText}>Leave Review</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Order summary */}
          <View style={[st.section, { backgroundColor: colors.surface }]}>
            <Text style={[st.sectionTitle, { color: colors.text }]}>Order Summary</Text>
            {(order.items || []).map(item => (
              <View key={item.id} style={st.itemRow}>
                {(item.product?.images?.[0] || item.snapshot_image)
                  ? <Image source={{ uri: item.product?.images?.[0] || item.snapshot_image! }} style={st.itemImg} />
                  : (
                    <View style={[st.itemImg, { backgroundColor: colors.backgroundSecondary, alignItems: "center", justifyContent: "center" }]}>
                      <Ionicons name="cube-outline" size={18} color={colors.textMuted} />
                    </View>
                  )}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[st.itemName, { color: colors.text }]} numberOfLines={2}>
                    {item.product?.name || item.snapshot_name || "Item"}
                  </Text>
                  <Text style={[st.itemQty, { color: colors.textMuted }]}>Qty: {item.quantity}</Text>
                </View>
                <Text style={[st.itemPrice, { color: BRAND }]}>{formatShopAcoin(item.unit_price_acoin * item.quantity)}</Text>
              </View>
            ))}
            <View style={[st.divider, { backgroundColor: colors.border }]} />
            <View style={st.totalRow}>
              <Text style={[st.totalLabel, { color: colors.textSecondary }]}>Subtotal</Text>
              <Text style={[st.totalVal, { color: colors.text }]}>{formatShopAcoin(order.total_acoin)}</Text>
            </View>
            <View style={st.totalRow}>
              <Text style={[st.totalLabel, { color: colors.textSecondary }]}>Platform fee ({PLATFORM_FEE_PCT}%)</Text>
              <Text style={[st.totalVal, { color: colors.textMuted }]}>-{formatShopAcoin(fee)}</Text>
            </View>
            <View style={st.totalRow}>
              <Text style={[st.totalLabel, { color: colors.text, fontFamily: "Inter_600SemiBold" }]}>Seller receives</Text>
              <Text style={[st.totalVal, { color: SUCCESS, fontFamily: "Inter_700Bold" }]}>{formatShopAcoin(order.escrowed_acoin)}</Text>
            </View>
          </View>

          {/* Counterparty info */}
          <View style={[st.section, { backgroundColor: colors.surface }]}>
            <Text style={[st.sectionTitle, { color: colors.text }]}>{isBuyer ? "Seller" : "Buyer"}</Text>
            <TouchableOpacity
              style={st.personRow}
              onPress={() => {
                const id = isBuyer ? order.seller_id : order.buyer_id;
                router.push(`/contact/${id}` as any);
              }}
              activeOpacity={0.8}
            >
              <Avatar
                uri={otherParty?.avatar_url}
                size={44}
                name={otherParty?.display_name || "?"}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[{ color: colors.text, fontFamily: "Inter_600SemiBold", fontSize: 14 }]}>
                  {otherParty?.display_name || "Unknown"}
                </Text>
                <Text style={[{ color: colors.textMuted, fontSize: 12 }]}>@{otherParty?.handle || ""}</Text>
              </View>
              <TouchableOpacity
                style={[st.chatBtn, { backgroundColor: BRAND + "15", borderColor: BRAND + "30" }]}
                onPress={() => { setActiveTab("chat"); Haptics.selectionAsync(); }}
              >
                <Ionicons name="chatbubble-outline" size={15} color={BRAND} />
                <Text style={{ color: BRAND, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Message</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </View>

          {/* Delivery note */}
          {order.delivery_note && (
            <View style={[st.section, { backgroundColor: colors.surface }]}>
              <Text style={[st.sectionTitle, { color: colors.text }]}>Delivery Note</Text>
              <Text style={[{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }]}>{order.delivery_note}</Text>
            </View>
          )}

          {/* Dispute reason */}
          {order.dispute_reason && (
            <View style={[st.section, { backgroundColor: DANGER + "08", borderColor: DANGER + "25", borderWidth: 1 }]}>
              <Text style={[st.sectionTitle, { color: DANGER }]}>Dispute Details</Text>
              <Text style={[{ color: DANGER, fontSize: 14, lineHeight: 20, opacity: 0.85 }]}>{order.dispute_reason}</Text>
            </View>
          )}

          {/* Timeline */}
          <View style={[st.section, { backgroundColor: colors.surface }]}>
            <Text style={[st.sectionTitle, { color: colors.text }]}>Timeline</Text>
            <View style={st.timelineItem}>
              <View style={[st.timelineDot, { backgroundColor: BRAND }]} />
              <View style={{ flex: 1 }}>
                <Text style={[{ color: colors.text, fontFamily: "Inter_500Medium", fontSize: 13 }]}>Order placed</Text>
                <Text style={[{ color: colors.textMuted, fontSize: 11 }]}>{new Date(order.created_at).toLocaleString()}</Text>
              </View>
            </View>
            {order.seller_confirmed_at && (
              <View style={st.timelineItem}>
                <View style={[st.timelineDot, { backgroundColor: "#AF52DE" }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[{ color: colors.text, fontFamily: "Inter_500Medium", fontSize: 13 }]}>Seller confirmed shipment</Text>
                  <Text style={[{ color: colors.textMuted, fontSize: 11 }]}>{new Date(order.seller_confirmed_at).toLocaleString()}</Text>
                </View>
              </View>
            )}
            {order.buyer_confirmed_at && (
              <View style={st.timelineItem}>
                <View style={[st.timelineDot, { backgroundColor: SUCCESS }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[{ color: colors.text, fontFamily: "Inter_500Medium", fontSize: 13 }]}>Delivery confirmed — funds released</Text>
                  <Text style={[{ color: colors.textMuted, fontSize: 11 }]}>{new Date(order.buyer_confirmed_at).toLocaleString()}</Text>
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      ) : (
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={0}>
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16, gap: 8, flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          >
            {messages.length === 0 && (
              <View style={{ alignItems: "center", paddingTop: 40, gap: 10 }}>
                <Ionicons name="chatbubbles-outline" size={40} color={colors.textMuted} />
                <Text style={[{ color: colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center" }]}>
                  No messages yet.{"\n"}Ask the seller a question or get an update on your order.
                </Text>
              </View>
            )}
            {messages.map(msg => (
              <ChatBubble key={msg.id} msg={msg} isMine={msg.sender_id === user?.id} />
            ))}
          </ScrollView>

          <View style={[st.chatInput, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom || 12 }]}>
            <TextInput
              style={[st.chatTextInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              placeholder="Type a message…"
              placeholderTextColor={colors.textMuted}
              value={messageText}
              onChangeText={setMessageText}
              multiline
              maxLength={1000}
              returnKeyType="send"
              onSubmitEditing={handleSendMessage}
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={[st.sendBtn, { backgroundColor: messageText.trim() ? BRAND : colors.inputBg }]}
              onPress={handleSendMessage}
              disabled={!messageText.trim() || sending}
              activeOpacity={0.8}
            >
              {sending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="send" size={18} color={messageText.trim() ? "#fff" : colors.textMuted} />}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Dispute Modal */}
      <Modal visible={showDisputeModal} transparent animationType="slide" onRequestClose={() => setShowDisputeModal(false)}>
        <View style={st.modalOverlay}>
          <View style={[st.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={st.modalHandle} />
            <View style={[st.modalIconWrap, { backgroundColor: DANGER + "15" }]}>
              <Ionicons name="alert-circle" size={32} color={DANGER} />
            </View>
            <Text style={[st.modalTitle, { color: colors.text }]}>Raise a Dispute</Text>
            <Text style={[st.modalSub, { color: colors.textSecondary }]}>
              Describe your issue clearly. Your payment remains safely held in escrow while we review. Our team responds within 24 hours.
            </Text>
            <TextInput
              style={[st.disputeInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              placeholder="Describe the issue (e.g. item not received, item damaged, not as described)…"
              placeholderTextColor={colors.textMuted}
              value={disputeReason}
              onChangeText={setDisputeReason}
              multiline
              numberOfLines={5}
              maxLength={500}
            />
            <Text style={[{ color: colors.textMuted, fontSize: 11, alignSelf: "flex-end" }]}>{disputeReason.length}/500</Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
              <TouchableOpacity style={[st.modalBtn, { flex: 1, backgroundColor: colors.backgroundSecondary }]} onPress={() => setShowDisputeModal(false)}>
                <Text style={{ color: colors.text, fontFamily: "Inter_600SemiBold" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.modalBtn, { flex: 2, backgroundColor: DANGER, opacity: disputeReason.trim().length < 15 || submittingDispute ? 0.5 : 1 }]}
                onPress={handleSubmitDispute}
                disabled={disputeReason.trim().length < 15 || submittingDispute}
              >
                {submittingDispute
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold" }}>Submit Dispute</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Review Modal */}
      <Modal visible={showReviewModal} transparent animationType="slide" onRequestClose={() => setShowReviewModal(false)}>
        <View style={st.modalOverlay}>
          <View style={[st.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={st.modalHandle} />
            <View style={[st.modalIconWrap, { backgroundColor: GOLD + "20" }]}>
              <Ionicons name="star" size={32} color={GOLD} />
            </View>
            <Text style={[st.modalTitle, { color: colors.text }]}>Rate Your Purchase</Text>
            <Text style={[st.modalSub, { color: colors.textSecondary }]}>Your review helps other buyers and rewards great sellers.</Text>
            <View style={{ alignItems: "center", paddingVertical: 8 }}>
              <StarRow rating={reviewRating} setRating={setReviewRating} interactive />
              <Text style={[{ color: colors.textMuted, fontSize: 12, marginTop: 6, fontFamily: "Inter_500Medium" }]}>
                {["", "Poor", "Fair", "Good", "Very Good", "Excellent"][reviewRating]}
              </Text>
            </View>
            <TextInput
              style={[st.disputeInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              placeholder="Share your experience (optional)…"
              placeholderTextColor={colors.textMuted}
              value={reviewText}
              onChangeText={setReviewText}
              multiline
              numberOfLines={3}
              maxLength={400}
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <TouchableOpacity style={[st.modalBtn, { flex: 1, backgroundColor: colors.backgroundSecondary }]} onPress={() => setShowReviewModal(false)}>
                <Text style={{ color: colors.text, fontFamily: "Inter_600SemiBold" }}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.modalBtn, { flex: 2, backgroundColor: GOLD, opacity: submittingReview ? 0.5 : 1 }]}
                onPress={handleSubmitReview}
                disabled={submittingReview}
              >
                {submittingReview
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ color: "#fff", fontFamily: "Inter_700Bold" }}>Submit Review</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const sb = StyleSheet.create({
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  bubbleRowMine: { flexDirection: "row-reverse" },
  avatarDot: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, minWidth: 60 },
  msgTime: { fontSize: 10, fontFamily: "Inter_400Regular", marginHorizontal: 4 },
  systemWrap: { alignItems: "center", paddingHorizontal: 16 },
  systemBubble: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, borderWidth: 1 },
});

const st = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  statusChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
  },
  tabBar: {
    flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: "transparent" },
  escrowCard: {
    flexDirection: "row", gap: 12, alignItems: "flex-start",
    margin: 16, padding: 16, borderRadius: 18, borderWidth: 1,
  },
  actionsRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingBottom: 4, flexWrap: "wrap" },
  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 18, paddingVertical: 12, borderRadius: 16, flex: 1,
    justifyContent: "center",
  },
  actionBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 14 },
  section: {
    marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 18,
    gap: 12, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  itemImg: { width: 52, height: 52, borderRadius: 14 },
  itemName: { fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 18 },
  itemQty: { fontSize: 12, fontFamily: "Inter_400Regular" },
  itemPrice: { fontSize: 14, fontFamily: "Inter_700Bold" },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  totalVal: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  personRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  chatBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1,
  },
  timelineItem: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  chatInput: {
    flexDirection: "row", alignItems: "flex-end", gap: 10,
    paddingHorizontal: 16, paddingTop: 12,
  },
  chatTextInput: {
    flex: 1, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 10 : 8, fontSize: 14,
    fontFamily: "Inter_400Regular", maxHeight: 120,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: "center", justifyContent: "center",
  },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, gap: 14,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#ccc", alignSelf: "center", marginBottom: 8 },
  modalIconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  modalSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },
  disputeInput: {
    borderWidth: 1, borderRadius: 14, padding: 14, fontSize: 14,
    fontFamily: "Inter_400Regular", textAlignVertical: "top", minHeight: 100,
  },
  modalBtn: {
    paddingVertical: 14, borderRadius: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6,
  },
});

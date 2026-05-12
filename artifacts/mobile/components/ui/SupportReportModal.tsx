import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import { useAppAccent } from "@/context/AppAccentContext";
import { showAlert } from "@/lib/alert";

export interface SupportReportModalProps {
  visible: boolean;
  onClose: () => void;
  context?: string;
  userEmail?: string;
  userId?: string;
}

function buildDeviceInfo(): string {
  const { width, height } = Dimensions.get("window");
  const appVersion =
    Constants.expoConfig?.version ||
    (Constants as any).manifest?.version ||
    "unknown";
  const lines = [
    `Platform: ${Platform.OS === "ios" ? "iOS" : Platform.OS === "android" ? "Android" : "Web"}`,
    `OS Version: ${Device.osVersion || "unknown"}`,
    `Device Model: ${Device.modelName || "unknown"}`,
    `Device Brand: ${(Device as any).brand || "unknown"}`,
    `Device Type: ${Device.deviceType === 1 ? "Phone" : Device.deviceType === 2 ? "Tablet" : "Other"}`,
    `Screen: ${Math.round(width)} × ${Math.round(height)}`,
    `App Version: ${appVersion}`,
    `Expo SDK: ${Constants.expoConfig?.sdkVersion || (Constants as any).manifest?.sdkVersion || "unknown"}`,
  ];
  return lines.join("\n");
}

export default function SupportReportModal({
  visible,
  onClose,
  context = "App",
  userEmail = "",
  userId,
}: SupportReportModalProps) {
  const { colors } = useTheme();
  const { accent } = useAppAccent();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState(userEmail);
  const [description, setDescription] = useState("");
  const [deviceInfo] = useState(buildDeviceInfo);
  const [showDeviceInfo, setShowDeviceInfo] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setEmail(userEmail);
      setDescription("");
    }
  }, [visible, userEmail]);

  const handleSubmit = useCallback(async () => {
    if (!email.trim()) {
      showAlert("Email required", "Please enter an email address so we can get back to you.");
      return;
    }
    if (!description.trim()) {
      showAlert("Description required", "Please describe the issue you're experiencing.");
      return;
    }

    setSubmitting(true);
    try {
      const fullMessage =
        `${description.trim()}\n\n` +
        `── Device Info ──────────────────\n${deviceInfo}\n` +
        `Reported from: ${context}`;

      const { data: ticket, error } = await supabase
        .from("support_tickets")
        .insert({
          user_id: userId ?? null,
          email: email.trim(),
          subject: `[${context}] Auth / Access Issue`,
          category: "account",
          status: "open",
          priority: "high",
        })
        .select()
        .single();

      if (error || !ticket) throw new Error(error?.message || "Failed to create ticket");

      await supabase.from("support_messages").insert({
        ticket_id: ticket.id,
        sender_id: userId ?? null,
        sender_type: "user",
        message: fullMessage,
      });

      showAlert(
        "Report Sent",
        "We've received your report and will investigate — usually within a few hours. Check your email for updates.",
        [{ text: "OK", onPress: onClose }],
      );
    } catch (err: any) {
      showAlert("Couldn't send report", err.message || "Please try again or email support@afuchat.com directly.");
    } finally {
      setSubmitting(false);
    }
  }, [email, description, deviceInfo, context, userId, onClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={st.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={st.kav}
        >
          <View
            style={[
              st.sheet,
              {
                backgroundColor: colors.surface,
                paddingBottom: insets.bottom + 20,
              },
            ]}
          >
            {/* Handle bar */}
            <View style={[st.handle, { backgroundColor: colors.border }]} />

            {/* Header */}
            <View style={st.header}>
              <View style={[st.headerIcon, { backgroundColor: accent + "18" }]}>
                <Ionicons name="headset-outline" size={20} color={accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.title, { color: colors.text }]}>Contact Support</Text>
                <Text style={[st.subtitle, { color: colors.textMuted }]}>
                  We'll investigate and reply to your email
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={st.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={st.body}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Context badge */}
              <View style={[st.contextRow, { backgroundColor: accent + "12", borderColor: accent + "30" }]}>
                <Ionicons name="location-outline" size={13} color={accent} />
                <Text style={[st.contextText, { color: accent }]}>
                  Reported from: <Text style={{ fontFamily: "Inter_700Bold" }}>{context}</Text>
                </Text>
              </View>

              {/* Email */}
              <Text style={[st.label, { color: colors.textMuted }]}>YOUR EMAIL *</Text>
              <TextInput
                style={[st.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                value={email}
                onChangeText={setEmail}
                placeholder="email@example.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              {/* Description */}
              <Text style={[st.label, { color: colors.textMuted }]}>DESCRIBE THE ISSUE *</Text>
              <TextInput
                style={[st.textarea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                value={description}
                onChangeText={setDescription}
                placeholder="What happened? What were you trying to do? Any error messages you saw?"
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />

              {/* Device info preview toggle */}
              <TouchableOpacity
                style={[st.deviceToggle, { borderColor: colors.border, backgroundColor: colors.background }]}
                onPress={() => setShowDeviceInfo(v => !v)}
                activeOpacity={0.75}
              >
                <View style={[st.deviceToggleLeft, { backgroundColor: "#34C75918" }]}>
                  <Ionicons name="phone-portrait-outline" size={15} color="#34C759" />
                </View>
                <Text style={[st.deviceToggleText, { color: colors.text }]}>
                  Device info auto-attached
                </Text>
                <View style={[st.deviceToggleBadge, { backgroundColor: "#34C75920" }]}>
                  <Ionicons name="checkmark-circle" size={13} color="#34C759" />
                  <Text style={[st.deviceToggleBadgeText, { color: "#34C759" }]}>Included</Text>
                </View>
                <Ionicons
                  name={showDeviceInfo ? "chevron-up" : "chevron-down"}
                  size={14}
                  color={colors.textMuted}
                />
              </TouchableOpacity>

              {showDeviceInfo && (
                <View style={[st.deviceInfoBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  {deviceInfo.split("\n").map((line, i) => {
                    const [key, ...rest] = line.split(": ");
                    return (
                      <View key={i} style={st.deviceInfoRow}>
                        <Text style={[st.deviceInfoKey, { color: colors.textMuted }]}>{key}</Text>
                        <Text style={[st.deviceInfoVal, { color: colors.text }]}>{rest.join(": ")}</Text>
                      </View>
                    );
                  })}
                </View>
              )}

              <Text style={[st.disclaimer, { color: colors.textMuted }]}>
                Device details help us determine if this is a device-specific bug or a wider issue in our app. They are only used to investigate your report.
              </Text>
            </ScrollView>

            {/* Submit */}
            <View style={[st.footer, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                style={[st.submitBtn, { backgroundColor: accent, opacity: submitting ? 0.7 : 1 }]}
                onPress={handleSubmit}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send" size={16} color="#fff" />
                    <Text style={st.submitBtnText}>Send Report</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  kav: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
    overflow: "hidden",
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: "center", marginTop: 10, marginBottom: 4,
  },
  header: {
    flexDirection: "row", alignItems: "center",
    gap: 12, paddingHorizontal: 20, paddingVertical: 16,
  },
  headerIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 16, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },

  body: { paddingHorizontal: 20, paddingBottom: 16, gap: 0 },

  contextRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: 10, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 18,
  },
  contextText: { fontSize: 12, fontFamily: "Inter_500Medium" },

  label: {
    fontSize: 11, fontFamily: "Inter_700Bold",
    letterSpacing: 0.8, marginBottom: 8,
  },
  input: {
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, fontFamily: "Inter_400Regular", marginBottom: 18,
  },
  textarea: {
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, fontFamily: "Inter_400Regular",
    minHeight: 110, marginBottom: 14,
  },

  deviceToggle: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 4,
  },
  deviceToggleLeft: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
  },
  deviceToggleText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  deviceToggleBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
  },
  deviceToggleBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold" },

  deviceInfoBox: {
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    padding: 14, gap: 6, marginTop: 6, marginBottom: 4,
  },
  deviceInfoRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  deviceInfoKey: { fontSize: 12, fontFamily: "Inter_600SemiBold", width: 110 },
  deviceInfoVal: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },

  disclaimer: {
    fontSize: 11, fontFamily: "Inter_400Regular",
    lineHeight: 16, marginTop: 12,
  },

  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20, paddingTop: 14,
  },
  submitBtn: {
    borderRadius: 14, paddingVertical: 15,
    flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 8,
  },
  submitBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
});

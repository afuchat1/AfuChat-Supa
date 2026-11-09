import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Avatar } from "@/components/ui/Avatar";
import { useCall } from "@/context/CallContext";
import { useTheme } from "@/hooks/useTheme";
import { router } from "expo-router";

export function IncomingCallModal() {
  const { colors } = useTheme();
  const { incomingNotice, acceptCall, declineCall } = useCall();
  if (!incomingNotice) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={declineCall}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Incoming voice call</Text>
          <Avatar
            uri={incomingNotice.callerAvatar}
            name={incomingNotice.callerName}
            size={88}
          />
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {incomingNotice.callerName}
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.action, { backgroundColor: "#D92D3F" }]} onPress={declineCall}>
              <Ionicons name="close" size={26} color="#fff" />
              <Text style={styles.actionText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.action, { backgroundColor: "#24A148" }]}
              onPress={() => {
                const callId = incomingNotice.callId;
                void acceptCall().then(() => {
                  router.push({ pathname: "/call/[id]", params: { id: callId } } as any);
                }).catch(() => {});
              }}
            >
              <Ionicons name="call" size={24} color="#fff" />
              <Text style={styles.actionText}>Answer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 26,
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
  },
  label: { fontSize: 14, marginBottom: 22 },
  name: { fontSize: 22, fontWeight: "700", marginTop: 16 },
  actions: { flexDirection: "row", gap: 18, marginTop: 28 },
  action: {
    width: 112,
    minHeight: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  actionText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
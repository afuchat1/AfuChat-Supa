import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { isOnline, onConnectivityChange } from "@/lib/offlineStore";
import { STATUS } from "@/constants/colors";
import { T } from "@/constants/theme";

type State = "hidden" | "offline" | "connecting" | "updating";

export default function OfflineBanner() {
  const [state, setState] = useState<State>(() => (isOnline() ? "hidden" : "offline"));
  const stateRef = useRef<State>(state);
  const wasOffline = useRef(state === "offline");
  const connectingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translateY = useRef(new Animated.Value(-80)).current;

  useEffect(() => {
    stateRef.current = state;
    const visible = state !== "hidden";
    Animated.timing(translateY, {
      toValue: visible ? 0 : -80,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [state, translateY]);

  useEffect(() => {
    const clearTimers = () => {
      if (connectingTimer.current) clearTimeout(connectingTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      connectingTimer.current = null;
      hideTimer.current = null;
    };

    const unsubscribe = onConnectivityChange((online) => {
      clearTimers();
      if (!online) {
        wasOffline.current = true;
        setState("offline");
        return;
      }
      if (!wasOffline.current) {
        setState("hidden");
        return;
      }
      wasOffline.current = false;

      // A real reconnect gets an explicit two-step status. The work itself is
      // owned by AuthContext/offlineSync and remains fire-and-forget.
      setState("connecting");
      connectingTimer.current = setTimeout(() => {
        if (stateRef.current !== "connecting") return;
        setState("updating");
        hideTimer.current = setTimeout(() => setState("hidden"), 3500);
      }, 850);
    });

    return () => {
      clearTimers();
      unsubscribe();
    };
  }, []);

  if (state === "hidden") return null;

  const isOffline = state === "offline";
  const isConnecting = state === "connecting";
  const statusColor = isOffline ? STATUS.warning : STATUS.success;
  const icon = isOffline ? "cloud-offline-outline" : isConnecting ? "wifi-outline" : "sync-outline";
  const label = isOffline ? "Waiting for network" : isConnecting ? "Connecting…" : "Updating…";

  return (
    <Animated.View
      style={[
        st.pill,
        { pointerEvents: "none", transform: [{ translateY }] },
      ]}
    >
      <Ionicons name={icon as any} size={15} color={statusColor} />
      <Text style={[st.label, { color: statusColor }]}>{label}</Text>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  pill: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  label: {
    ...T.caption,
    fontSize: 10,
    letterSpacing: 0.1,
  },
});

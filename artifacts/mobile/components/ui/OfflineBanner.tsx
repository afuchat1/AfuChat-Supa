import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  getConnectivityState,
  isDataSyncActive,
  onConnectionStateChange,
  onDataSyncChange,
} from "@/lib/offlineStore";
import {
  resolveOfflineBannerState,
  type ConnectivityPhase,
} from "@/lib/connectivityModel";
import { STATUS } from "@/constants/colors";
import { T } from "@/constants/theme";

export default function OfflineBanner() {
  const [connection, setConnection] = useState<ConnectivityPhase>(() => getConnectivityState());
  const [syncing, setSyncing] = useState(isDataSyncActive);
  const translateY = useRef(new Animated.Value(-80)).current;
  const state = resolveOfflineBannerState(connection, syncing);

  useEffect(() => {
    const visible = state !== "hidden";
    Animated.timing(translateY, {
      toValue: visible ? 0 : -80,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [state, translateY]);

  useEffect(() => {
    const stopConnection = onConnectionStateChange(setConnection);
    const stopSync = onDataSyncChange(setSyncing);
    return () => {
      stopConnection();
      stopSync();
    };
  }, []);

  if (state === "hidden") return null;

  const isOffline = state === "offline";
  const isConnecting = state === "connecting";
  const statusColor = state === "updating" ? STATUS.success : STATUS.warning;
  const icon = isOffline ? "cloud-offline-outline" : isConnecting ? "wifi-outline" : "sync-outline";
  const label = isOffline ? "Waiting for network" : isConnecting ? "Connecting…" : "Updating…";

  return (
    <Animated.View
      style={[
        st.pill,
        { pointerEvents: "none", transform: [{ translateY }] },
      ]}
      accessibilityLiveRegion="polite"
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

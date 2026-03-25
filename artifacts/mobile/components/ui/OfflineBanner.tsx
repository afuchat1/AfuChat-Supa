import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { isOnline, onConnectivityChange } from "@/lib/offlineStore";

export default function OfflineBanner() {
  const [online, setOnline] = useState(isOnline());
  const [showReconnected, setShowReconnected] = useState(false);
  const opacity = useState(new Animated.Value(0))[0];
  const prevOnlineRef = useRef(isOnline());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = onConnectivityChange((val) => {
      if (val && !prevOnlineRef.current) {
        setShowReconnected(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setShowReconnected(false), 2500);
      }
      prevOnlineRef.current = val;
      setOnline(val);
    });
    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const visible = !online || showReconnected;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [visible, opacity]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.banner,
        { backgroundColor: showReconnected ? "#34C759" : "#FF3B30", opacity },
      ]}
    >
      <Ionicons
        name={showReconnected ? "wifi" : "cloud-offline"}
        size={14}
        color="#fff"
      />
      <Text style={styles.text}>
        {showReconnected ? "Back online" : "No internet connection"}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 6,
  },
  text: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
});

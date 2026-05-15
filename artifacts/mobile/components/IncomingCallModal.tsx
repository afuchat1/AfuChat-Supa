import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/components/ui/Avatar";
import { CallRecord, updateCallStatus } from "@/lib/callSignaling";

interface Props {
  call: CallRecord | null;
  onDismiss: () => void;
}

export function IncomingCallModal({ call, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  const ringSound = useRef<Audio.Sound | null>(null);
  const webRingRef = useRef<{ stop: () => void } | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(-160)).current;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!call) {
      setVisible(false);
      stopRing();
      return;
    }
    setVisible(true);
    Animated.spring(slideAnim, {
      toValue: 0,
      tension: 60,
      friction: 10,
      useNativeDriver: Platform.OS !== "web",
    }).start();
    startPulse();
    if (Platform.OS === "web") playWebRingtone();
    else playRingtone();

    const autoDeclineTimer = setTimeout(async () => {
      await updateCallStatus(call.id, "missed");
      dismiss();
    }, 40000);
    return () => {
      clearTimeout(autoDeclineTimer);
    };
  }, [call?.id]);

  function startPulse() {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 600,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: Platform.OS !== "web",
        }),
      ])
    ).start();
  }

  /**
   * Web ringtone: synthesise a soft two-tone ring with WebAudio so we don't
   * have to ship an audio file or fight browser autoplay restrictions on a
   * static <audio src>. If the AudioContext is suspended (no user gesture
   * yet), the call simply makes no sound — the visual modal still shows.
   */
  function playWebRingtone() {
    try {
      const w: any = typeof window !== "undefined" ? window : null;
      if (!w) return;
      const Ctx = w.AudioContext || w.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      let stopped = false;
      let timer: any;
      function ring() {
        if (stopped) return;
        const t0 = ctx.currentTime;
        for (let i = 0; i < 2; i++) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = 480;
          const start = t0 + i * 0.5;
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(0.18, start + 0.05);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
          osc.connect(gain).connect(ctx.destination);
          osc.start(start);
          osc.stop(start + 0.45);
        }
        timer = setTimeout(ring, 2500);
      }
      ring();
      webRingRef.current = {
        stop() {
          stopped = true;
          if (timer) clearTimeout(timer);
          ctx.close().catch(() => {});
        },
      };
    } catch (_) {
      /* ignore — web audio not available */
    }
  }

  async function playRingtone() {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        allowsRecordingIOS: false,
      });
      const { sound } = await Audio.Sound.createAsync(
        require("../assets/sounds/notification.wav"),
        { isLooping: true, volume: 1 }
      );
      ringSound.current = sound;
      await sound.playAsync();
    } catch (_) {}
  }

  async function stopRing() {
    if (ringSound.current) {
      await ringSound.current.stopAsync().catch(() => {});
      await ringSound.current.unloadAsync().catch(() => {});
      ringSound.current = null;
    }
    if (webRingRef.current) {
      try { webRingRef.current.stop(); } catch (_) {}
      webRingRef.current = null;
    }
    pulseAnim.stopAnimation();
  }

  function dismiss() {
    Animated.timing(slideAnim, {
      toValue: -160,
      duration: 250,
      useNativeDriver: Platform.OS !== "web",
    }).start(() => {
      setVisible(false);
      stopRing();
      onDismiss();
    });
  }

  async function handleAccept() {
    if (!call) return;
    stopRing();
    dismiss();
    router.push({ pathname: "/call/[id]", params: { id: call.id } });
  }

  async function handleDecline() {
    if (!call) return;
    await updateCallStatus(call.id, "declined");
    dismiss();
  }

  if (!visible || !call) return null;

  const caller = call.caller;
  const isVideo = call.call_type === "video";

  return (
    <Animated.View
      style={[styles.container, { top: insets.top + 8, transform: [{ translateY: slideAnim }], pointerEvents: "box-none" }]}
    >
      <View style={styles.card}>
        <View style={styles.row}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <View style={styles.avatarWrap}>
              <Avatar
                uri={caller?.avatar_url}
                name={caller?.display_name || "?"}
                size={52}
              />
              <View style={[styles.callTypeDot, { backgroundColor: isVideo ? "#007AFF" : "#34C759" }]}>
                <Ionicons
                  name={isVideo ? "videocam" : "call"}
                  size={11}
                  color="#fff"
                />
              </View>
            </View>
          </Animated.View>

          <View style={styles.info}>
            <Text style={styles.label}>
              Incoming {isVideo ? "Video" : "Voice"} Call
            </Text>
            <Text style={styles.name} numberOfLines={1}>
              {caller?.display_name || "Unknown"}
            </Text>
            <Text style={styles.handle}>
              @{caller?.handle || ""}
            </Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.declineBtn]}
              onPress={handleDecline}
              activeOpacity={0.8}
            >
              <Ionicons name="call" size={20} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.acceptBtn]}
              onPress={handleAccept}
              activeOpacity={0.8}
            >
              <Ionicons name="call" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 9999,
  },
  card: {
    backgroundColor: "#1C1C1E",
    borderRadius: 18,
    padding: 14,
    ...Platform.select({
      web: { boxShadow: "0 6px 20px rgba(0,0,0,0.4)" } as any,
      default: { shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 20 },
    }),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarWrap: {
    position: "relative",
  },
  callTypeDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#1C1C1E",
  },
  info: {
    flex: 1,
  },
  label: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  name: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    marginTop: 2,
  },
  handle: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  declineBtn: {
    backgroundColor: "#FF3B30",
  },
  acceptBtn: {
    backgroundColor: "#34C759",
  },
});

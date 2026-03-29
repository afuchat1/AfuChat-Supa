import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { hasPIN, isBiometricEnabled, verifyPIN } from "@/lib/appLock";
import Colors from "@/constants/colors";

let LocalAuthentication: typeof import("expo-local-authentication") | null = null;
if (Platform.OS !== "web") {
  try { LocalAuthentication = require("expo-local-authentication"); } catch {}
}

const DOTS = 4;

export function AppLockGate({ children }: { children: React.ReactNode }) {
  const [locked, setLocked] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [checking, setChecking] = useState(true);
  const bgRef = useRef(AppState.currentState);

  const checkLockConfig = useCallback(async () => {
    if (Platform.OS === "web") { setChecking(false); return; }
    const [pin, bio] = await Promise.all([hasPIN(), isBiometricEnabled()]);
    setPinEnabled(pin);
    setBioEnabled(bio);
    setChecking(false);
    return { pin, bio };
  }, []);

  const triggerLock = useCallback(async () => {
    const config = await checkLockConfig();
    if (config?.pin || config?.bio) setLocked(true);
  }, [checkLockConfig]);

  useEffect(() => {
    checkLockConfig();
    const sub = AppState.addEventListener("change", (next) => {
      if (bgRef.current === "active" && (next === "background" || next === "inactive")) {
        triggerLock();
      }
      bgRef.current = next;
    });
    return () => sub.remove();
  }, [checkLockConfig, triggerLock]);

  async function tryBiometric() {
    if (!LocalAuthentication) return false;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock AfuChat",
        fallbackLabel: "Use PIN",
        disableDeviceFallback: false,
      });
      if (result.success) { setLocked(false); return true; }
    } catch {}
    return false;
  }

  useEffect(() => {
    if (locked && bioEnabled && !pinEnabled) {
      tryBiometric();
    } else if (locked && bioEnabled) {
      tryBiometric();
    }
  }, [locked]);

  if (checking || !locked) return <>{children}</>;

  return (
    <LockScreen
      pinEnabled={pinEnabled}
      bioEnabled={bioEnabled}
      onBioPress={tryBiometric}
      onUnlock={() => setLocked(false)}
    />
  );
}

function LockScreen({
  pinEnabled,
  bioEnabled,
  onBioPress,
  onUnlock,
}: {
  pinEnabled: boolean;
  bioEnabled: boolean;
  onBioPress: () => Promise<boolean>;
  onUnlock: () => void;
}) {
  const [digits, setDigits] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const shakeX = useSharedValue(0);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  function shake() {
    Vibration.vibrate(200);
    shakeX.value = withSequence(
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 50 }),
      withTiming(-8, { duration: 50 }),
      withTiming(8, { duration: 50 }),
      withTiming(0, { duration: 50 }),
    );
    setError(true);
    setTimeout(() => { setError(false); setDigits([]); }, 800);
  }

  async function pressDigit(d: string) {
    if (digits.length >= DOTS) return;
    const next = [...digits, d];
    setDigits(next);
    if (next.length === DOTS) {
      const pin = next.join("");
      const ok = await verifyPIN(pin);
      if (ok) {
        onUnlock();
      } else {
        shake();
      }
    }
  }

  function backspace() {
    setDigits((prev) => prev.slice(0, -1));
  }

  const KEYPAD = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["bio", "0", "del"],
  ];

  return (
    <View style={styles.root}>
      <View style={styles.logoArea}>
        <View style={styles.logoCircle}>
          <Ionicons name="shield-checkmark" size={36} color={Colors.brand} />
        </View>
        <Text style={styles.logoTitle}>AfuChat is locked</Text>
        <Text style={styles.logoSub}>
          {pinEnabled ? "Enter your PIN to continue" : "Authenticate to continue"}
        </Text>
      </View>

      {pinEnabled && (
        <>
          <Animated.View style={[styles.dotsRow, shakeStyle]}>
            {Array.from({ length: DOTS }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i < digits.length && styles.dotFilled,
                  error && styles.dotError,
                ]}
              />
            ))}
          </Animated.View>

          <View style={styles.keypad}>
            {KEYPAD.map((row, ri) => (
              <View key={ri} style={styles.keypadRow}>
                {row.map((key) => {
                  if (key === "bio") {
                    return (
                      <TouchableOpacity
                        key="bio"
                        style={[styles.keyBtn, !bioEnabled && { opacity: 0 }]}
                        onPress={bioEnabled ? onBioPress : undefined}
                        disabled={!bioEnabled}
                      >
                        <Ionicons name="finger-print-outline" size={26} color="#fff" />
                      </TouchableOpacity>
                    );
                  }
                  if (key === "del") {
                    return (
                      <TouchableOpacity key="del" style={styles.keyBtn} onPress={backspace}>
                        <Ionicons name="backspace-outline" size={24} color="#fff" />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      key={key}
                      style={styles.keyBtn}
                      onPress={() => pressDigit(key)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.keyText}>{key}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </>
      )}

      {!pinEnabled && bioEnabled && (
        <TouchableOpacity style={styles.bioBtn} onPress={onBioPress}>
          <Ionicons name="finger-print" size={56} color={Colors.brand} />
          <Text style={styles.bioBtnText}>Tap to authenticate</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    gap: 40,
  },
  logoArea: { alignItems: "center", gap: 12 },
  logoCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.brand + "22",
    alignItems: "center", justifyContent: "center",
  },
  logoTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff" },
  logoSub: { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)" },
  dotsRow: { flexDirection: "row", gap: 20 },
  dot: {
    width: 16, height: 16, borderRadius: 8,
    borderWidth: 2, borderColor: "rgba(255,255,255,0.4)",
  },
  dotFilled: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  dotError: { borderColor: "#FF3B30", backgroundColor: "#FF3B30" },
  keypad: { gap: 16 },
  keypadRow: { flexDirection: "row", gap: 24 },
  keyBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  keyText: { fontSize: 26, fontFamily: "Inter_400Regular", color: "#fff" },
  bioBtn: { alignItems: "center", gap: 16 },
  bioBtnText: { fontSize: 16, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)" },
});

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  AppStateStatus,
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
import {
  hasPIN,
  isBiometricEnabled,
  verifyPIN,
  restoreScreenshotProtection,
} from "@/lib/appLock";
import Colors from "@/constants/colors";

let LocalAuthentication: typeof import("expo-local-authentication") | null = null;
if (Platform.OS !== "web") {
  try { LocalAuthentication = require("expo-local-authentication"); } catch {}
}

type LockStatus = "checking" | "locked" | "unlocked";

const DOTS = 4;

export function AppLockGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<LockStatus>("checking");
  const [pinEnabled, setPinEnabled] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const wentToBackgroundRef = useRef(false);

  const checkConfig = useCallback(async (): Promise<{ pin: boolean; bio: boolean }> => {
    if (Platform.OS === "web") return { pin: false, bio: false };
    const [pin, bio] = await Promise.all([hasPIN(), isBiometricEnabled()]);
    setPinEnabled(pin);
    setBioEnabled(bio);
    return { pin, bio };
  }, []);

  const lockIfConfigured = useCallback(async () => {
    const { pin, bio } = await checkConfig();
    if (pin || bio) {
      setStatus("locked");
    }
  }, [checkConfig]);

  useEffect(() => {
    (async () => {
      if (Platform.OS === "web") {
        setStatus("unlocked");
        return;
      }
      await restoreScreenshotProtection();
      const { pin, bio } = await checkConfig();
      if (pin || bio) {
        setStatus("locked");
      } else {
        setStatus("unlocked");
      }
    })();
  }, [checkConfig]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === "background") {
        wentToBackgroundRef.current = true;
        lockIfConfigured();
      } else if (nextState === "active" && wentToBackgroundRef.current) {
        wentToBackgroundRef.current = false;
      }
    });
    return () => sub.remove();
  }, [lockIfConfigured]);

  async function tryBiometric(): Promise<boolean> {
    if (!LocalAuthentication) return false;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock AfuChat",
        fallbackLabel: "Use PIN",
        cancelLabel: "Cancel",
        disableDeviceFallback: false,
      });
      if (result.success) {
        setStatus("unlocked");
        return true;
      }
    } catch {}
    return false;
  }

  useEffect(() => {
    if (status === "locked" && bioEnabled) {
      tryBiometric();
    }
  }, [status, bioEnabled]);

  if (status === "checking") return null;

  if (status === "locked") {
    return (
      <LockScreen
        pinEnabled={pinEnabled}
        bioEnabled={bioEnabled}
        onBioPress={tryBiometric}
        onUnlock={() => setStatus("unlocked")}
      />
    );
  }

  return <>{children}</>;
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
  const [attempts, setAttempts] = useState(0);
  const shakeX = useSharedValue(0);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  function shake() {
    Vibration.vibrate(300);
    shakeX.value = withSequence(
      withTiming(-12, { duration: 60 }),
      withTiming(12, { duration: 60 }),
      withTiming(-10, { duration: 60 }),
      withTiming(10, { duration: 60 }),
      withTiming(-6, { duration: 60 }),
      withTiming(6, { duration: 60 }),
      withTiming(0, { duration: 60 }),
    );
    setError(true);
    setAttempts((a) => a + 1);
    setTimeout(() => { setError(false); setDigits([]); }, 900);
  }

  async function pressDigit(d: string) {
    if (digits.length >= DOTS || error) return;
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
    if (error) return;
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
          <Ionicons name="shield-checkmark" size={38} color={Colors.brand} />
        </View>
        <Text style={styles.logoTitle}>AfuChat is locked</Text>
        <Text style={styles.logoSub}>
          {pinEnabled
            ? "Enter your 4-digit PIN to continue"
            : "Use biometrics to continue"}
        </Text>
        {attempts > 0 && (
          <Text style={styles.attemptsText}>
            {attempts} failed attempt{attempts !== 1 ? "s" : ""}
          </Text>
        )}
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
                    if (!bioEnabled) return <View key="bio" style={styles.keyBtn} />;
                    return (
                      <TouchableOpacity
                        key="bio"
                        style={styles.keyBtn}
                        onPress={onBioPress}
                      >
                        <Ionicons name="finger-print-outline" size={28} color="rgba(255,255,255,0.8)" />
                      </TouchableOpacity>
                    );
                  }
                  if (key === "del") {
                    return (
                      <TouchableOpacity key="del" style={styles.keyBtn} onPress={backspace}>
                        <Ionicons name="backspace-outline" size={26} color="rgba(255,255,255,0.8)" />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[styles.keyBtn, styles.keyBtnFilled]}
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
        <TouchableOpacity style={styles.bioOnlyBtn} onPress={onBioPress} activeOpacity={0.75}>
          <Ionicons name="finger-print" size={72} color={Colors.brand} />
          <Text style={styles.bioOnlyText}>Tap to authenticate</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#050505",
    alignItems: "center",
    justifyContent: "center",
    gap: 44,
  },
  logoArea: { alignItems: "center", gap: 10 },
  logoCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: Colors.brand + "1A",
    borderWidth: 1.5,
    borderColor: Colors.brand + "44",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  logoTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff" },
  logoSub: { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.45)", textAlign: "center", paddingHorizontal: 40 },
  attemptsText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#FF3B30", marginTop: 4 },
  dotsRow: { flexDirection: "row", gap: 22 },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
  },
  dotFilled: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  dotError: { backgroundColor: "#FF3B30", borderColor: "#FF3B30" },
  keypad: { gap: 18 },
  keypadRow: { flexDirection: "row", gap: 26 },
  keyBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  keyBtnFilled: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  keyText: { fontSize: 28, fontFamily: "Inter_400Regular", color: "#fff" },
  bioOnlyBtn: { alignItems: "center", gap: 18, paddingVertical: 20 },
  bioOnlyText: { fontSize: 16, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.55)" },
});

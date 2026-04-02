import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  AppStateStatus,
  Modal,
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
import { useAppAccent } from "@/context/AppAccentContext";

let LocalAuthentication: typeof import("expo-local-authentication") | null = null;
if (Platform.OS !== "web") {
  try { LocalAuthentication = require("expo-local-authentication"); } catch {}
}

const MIN_BACKGROUND_MS = 3000;

export function AppLockGate({ children }: { children: React.ReactNode }) {
  const [locked, setLocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const bioInProgress = useRef(false);
  const backgroundAt = useRef<number | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const checkConfig = useCallback(async (): Promise<{ pin: boolean; bio: boolean }> => {
    if (Platform.OS === "web") return { pin: false, bio: false };
    const [pin, bio] = await Promise.all([hasPIN(), isBiometricEnabled()]);
    setPinEnabled(pin);
    setBioEnabled(bio);
    return { pin, bio };
  }, []);

  useEffect(() => {
    (async () => {
      if (Platform.OS === "web") {
        setReady(true);
        return;
      }
      await restoreScreenshotProtection();
      const { pin, bio } = await checkConfig();
      if (pin || bio) {
        setLocked(true);
      }
      setReady(true);
    })();
  }, [checkConfig]);

  const tryBiometric = useCallback(async (): Promise<boolean> => {
    if (!LocalAuthentication || bioInProgress.current) return false;
    bioInProgress.current = true;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock AfuChat",
        fallbackLabel: "Use PIN",
        cancelLabel: "Cancel",
        disableDeviceFallback: false,
      });
      if (result.success) {
        setLocked(false);
        return true;
      }
    } catch {}
    finally {
      bioInProgress.current = false;
    }
    return false;
  }, []);

  useEffect(() => {
    if (locked && bioEnabled) {
      tryBiometric();
    }
  }, [locked, bioEnabled, tryBiometric]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", async (nextState: AppStateStatus) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === "background" || nextState === "inactive") {
        if (backgroundAt.current === null) {
          backgroundAt.current = Date.now();
        }
      } else if (nextState === "active") {
        const wentBackgroundAt = backgroundAt.current;
        backgroundAt.current = null;

        if (wentBackgroundAt === null) return;
        const elapsed = Date.now() - wentBackgroundAt;
        if (elapsed < MIN_BACKGROUND_MS) return;

        const { pin, bio } = await checkConfig();
        if (pin || bio) {
          setLocked(true);
        }
      }
    });
    return () => sub.remove();
  }, [checkConfig]);

  if (!ready) return null;

  return (
    <>
      {children}
      {locked && Platform.OS !== "web" && (
        <Modal
          visible={locked}
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => {}}
        >
          <LockScreen
            pinEnabled={pinEnabled}
            bioEnabled={bioEnabled}
            onBioPress={tryBiometric}
            onUnlock={() => setLocked(false)}
          />
        </Modal>
      )}
    </>
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
  const { accent } = useAppAccent();
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
    if (digits.length >= 4 || error) return;
    const next = [...digits, d];
    setDigits(next);
    if (next.length === 4) {
      const ok = await verifyPIN(next.join(""));
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
        <View style={[styles.logoCircle, { backgroundColor: accent + "1A", borderColor: accent + "44" }]}>
          <Ionicons name="shield-checkmark" size={38} color={accent} />
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
            {Array.from({ length: 4 }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i < digits.length && [styles.dotFilled, { backgroundColor: accent, borderColor: accent }],
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
          <Ionicons name="finger-print" size={72} color={accent} />
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
    borderWidth: 1.5,
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
  dotFilled: {},
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

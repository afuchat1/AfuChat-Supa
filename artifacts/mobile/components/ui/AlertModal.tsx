import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  registerAlertListener,
  unregisterAlertListener,
  type AlertButton,
} from "@/lib/alert";
import { useTheme } from "@/hooks/useTheme";

type AlertState = {
  visible: boolean;
  title: string;
  message?: string;
  buttons?: AlertButton[];
};

export default function AlertModal() {
  const { colors, isDark } = useTheme();
  const [state, setState] = useState<AlertState>({ visible: false, title: "" });
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.88)).current;

  useEffect(() => {
    registerAlertListener((s) => setState(s));
    return () => unregisterAlertListener();
  }, []);

  useEffect(() => {
    if (state.visible) {
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          damping: 20,
          stiffness: 300,
          mass: 0.8,
        }),
        Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scale, { toValue: 0.88, duration: 140, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 140, useNativeDriver: true }),
      ]).start();
    }
  }, [state.visible]);

  const dismiss = useCallback((btn?: AlertButton) => {
    setState((s) => ({ ...s, visible: false }));
    setTimeout(() => btn?.onPress?.(), 150);
  }, []);

  const buttons: AlertButton[] =
    state.buttons && state.buttons.length > 0
      ? state.buttons
      : [{ text: "OK", style: "default" }];

  const cancelBtn = buttons.find((b) => b.style === "cancel");
  const useVertical = buttons.length > 2;

  const cardBg = isDark ? "#1C1C1E" : "#FAFAFA";
  const divider = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.09)";

  return (
    <Modal
      visible={state.visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => dismiss(cancelBtn)}
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => dismiss(cancelBtn)}
        />
        <Animated.View
          style={[
            styles.card,
            { backgroundColor: cardBg, opacity, transform: [{ scale }] },
          ]}
        >
          {/* Content */}
          <View style={styles.content}>
            <Text style={[styles.title, { color: colors.text }]}>
              {state.title}
            </Text>
            {state.message ? (
              <Text style={[styles.message, { color: colors.textSecondary }]}>
                {state.message}
              </Text>
            ) : null}
          </View>

          {/* Buttons */}
          <View
            style={[
              useVertical ? styles.btnGroupVertical : styles.btnGroupHorizontal,
              { borderTopColor: divider, borderTopWidth: StyleSheet.hairlineWidth },
            ]}
          >
            {buttons.map((btn, i) => {
              const isDestructive = btn.style === "destructive";
              const isCancel = btn.style === "cancel";
              const btnColor = isDestructive
                ? "#FF3B30"
                : isCancel
                ? colors.textSecondary
                : "#007AFF";

              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    useVertical ? styles.btnVertical : styles.btnHorizontal,
                    !useVertical &&
                      i < buttons.length - 1 && {
                        borderRightWidth: StyleSheet.hairlineWidth,
                        borderRightColor: divider,
                      },
                    useVertical &&
                      i < buttons.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: divider,
                      },
                  ]}
                  onPress={() => dismiss(btn)}
                  activeOpacity={0.55}
                >
                  <Text
                    style={[
                      styles.btnText,
                      { color: btnColor },
                      !isCancel && { fontFamily: "Inter_600SemiBold" },
                    ]}
                  >
                    {btn.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.48)",
    padding: 40,
  },
  card: {
    width: 288,
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.28,
    shadowRadius: 32,
    elevation: 24,
  },
  content: {
    paddingTop: 22,
    paddingBottom: 18,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 7,
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  message: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 18,
  },
  btnGroupHorizontal: {
    flexDirection: "row",
  },
  btnGroupVertical: {
    flexDirection: "column",
  },
  btnHorizontal: {
    flex: 1,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  btnVertical: {
    height: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
});

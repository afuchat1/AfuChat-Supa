import React, { useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

export type IOSAlertButton = {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
};

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  buttons?: IOSAlertButton[];
  onDismiss: () => void;
};

export function IOSAlert({ visible, title, message, buttons, onDismiss }: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.min(windowWidth - 48, 320);
  const scale = useRef(new Animated.Value(1.15)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scale.setValue(1.15);
      opacity.setValue(0);
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 300 }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const btns = buttons && buttons.length > 0 ? buttons : [{ text: "OK", style: "default" as const }];
  const cancelBtn = btns.find((b) => b.style === "cancel");
  const actionBtns = btns.filter((b) => b.style !== "cancel");
  const ordered = cancelBtn ? [...actionBtns, cancelBtn] : actionBtns;
  const isHorizontal = ordered.length <= 2;

  function handlePress(btn: IOSAlertButton) {
    btn.onPress?.();
    onDismiss();
  }

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent>
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, { transform: [{ scale }], opacity, width: cardWidth }]}>
          <View style={styles.content}>
            <Text style={styles.title}>{title}</Text>
            {message ? <Text style={styles.message}>{message}</Text> : null}
          </View>
          <View style={[styles.buttonContainer, isHorizontal ? styles.horizontal : styles.vertical]}>
            {ordered.map((btn, i) => {
              const isDestructive = btn.style === "destructive";
              const isCancel = btn.style === "cancel";
              const isLast = i === ordered.length - 1;
              return (
                <Pressable
                  key={i}
                  style={({ pressed }) => [
                    styles.button,
                    isHorizontal && !isLast && styles.buttonBorderRight,
                    !isHorizontal && !isLast && styles.buttonBorderBottom,
                    isHorizontal && { flex: 1 },
                    pressed && { backgroundColor: "rgba(0,0,0,0.05)" },
                  ]}
                  onPress={() => handlePress(btn)}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      isCancel && styles.cancelText,
                      isDestructive && styles.destructiveText,
                      !isCancel && !isDestructive && styles.defaultText,
                    ]}
                  >
                    {btn.text}
                  </Text>
                </Pressable>
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
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    overflow: "hidden",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
    alignItems: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
    color: "#000",
    marginBottom: 4,
  },
  message: {
    fontSize: 13,
    textAlign: "center",
    color: "#555",
    lineHeight: 18,
    marginTop: 4,
  },
  buttonContainer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.15)",
  },
  horizontal: {
    flexDirection: "row",
  },
  vertical: {
    flexDirection: "column",
  },
  button: {
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 12,
    minHeight: 44,
  },
  buttonBorderRight: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: "rgba(0,0,0,0.15)",
  },
  buttonBorderBottom: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.15)",
  },
  buttonText: {
    fontSize: 17,
  },
  defaultText: {
    color: "#007AFF",
    fontWeight: "400",
  },
  cancelText: {
    color: "#007AFF",
    fontWeight: "600",
  },
  destructiveText: {
    color: "#FF3B30",
    fontWeight: "400",
  },
});

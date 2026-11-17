import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import { OptimizedImage } from "@/components/ui/OptimizedImage";
import { useTheme } from "@/hooks/useTheme";
import {
  calculateProfileCoverCropRect,
  PROFILE_COVER_OUTPUT_HEIGHT,
  PROFILE_COVER_OUTPUT_WIDTH,
  PROFILE_COVER_ASPECT_RATIO,
} from "@/lib/profileCoverCrop";

type Offset = { x: number; y: number };

type Props = {
  visible: boolean;
  uri: string | null;
  imageWidth: number;
  imageHeight: number;
  onCancel: () => void;
  onSave: (uri: string) => void | Promise<void>;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function ProfileCoverCropModal({
  visible,
  uri,
  imageWidth,
  imageHeight,
  onCancel,
  onSave,
}: Props) {
  const { colors, accent } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [cropError, setCropError] = useState<string | null>(null);
  const offsetRef = useRef<Offset>({ x: 0, y: 0 });
  const gestureStartRef = useRef<Offset>({ x: 0, y: 0 });

  const viewportWidth = Math.max(240, Math.min(window.width - 72, 680));
  const viewportHeight = viewportWidth / PROFILE_COVER_ASPECT_RATIO;
  const sourceWidth = Math.max(1, imageWidth || 1200);
  const sourceHeight = Math.max(1, imageHeight || 800);
  const scale = Math.max(viewportWidth / sourceWidth, viewportHeight / sourceHeight);
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  const baseLeft = (viewportWidth - renderedWidth) / 2;
  const baseTop = (viewportHeight - renderedHeight) / 2;

  const setClampedOffset = useCallback((next: Offset) => {
    const clamped = {
      x: clamp(next.x, viewportWidth - renderedWidth - baseLeft, -baseLeft),
      y: clamp(next.y, viewportHeight - renderedHeight - baseTop, -baseTop),
    };
    offsetRef.current = clamped;
    setOffset(clamped);
  }, [baseLeft, baseTop, renderedHeight, renderedWidth, viewportHeight, viewportWidth]);

  useEffect(() => {
    offsetRef.current = { x: 0, y: 0 };
    setOffset({ x: 0, y: 0 });
    setSaving(false);
    setCropError(null);
  }, [visible, uri, imageWidth, imageHeight]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_event, gesture) =>
      Math.abs(gesture.dx) + Math.abs(gesture.dy) > 2,
    onPanResponderGrant: () => {
      gestureStartRef.current = offsetRef.current;
    },
    onPanResponderMove: (_event, gesture) => {
      setClampedOffset({
        x: gestureStartRef.current.x + gesture.dx,
        y: gestureStartRef.current.y + gesture.dy,
      });
    },
    onPanResponderTerminationRequest: () => false,
  }), [setClampedOffset]);

  const saveCrop = useCallback(async () => {
    if (!uri || saving) return;
    setSaving(true);
    setCropError(null);
    try {
      const crop = calculateProfileCoverCropRect({
        sourceWidth,
        sourceHeight,
        viewportWidth,
        viewportHeight,
        offsetX: offsetRef.current.x,
        offsetY: offsetRef.current.y,
      });
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [
          { crop },
          { resize: { width: PROFILE_COVER_OUTPUT_WIDTH, height: PROFILE_COVER_OUTPUT_HEIGHT } },
        ],
        { compress: 0.76, format: ImageManipulator.SaveFormat.JPEG },
      );
      await onSave(result.uri);
    } catch (error) {
      if (__DEV__) console.warn("[profile] cover crop failed", error);
      setCropError("Could not crop this image. Try another photo.");
      setSaving(false);
    }
  }, [
    onSave,
    saving,
    sourceHeight,
    sourceWidth,
    uri,
    viewportHeight,
    viewportWidth,
  ]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <View style={[styles.overlay, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <View style={[styles.sheet, { backgroundColor: colors.cardSurface, borderColor: colors.border }]}>
          <View style={styles.header}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Cancel cover crop"
              onPress={onCancel}
              disabled={saving}
              style={styles.headerButton}
            >
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.text }]}>Adjust cover</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Save cover crop"
              onPress={saveCrop}
              disabled={saving || !uri}
              style={[styles.doneButton, { backgroundColor: accent, opacity: saving || !uri ? 0.6 : 1 }]}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.doneText}>Done</Text>}
            </TouchableOpacity>
          </View>

          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Drag the image to choose what appears in your profile cover.
          </Text>

          <View
            style={[styles.cropWindow, { width: viewportWidth, height: viewportHeight, backgroundColor: colors.backgroundTertiary }]}
            {...panResponder.panHandlers}
          >
            {uri ? (
              <OptimizedImage
                source={{ uri }}
                contentFit="fill"
                cachePolicy="memory"
                style={{
                  position: "absolute",
                  left: baseLeft + offset.x,
                  top: baseTop + offset.y,
                  width: renderedWidth,
                  height: renderedHeight,
                }}
              />
            ) : null}
            <View pointerEvents="none" style={styles.cropFrame}>
              <View style={styles.cropCornerTopLeft} />
              <View style={styles.cropCornerTopRight} />
              <View style={styles.cropCornerBottomLeft} />
              <View style={styles.cropCornerBottomRight} />
            </View>
          </View>

          <View style={styles.ratioRow}>
            <Ionicons name="crop-outline" size={15} color={colors.textMuted} />
            <Text style={[styles.ratioText, { color: colors.textMuted }]}>
              Wide cover · {PROFILE_COVER_ASPECT_RATIO}:1
            </Text>
          </View>
          {cropError ? <Text style={styles.errorText}>{cropError}</Text> : null}
        </View>
      </View>
    </Modal>
  );
}

const CORNER = 16;
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.62)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  sheet: {
    width: "100%",
    maxWidth: 720,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 14,
  },
  header: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  headerButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontSize: 17, fontFamily: "Inter_600SemiBold" },
  doneButton: {
    minWidth: 58,
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  doneText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  hint: { fontSize: 13, lineHeight: 19, textAlign: "center" },
  cropWindow: { alignSelf: "center", overflow: "hidden", borderRadius: 12 },
  cropFrame: { ...StyleSheet.absoluteFill, borderWidth: 1, borderColor: "rgba(255,255,255,0.58)" },
  cropCornerTopLeft: { position: "absolute", top: -1, left: -1, width: CORNER, height: CORNER, borderTopWidth: 3, borderLeftWidth: 3, borderColor: "#fff", borderTopLeftRadius: 12 },
  cropCornerTopRight: { position: "absolute", top: -1, right: -1, width: CORNER, height: CORNER, borderTopWidth: 3, borderRightWidth: 3, borderColor: "#fff", borderTopRightRadius: 12 },
  cropCornerBottomLeft: { position: "absolute", bottom: -1, left: -1, width: CORNER, height: CORNER, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: "#fff", borderBottomLeftRadius: 12 },
  cropCornerBottomRight: { position: "absolute", bottom: -1, right: -1, width: CORNER, height: CORNER, borderBottomWidth: 3, borderRightWidth: 3, borderColor: "#fff", borderBottomRightRadius: 12 },
  ratioRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 },
  ratioText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  errorText: { color: "#FF453A", fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "center" },
});

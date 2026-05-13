/**
 * PostUploadBanner — globally-visible upload progress/status bar.
 *
 * Rendered directly in _layout.tsx (above all navigation) so it floats
 * over every screen regardless of which tab or stack the user is on.
 * Slides in from the top when an upload starts, auto-dismisses when
 * done/failed (controlled by postUploadStore timeouts).
 */

import React, { useEffect, useRef, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  getPostUploadState,
  subscribePostUpload,
} from "@/lib/postUploadStore";
import { useTheme } from "@/hooks/useTheme";

const BANNER_HEIGHT = 56; // enough for label + progress bar

function usePostUpload() {
  return useSyncExternalStore(subscribePostUpload, getPostUploadState);
}

export function PostUploadBanner() {
  const upload = usePostUpload();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  // Slide animation — translate from -BANNER_HEIGHT to 0
  const slideY = useRef(new Animated.Value(-BANNER_HEIGHT - insets.top)).current;
  const wasVisible = useRef(false);

  useEffect(() => {
    const shouldShow = upload !== null;

    if (shouldShow && !wasVisible.current) {
      wasVisible.current = true;
      Animated.spring(slideY, {
        toValue: 0,
        tension: 120,
        friction: 14,
        useNativeDriver: Platform.OS !== "web",
      }).start();
    } else if (!shouldShow && wasVisible.current) {
      wasVisible.current = false;
      Animated.timing(slideY, {
        toValue: -BANNER_HEIGHT - insets.top,
        duration: 260,
        useNativeDriver: Platform.OS !== "web",
      }).start();
    }
  }, [upload, insets.top, slideY]);

  if (!upload && !wasVisible.current) return null;

  const icon: any = upload?.type === "video" ? "videocam" : "image-outline";
  const doneMsg  = upload?.type === "video" ? "Video posted!"        : "Post published!";
  const activeMsg = upload?.type === "video" ? "Posting your video…" : "Sharing your post…";
  const errorMsg  = upload?.type === "video" ? "Video failed to post." : "Post failed to publish.";

  const label   = upload?.done ? doneMsg : upload?.failed ? errorMsg : (activeMsg);
  const bgColor = upload?.failed
    ? "#FF3B30"
    : upload?.done
      ? "#34C759"
      : (colors as any).accent ?? "#00BCD4";
  const barWidth = `${Math.round((upload?.progress ?? 0) * 100)}%` as any;

  const topPadding = insets.top;

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateY: slideY }], paddingTop: topPadding },
      ]}
      pointerEvents="none"
    >
      <View style={[styles.inner, { backgroundColor: bgColor }]}>
        {/* Row: icon + label + spinner */}
        <View style={styles.row}>
          <Ionicons name={icon} size={15} color="#fff" />
          <Text style={styles.label} numberOfLines={1}>{label ?? activeMsg}</Text>
          {upload && !upload.done && !upload.failed && (
            <ActivityIndicator size="small" color="#fff" />
          )}
        </View>

        {/* Progress bar — only while actively uploading */}
        {upload && !upload.done && !upload.failed && (
          <View style={styles.track}>
            <View style={[styles.fill, { width: barWidth }]} />
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 99999,
    elevation: 99,
  },
  inner: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    gap: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  label: {
    flex: 1,
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  track: {
    height: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 1,
  },
  fill: {
    height: 2,
    backgroundColor: "#fff",
    borderRadius: 1,
  },
});

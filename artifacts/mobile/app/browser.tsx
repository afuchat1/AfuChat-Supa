import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  Platform,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { showAlert } from "@/lib/alert";
import { openExternalLink } from "@/lib/openExternalLink";
import InternalBrowserView from "@/components/browser/InternalBrowserView";
import type {
  BrowserControls,
  BrowserNavigationState,
  InternalBrowserViewProps,
} from "@/components/browser/InternalBrowserView.types";

function sanitizeHttpUrl(value: string): string | null {
  try {
    const parsed = new URL(value.trim());
    if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || !parsed.hostname) return null;
    parsed.username = "";
    parsed.password = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function resolveAddress(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : /^[^\s]+\.[^\s]+$/.test(trimmed)
      ? `https://${trimmed}`
      : null;
  if (withProtocol) return sanitizeHttpUrl(withProtocol);

  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

export default function BrowserScreen() {
  const params = useLocalSearchParams<{ url?: string | string[] }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const browserControls = useRef<BrowserControls | null>(null);
  const initialUrl = Array.isArray(params.url) ? params.url[0] : params.url;
  const safeInitialUrl = initialUrl ? sanitizeHttpUrl(initialUrl) : null;

  const [sourceUrl, setSourceUrl] = useState(safeInitialUrl ?? "");
  const [addressText, setAddressText] = useState(safeInitialUrl ?? "");
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!safeInitialUrl) return;
    setSourceUrl(safeInitialUrl);
    setAddressText(safeInitialUrl);
  }, [safeInitialUrl]);

  const handleNavigationStateChange = useCallback((state: BrowserNavigationState) => {
    const safeUrl = sanitizeHttpUrl(state.url);
    if (safeUrl) setAddressText(safeUrl);
    setCanGoBack(state.canGoBack);
    setCanGoForward(state.canGoForward);
  }, []);

  const handleControlsReady = useCallback((controls: BrowserControls | null) => {
    browserControls.current = controls;
  }, []);

  const handleLoadStart = useCallback(() => {
    setIsLoading(true);
    setLoadError("");
    setProgress(0.05);
  }, []);

  const handleLoadEnd = useCallback(() => {
    setIsLoading(false);
    setProgress(1);
  }, []);

  const handleLoadProgress = useCallback((value: number) => {
    setProgress(Math.min(1, Math.max(0, value)));
  }, []);

  const handleError = useCallback((message: string) => {
    setIsLoading(false);
    setLoadError(message);
  }, []);

  const navigateTo = useCallback((rawUrl: string) => {
    const nextUrl = resolveAddress(rawUrl);
    if (!nextUrl) {
      showAlert("Invalid address", "Enter a website beginning with http:// or https://.");
      return;
    }
    Keyboard.dismiss();
    setLoadError("");
    setAddressText(nextUrl);
    setSourceUrl(nextUrl);
  }, []);

  const handleOpenWindow = useCallback((url: string) => {
    const safeUrl = sanitizeHttpUrl(url);
    if (safeUrl) navigateTo(safeUrl);
  }, [navigateTo]);

  const handleExternalScheme = useCallback((url: string) => {
    void openExternalLink(url).catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android") return undefined;
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        if (canGoBack) {
          browserControls.current?.back();
          return true;
        }
        return false;
      });
      return () => subscription.remove();
    }, [canGoBack]),
  );

  const handleBack = useCallback(() => {
    if (canGoBack) {
      browserControls.current?.back();
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [canGoBack, router]);

  const handleHome = useCallback(() => {
    Keyboard.dismiss();
    setSourceUrl("");
    setAddressText("");
    setLoadError("");
    setIsLoading(false);
    setProgress(0);
  }, []);

  const handleShare = useCallback(async () => {
    const url = addressText.trim();
    if (!url) return;
    try {
      await Share.share({ message: url, url });
    } catch {
      // Sharing is optional; keep the page open if the system sheet is unavailable.
    }
  }, [addressText]);

  const viewProps = useMemo<InternalBrowserViewProps>(() => ({
    url: sourceUrl,
    onControlsReady: handleControlsReady,
    onNavigationStateChange: handleNavigationStateChange,
    onLoadStart: handleLoadStart,
    onLoadEnd: handleLoadEnd,
    onLoadProgress: handleLoadProgress,
    onError: handleError,
    onOpenWindow: handleOpenWindow,
    onExternalScheme: handleExternalScheme,
  }), [
    sourceUrl,
    handleControlsReady,
    handleNavigationStateChange,
    handleLoadStart,
    handleLoadEnd,
    handleLoadProgress,
    handleError,
    handleOpenWindow,
    handleExternalScheme,
  ]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />
      <View style={[styles.toolbar, { backgroundColor: colors.surface }]}>
        <TouchableOpacity
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel={canGoBack ? "Go back one page" : "Close browser"}
          style={styles.iconButton}
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={[styles.addressBox, { backgroundColor: colors.background }]}>
          <Ionicons
            name={addressText.startsWith("https://") ? "lock-closed" : "search"}
            size={15}
            color={colors.textMuted}
          />
          <TextInput
            value={addressText}
            onChangeText={setAddressText}
            onSubmitEditing={() => navigateTo(addressText)}
            placeholder="Search or enter website"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            selectTextOnFocus
            accessibilityLabel="Search or enter a website"
            style={[styles.addressInput, { color: colors.text }]}
          />
          {isLoading ? (
            <TouchableOpacity
              onPress={() => browserControls.current?.stop()}
              accessibilityRole="button"
              accessibilityLabel="Stop loading"
              style={styles.addressAction}
            >
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => sourceUrl && browserControls.current?.reload()}
              accessibilityRole="button"
              accessibilityLabel="Reload page"
              style={styles.addressAction}
            >
              <Ionicons name="refresh" size={17} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          onPress={() => void handleShare()}
          disabled={!addressText}
          accessibilityRole="button"
          accessibilityLabel="Share page"
          style={styles.iconButton}
        >
          <Ionicons name="share-outline" size={20} color={addressText ? colors.text : colors.textMuted} />
        </TouchableOpacity>
      </View>

      {isLoading && (
        <View style={[styles.progressTrack, { backgroundColor: colors.backgroundTertiary }]}>
          <View style={[styles.progressFill, { width: `${Math.max(8, progress * 100)}%`, backgroundColor: colors.accent }]} />
        </View>
      )}

      {sourceUrl ? (
        <View style={styles.page}>
          <InternalBrowserView
            key={sourceUrl}
            {...viewProps}
          />
          {!!loadError && (
            <View style={[styles.errorOverlay, { backgroundColor: colors.background }]}>
              <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
              <Text style={[styles.errorTitle, { color: colors.text }]}>This page didn’t load</Text>
              <Text style={[styles.errorMessage, { color: colors.textMuted }]}>{loadError}</Text>
              <TouchableOpacity
                style={[styles.retryButton, { backgroundColor: colors.accent }]}
                onPress={() => browserControls.current?.reload()}
                accessibilityRole="button"
              >
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={[styles.homeHint, { color: colors.textMuted }]}>
            Search or enter a web address
          </Text>
        </View>
      )}

      <View style={[styles.bottomBar, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TouchableOpacity
          onPress={() => browserControls.current?.back()}
          disabled={!canGoBack}
          accessibilityRole="button"
          accessibilityLabel="Previous page"
          style={styles.bottomButton}
        >
          <Ionicons name="chevron-back" size={20} color={canGoBack ? colors.text : colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => browserControls.current?.forward()}
          disabled={!canGoForward}
          accessibilityRole="button"
          accessibilityLabel="Next page"
          style={styles.bottomButton}
        >
          <Ionicons name="chevron-forward" size={20} color={canGoForward ? colors.text : colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleHome}
          disabled={!sourceUrl}
          accessibilityRole="button"
          accessibilityLabel="Browser home"
          style={styles.bottomButton}
        >
          <Ionicons name="home-outline" size={19} color={sourceUrl ? colors.text : colors.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  toolbar: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    gap: 4,
  },
  iconButton: {
    width: 38,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  addressBox: {
    flex: 1,
    height: 40,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 11,
  },
  addressInput: {
    flex: 1,
    minWidth: 0,
    height: 40,
    padding: 0,
    fontSize: 14,
  },
  addressAction: {
    width: 28,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  progressTrack: { height: 2, width: "100%" },
  progressFill: { height: 2 },
  page: { flex: 1, position: "relative" },
  errorOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  errorTitle: { marginTop: 14, fontSize: 18, fontWeight: "700" },
  errorMessage: { marginTop: 8, fontSize: 14, textAlign: "center" },
  retryButton: { marginTop: 18, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12 },
  retryText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  homeHint: { fontSize: 14, textAlign: "center" },
  bottomBar: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 6,
    paddingHorizontal: 24,
  },
  bottomButton: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
});

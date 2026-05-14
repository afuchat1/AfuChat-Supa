import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView, type WebViewNavigation } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { useAppAccent } from "@/context/AccentContext";
import * as Linking from "expo-linking";

export default function InAppBrowser() {
  const { url: initialUrl } = useLocalSearchParams<{ url: string }>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { accent } = useAppAccent();

  const webRef = useRef<WebView>(null);
  const [currentUrl, setCurrentUrl] = useState(initialUrl ?? "");
  const [displayUrl, setDisplayUrl] = useState(initialUrl ?? "");
  const [editingUrl, setEditingUrl] = useState(false);
  const [draftUrl, setDraftUrl] = useState(initialUrl ?? "");
  const [title, setTitle] = useState("");
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [loading, setLoading] = useState(true);
  const progress = useRef(new Animated.Value(0)).current;

  function normaliseUrl(raw: string): string {
    const t = raw.trim();
    if (!t) return t;
    if (t.startsWith("http://") || t.startsWith("https://")) return t;
    return "https://" + t;
  }

  function prettify(url: string): string {
    try {
      const { hostname, pathname, search, hash } = new URL(url);
      const rest = pathname === "/" ? "" : pathname + search + hash;
      return hostname.replace(/^www\./, "") + rest;
    } catch {
      return url;
    }
  }

  function handleNavStateChange(nav: WebViewNavigation) {
    setCanGoBack(nav.canGoBack);
    setCanGoForward(nav.canGoForward);
    if (nav.url) {
      setCurrentUrl(nav.url);
      setDisplayUrl(prettify(nav.url));
      setDraftUrl(nav.url);
    }
    if (nav.title) setTitle(nav.title);
  }

  function handleLoadProgress({ nativeEvent }: { nativeEvent: { progress: number } }) {
    Animated.timing(progress, {
      toValue: nativeEvent.progress,
      duration: 100,
      useNativeDriver: false,
    }).start();
  }

  function handleLoadStart() {
    setLoading(true);
    Animated.timing(progress, { toValue: 0.1, duration: 150, useNativeDriver: false }).start();
  }

  function handleLoadEnd() {
    setLoading(false);
    Animated.timing(progress, { toValue: 1, duration: 200, useNativeDriver: false }).start(() => {
      setTimeout(() => {
        Animated.timing(progress, { toValue: 0, duration: 300, useNativeDriver: false }).start();
      }, 300);
    });
  }

  function handleShouldStartLoad({ url }: { url: string }) {
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      Linking.openURL(url).catch(() => {});
      return false;
    }
    return true;
  }

  const handleShare = useCallback(async () => {
    try {
      await Share.share({ url: currentUrl, message: currentUrl, title });
    } catch {}
  }, [currentUrl, title]);

  function handleOpenExternal() {
    Linking.openURL(currentUrl).catch(() => {});
  }

  function commitUrl() {
    const normalised = normaliseUrl(draftUrl);
    setCurrentUrl(normalised);
    setDisplayUrl(prettify(normalised));
    setDraftUrl(normalised);
    setEditingUrl(false);
    webRef.current?.stopLoading();
  }

  const progressColor = accent;
  const barBg = colors.surface;
  const borderC = colors.border;
  const textC = colors.text;
  const mutedC = colors.textMuted;
  const iconC = colors.text;
  const disabledC = colors.textMuted;
  const bg = isDark ? "#0F0F0F" : "#F2F2F7";

  return (
    <View style={[st.root, { backgroundColor: bg, paddingTop: insets.top }]}>
      <View style={[st.topBar, { backgroundColor: barBg, borderBottomColor: borderC }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.closeBtn} hitSlop={8}>
          <Ionicons name="close" size={22} color={iconC} />
        </TouchableOpacity>

        <Pressable
          style={[st.urlBar, { backgroundColor: isDark ? "#2C2C2E" : "#EBEBF0" }]}
          onPress={() => setEditingUrl(true)}
        >
          {editingUrl ? (
            <TextInput
              style={[st.urlInput, { color: textC }]}
              value={draftUrl}
              onChangeText={setDraftUrl}
              onSubmitEditing={commitUrl}
              onBlur={() => setEditingUrl(false)}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              selectTextOnFocus
              returnKeyType="go"
            />
          ) : (
            <Text style={[st.urlText, { color: textC }]} numberOfLines={1}>
              {displayUrl || currentUrl}
            </Text>
          )}
          {loading && (
            <ActivityIndicator size="small" color={accent} style={{ marginLeft: 6 }} />
          )}
        </Pressable>

        <TouchableOpacity onPress={handleShare} style={st.shareBtn} hitSlop={8}>
          <Ionicons name="share-outline" size={22} color={iconC} />
        </TouchableOpacity>
      </View>

      <Animated.View
        style={[
          st.progressBar,
          {
            backgroundColor: progressColor,
            width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
          },
        ]}
      />

      <WebView
        ref={webRef}
        source={{ uri: currentUrl }}
        style={st.webview}
        onNavigationStateChange={handleNavStateChange}
        onLoadProgress={handleLoadProgress}
        onLoadStart={handleLoadStart}
        onLoadEnd={handleLoadEnd}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        allowsBackForwardNavigationGestures
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={[st.loadingOverlay, { backgroundColor: bg }]}>
            <ActivityIndicator size="large" color={accent} />
          </View>
        )}
      />

      <View
        style={[
          st.bottomBar,
          { backgroundColor: barBg, borderTopColor: borderC, paddingBottom: insets.bottom + 4 },
        ]}
      >
        <TouchableOpacity
          onPress={() => webRef.current?.goBack()}
          disabled={!canGoBack}
          hitSlop={8}
          style={st.navBtn}
        >
          <Ionicons name="chevron-back" size={24} color={canGoBack ? iconC : disabledC} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => webRef.current?.goForward()}
          disabled={!canGoForward}
          hitSlop={8}
          style={st.navBtn}
        >
          <Ionicons name="chevron-forward" size={24} color={canGoForward ? iconC : disabledC} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => loading ? webRef.current?.stopLoading() : webRef.current?.reload()}
          hitSlop={8}
          style={st.navBtn}
        >
          <Ionicons name={loading ? "close" : "refresh"} size={22} color={iconC} />
        </TouchableOpacity>

        <TouchableOpacity onPress={handleOpenExternal} hitSlop={8} style={st.navBtn}>
          <Ionicons name="open-outline" size={22} color={iconC} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeBtn: { padding: 4 },
  shareBtn: { padding: 4 },
  urlBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    minHeight: 36,
  },
  urlText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  urlInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    padding: 0,
    margin: 0,
  },
  progressBar: {
    height: 2,
    position: "absolute",
    top: 0,
    left: 0,
  },
  webview: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  navBtn: { padding: 8, alignItems: "center", justifyContent: "center", flex: 1 },
});

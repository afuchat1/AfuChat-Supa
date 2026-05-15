/**
 * AfuChat Lab — AI Lens screen.
 * Point your camera at anything and get instant AI-powered identification,
 * facts, and answers to questions.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated as RNAnimated,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { getEdgeFnBase, edgeHeaders } from "@/lib/aiHelper";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Camera — native only
let CameraView: any = null;
let useCameraPermissions: any = null;
if (Platform.OS !== "web") {
  try {
    const cam = require("expo-camera");
    CameraView = cam.CameraView;
    useCameraPermissions = cam.useCameraPermissions;
  } catch (_) {}
}

const { width: SW, height: SH } = Dimensions.get("window");
const FRAME_SIZE = Math.min(SW, SH) * 0.72;

const BRAND    = "#FF6B35";
const BRAND2   = "#FF3B00";
const BRAND_BG = "rgba(255,107,53,0.15)";

// ── Types ──────────────────────────────────────────────────────────────────────

interface LensResult {
  title: string;
  description: string;
  facts: string[];
  category: string;
  searchQuery: string;
  confidence: "high" | "medium" | "low";
  answer?: string;
}

// ── Scanning frame overlay ─────────────────────────────────────────────────────

function ScanFrame({ scanning }: { scanning: boolean }) {
  const pulse = useRef(new RNAnimated.Value(1)).current;
  const corner = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    if (scanning) {
      RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.timing(pulse, { toValue: 0.6, duration: 600, useNativeDriver: true }),
          RNAnimated.timing(pulse, { toValue: 1,   duration: 600, useNativeDriver: true }),
        ])
      ).start();
      RNAnimated.loop(
        RNAnimated.timing(corner, { toValue: 1, duration: 1600, useNativeDriver: false })
      ).start();
    } else {
      pulse.stopAnimation();
      corner.stopAnimation();
      pulse.setValue(1);
      corner.setValue(0);
    }
  }, [scanning]);

  const borderColor = scanning
    ? pulse.interpolate({ inputRange: [0, 1], outputRange: [BRAND2, BRAND] })
    : BRAND;

  const c = 20;
  return (
    <View style={{ width: FRAME_SIZE, height: FRAME_SIZE, position: "relative" }}>
      {/* Dimmed overlay outside frame */}
      <View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]} />

      {/* Corner brackets */}
      {[
        { top: 0, left: 0 },
        { top: 0, right: 0 },
        { bottom: 0, left: 0 },
        { bottom: 0, right: 0 },
      ].map((pos, i) => (
        <RNAnimated.View
          key={i}
          style={[styles.corner, pos, { borderColor, pointerEvents: "none" }]}
        />
      ))}

      {/* Scanning line */}
      {scanning && (
        <RNAnimated.View
          style={[
            styles.scanLine,
            {
              top: corner.interpolate({
                inputRange: [0, 1],
                outputRange: [0, FRAME_SIZE - 2],
              }),
              pointerEvents: "none",
            },
          ]}
        />
      )}
    </View>
  );
}

// ── Category icon map ──────────────────────────────────────────────────────────

function categoryIcon(cat: string): React.ComponentProps<typeof Ionicons>["name"] {
  const map: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
    food:    "restaurant",
    plant:   "leaf",
    animal:  "paw",
    place:   "location",
    product: "bag-handle",
    person:  "person",
    artwork: "image",
    text:    "document-text",
    object:  "cube",
    other:   "help-circle",
  };
  return map[cat] ?? "help-circle";
}

// ── Confidence badge ───────────────────────────────────────────────────────────

function ConfidenceBadge({ level }: { level: string }) {
  const color = level === "high" ? "#34C759" : level === "medium" ? "#FF9F0A" : "#FF453A";
  return (
    <View style={[styles.badge, { backgroundColor: color + "22", borderColor: color + "55" }]}>
      <View style={[styles.badgeDot, { backgroundColor: color }]} />
      <Text style={[styles.badgeText, { color }]}>
        {level === "high" ? "High confidence" : level === "medium" ? "Medium confidence" : "Low confidence"}
      </Text>
    </View>
  );
}

// ── Web camera fallback ────────────────────────────────────────────────────────

function WebCameraView({ onCapture }: { onCapture: (base64: string, mime: string) => void }) {
  const videoRef  = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stream = await (navigator as any).mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (!mounted) { stream.getTracks().forEach((t: any) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => { videoRef.current?.play(); setReady(true); };
        }
      } catch (e: any) {
        setError(e.message || "Camera access denied");
      }
    })();
    return () => {
      mounted = false;
      streamRef.current?.getTracks().forEach((t: any) => t.stop());
    };
  }, []);

  function capture() {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    c.width  = v.videoWidth  || 640;
    c.height = v.videoHeight || 480;
    c.getContext("2d")!.drawImage(v, 0, 0);
    const dataUrl = c.toDataURL("image/jpeg", 0.7);
    const base64  = dataUrl.split(",")[1];
    onCapture(base64, "image/jpeg");
  }

  if (error) {
    return (
      <View style={styles.webFallback}>
        <Ionicons name="videocam-off-outline" size={48} color="#999" />
        <Text style={styles.webFallbackText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* @ts-ignore — web only */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      {/* @ts-ignore */}
      <canvas ref={canvasRef} style={{ display: "none" }} />
      {!ready && (
        <View style={[StyleSheet.absoluteFill, styles.camLoading]}>
          <ActivityIndicator color={BRAND} size="large" />
          <Text style={styles.camLoadingText}>Starting camera…</Text>
        </View>
      )}
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

export default function LabScreen() {
  const insets          = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { session }     = useAuth();

  const cameraRef = useRef<any>(null);

  // Camera permissions (native only)
  const [permission, requestPermission] = useCameraPermissions
    ? (useCameraPermissions as () => [any, () => Promise<any>])()
    : [{ granted: Platform.OS === "web" }, async () => {}];

  const [facing,   setFacing]   = useState<"back" | "front">("back");
  const [scanning, setScanning] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState<LensResult | null>(null);
  const [preview,  setPreview]  = useState<string | null>(null);
  const [query,    setQuery]    = useState("");
  const [error,    setError]    = useState<string | null>(null);

  // Ask More state — inline Q&A within the results sheet
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null);
  const [capturedMime,   setCapturedMime]   = useState<string>("image/jpeg");
  const [lensHistory, setLensHistory] = useState<Array<{ q: string; a: string }>>([]);
  const [moreQuery,   setMoreQuery]   = useState("");
  const [moreLoading, setMoreLoading] = useState(false);
  const moreInputRef = useRef<any>(null);

  // Bottom sheet animation
  const sheetY = useRef(new RNAnimated.Value(SH)).current;

  function showSheet() {
    RNAnimated.spring(sheetY, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
  }
  function hideSheet() {
    RNAnimated.timing(sheetY, { toValue: SH, duration: 280, useNativeDriver: true }).start(() => {
      setResult(null);
      setPreview(null);
      setError(null);
      setLensHistory([]);
      setMoreQuery("");
    });
  }

  async function analyze(base64: string, mime: string) {
    setLoading(true);
    setScanning(true);
    setError(null);
    setCapturedBase64(base64);
    setCapturedMime(mime);
    setLensHistory([]);

    try {
      const body: Record<string, string> = { imageBase64: base64, mimeType: mime };
      if (query.trim()) body.query = query.trim();

      const res = await fetch(`${getEdgeFnBase()}/ai-lens`, {
        method:  "POST",
        headers: edgeHeaders(),
        body:    JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);

      setResult(data as LensResult);
      showSheet();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(e.message || "Analysis failed. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
      setScanning(false);
    }
  }

  async function captureNative() {
    if (!cameraRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.5 });
      if (!photo?.base64) throw new Error("No image data");
      setPreview(photo.uri);
      await analyze(photo.base64, "image/jpeg");
    } catch (e: any) {
      setError(e.message || "Could not capture photo");
    }
  }

  function handleWebCapture(base64: string, mime: string) {
    analyze(base64, mime);
  }

  function handleImagePick() {
    if (Platform.OS !== "web") return;
    const input = document.createElement("input");
    input.type   = "file";
    input.accept = "image/*";
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        const base64  = dataUrl.split(",")[1];
        setPreview(dataUrl);
        analyze(base64, file.type || "image/jpeg");
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  async function askMoreInLens() {
    const q = moreQuery.trim();
    if (!q || !capturedBase64 || moreLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMoreLoading(true);
    setMoreQuery("");
    try {
      const res = await fetch(`${getEdgeFnBase()}/ai-lens`, {
        method:  "POST",
        headers: edgeHeaders(),
        body:    JSON.stringify({
          imageBase64: capturedBase64,
          mimeType:    capturedMime,
          query:       q,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      const answer = data.answer || data.description || "No specific answer found for that question.";
      setLensHistory(prev => [...prev, { q, a: answer }]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setLensHistory(prev => [...prev, { q, a: `Could not answer: ${e.message || "Please try again"}` }]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setMoreLoading(false);
    }
  }

  const needsPermission = Platform.OS !== "web" && !permission?.granted;

  // ── Permission gate ──────────────────────────────────────────────────────────
  if (needsPermission) {
    return (
      <View style={[styles.permScreen, { backgroundColor: colors.background }]}>
        <View style={styles.permInner}>
          <LinearGradientFallback style={styles.permIcon}>
            <Ionicons name="scan" size={48} color="#fff" />
          </LinearGradientFallback>
          <Text style={[styles.permTitle, { color: colors.text }]}>Camera Access Needed</Text>
          <Text style={[styles.permSub, { color: colors.textSecondary }]}>
            AfuChat AI Lens needs your camera to identify objects, places, food, and more in real time.
          </Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestPermission} activeOpacity={0.85}>
            <Text style={styles.permBtnText}>Grant Camera Access</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} style={styles.permBack}>
            <Text style={[styles.permBackText, { color: colors.textMuted }]}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      {/* ── Camera background ── */}
      <View style={StyleSheet.absoluteFill}>
        {Platform.OS === "web" ? (
          <WebCameraView onCapture={handleWebCapture} />
        ) : CameraView ? (
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing={facing}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }]} />
        )}
      </View>

      {/* ── Dark vignette ── */}
      <View style={[styles.vignette, { pointerEvents: "none" }]} />

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.headerBack}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <View style={styles.headerLogoRow}>
            <Ionicons name="scan" size={18} color={BRAND} />
            <Text style={styles.headerTitle}> AfuChat Lab</Text>
          </View>
          <Text style={styles.headerSub}>AI Lens</Text>
        </View>

        {Platform.OS !== "web" && (
          <TouchableOpacity
            style={styles.headerBack}
            onPress={() => setFacing(f => f === "back" ? "front" : "back")}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="camera-reverse-outline" size={22} color="#fff" />
          </TouchableOpacity>
        )}
        {Platform.OS === "web" && <View style={{ width: 40 }} />}
      </View>

      {/* ── Scan frame ── */}
      <View style={[styles.frameContainer, { pointerEvents: "none" }]}>
        <ScanFrame scanning={scanning || loading} />
        <Text style={styles.frameHint}>
          {loading ? "Analyzing…" : "Point at anything to identify it"}
        </Text>
      </View>

      {/* ── Query input ── */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "position" : undefined}
        style={styles.bottomArea}
        keyboardVerticalOffset={0}
      >
        <View style={styles.queryRow}>
          <View style={styles.queryInput}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color="rgba(255,255,255,0.6)" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.queryText}
              placeholder="Ask something specific… (optional)"
              placeholderTextColor="rgba(255,255,255,0.45)"
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              onSubmitEditing={Platform.OS === "web" ? handleImagePick : captureNative}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Error ── */}
        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={16} color="#FF453A" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => setError(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={14} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Capture button ── */}
        <View style={[styles.captureRow, { paddingBottom: insets.bottom + 24 }]}>
          {Platform.OS === "web" && (
            <TouchableOpacity style={styles.sideBtn} onPress={handleImagePick} activeOpacity={0.8}>
              <Ionicons name="image-outline" size={24} color="#fff" />
              <Text style={styles.sideBtnText}>Gallery</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.captureBtn, loading && styles.captureBtnDisabled]}
            onPress={Platform.OS === "web" ? handleImagePick : captureNative}
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <View style={styles.captureBtnInner}>
                <Ionicons name="scan" size={28} color="#fff" />
              </View>
            )}
          </TouchableOpacity>

          {result && (
            <TouchableOpacity style={styles.sideBtn} onPress={showSheet} activeOpacity={0.8}>
              <Ionicons name="list-outline" size={24} color="#fff" />
              <Text style={styles.sideBtnText}>Results</Text>
            </TouchableOpacity>
          )}
          {!result && <View style={{ width: Platform.OS === "web" ? 72 : 0 }} />}
        </View>
      </KeyboardAvoidingView>

      {/* ── Results sheet ── */}
      {result && (
        <RNAnimated.View
          style={[
            styles.sheet,
            { transform: [{ translateY: sheetY }] },
          ]}
        >
          <TouchableOpacity style={styles.sheetHandle} onPress={hideSheet} activeOpacity={0.7}>
            <View style={styles.handleBar} />
          </TouchableOpacity>

          <ScrollView
            style={styles.sheetScroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Preview thumbnail */}
            {preview && (
              <Image
                source={{ uri: preview }}
                style={styles.previewThumb}
                resizeMode="cover"
              />
            )}

            {/* Title + category */}
            <View style={styles.resultHeader}>
              <View style={styles.resultCatBadge}>
                <Ionicons name={categoryIcon(result.category)} size={16} color={BRAND} />
                <Text style={styles.resultCatText}>{result.category}</Text>
              </View>
              <Text style={styles.resultTitle}>{result.title}</Text>
              <ConfidenceBadge level={result.confidence} />
            </View>

            {/* Description */}
            <Text style={styles.resultDesc}>{result.description}</Text>

            {/* Specific answer (if query was asked) */}
            {result.answer && (
              <View style={styles.answerBox}>
                <View style={styles.answerHeader}>
                  <Ionicons name="chatbubble-ellipses" size={14} color={BRAND} />
                  <Text style={styles.answerHeaderText}>Lens Analysis</Text>
                </View>
                <Text style={styles.answerText}>{result.answer}</Text>
              </View>
            )}

            {/* Facts */}
            {result.facts?.length > 0 && (
              <View style={styles.factsSection}>
                <Text style={styles.sectionLabel}>Key Facts</Text>
                {result.facts.map((fact, i) => (
                  <View key={i} style={styles.factRow}>
                    <View style={styles.factDot} />
                    <Text style={styles.factText}>{fact}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* ── Q&A History ─────────────────────────────────────────────────── */}
            {lensHistory.length > 0 && (
              <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
                <Text style={[styles.sectionLabel, { marginBottom: 10 }]}>Your Questions</Text>
                {lensHistory.map((item, i) => (
                  <View key={i} style={{
                    marginBottom: 10, backgroundColor: BRAND_BG,
                    borderRadius: 14, padding: 12,
                    borderLeftWidth: 3, borderLeftColor: BRAND,
                  }}>
                    <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-start", marginBottom: 5 }}>
                      <Ionicons name="help-circle-outline" size={14} color={BRAND} style={{ marginTop: 1 }} />
                      <Text style={{ flex: 1, fontSize: 13, fontWeight: "700", color: BRAND }}>{item.q}</Text>
                    </View>
                    <Text style={{ fontSize: 13, lineHeight: 19, color: "rgba(255,255,255,0.85)", paddingLeft: 20 }}>{item.a}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* ── Ask More inline ──────────────────────────────────────────────── */}
            {capturedBase64 && (
              <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
                <Text style={[styles.sectionLabel, { marginBottom: 8 }]}>
                  Ask more about this
                </Text>
                <View style={{
                  flexDirection: "row", gap: 8, alignItems: "flex-end",
                  backgroundColor: "rgba(255,107,53,0.06)", borderRadius: 16,
                  borderWidth: 1.5, borderColor: BRAND + "40", paddingHorizontal: 14,
                  paddingVertical: 6,
                }}>
                  <TextInput
                    ref={moreInputRef}
                    style={{
                      flex: 1, fontSize: 14, color: "#fff",
                      paddingVertical: 8, maxHeight: 80, lineHeight: 20,
                    }}
                    placeholder={`e.g. "What is it made of?" or "Is it healthy?"`}
                    placeholderTextColor="#999"
                    value={moreQuery}
                    onChangeText={setMoreQuery}
                    multiline
                    blurOnSubmit={false}
                    onSubmitEditing={askMoreInLens}
                    returnKeyType="send"
                    editable={!moreLoading}
                  />
                  <TouchableOpacity
                    onPress={askMoreInLens}
                    disabled={!moreQuery.trim() || moreLoading}
                    activeOpacity={0.75}
                    style={{
                      backgroundColor: (!moreQuery.trim() || moreLoading) ? "#ccc" : BRAND,
                      borderRadius: 12, padding: 9, marginBottom: 2,
                    }}
                  >
                    {moreLoading
                      ? <ActivityIndicator size={16} color="#fff" />
                      : <Ionicons name="arrow-up" size={16} color="#fff" />
                    }
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Actions */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnPrimary]}
                onPress={() => {
                  hideSheet();
                  setQuery("");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="scan" size={16} color="#fff" />
                <Text style={styles.actionBtnPrimaryText}>Scan Again</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, { flex: 1 }]}
                onPress={async () => {
                  if (!result) return;
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  hideSheet();
                  try {
                    await AsyncStorage.setItem(
                      "afuai_lens_context",
                      JSON.stringify({
                        title:       result.title,
                        description: result.description,
                        category:    result.category,
                        confidence:  result.confidence,
                        facts:       result.facts || [],
                        answer:      result.answer || "",
                        history:     lensHistory,
                        imagePreview: preview ?? undefined,
                        searchQuery: result.searchQuery,
                        expiresAt:   Date.now() + 30 * 60 * 1000,
                      })
                    );
                  } catch {}
                  router.push({
                    pathname: "/ai",
                    params: { lensIntro: "true" },
                  } as any);
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="sparkles-outline" size={16} color={BRAND} />
                <Text style={[styles.actionBtnText, { color: BRAND }]}>
                  {lensHistory.length > 0 ? "Continue in AfuAI" : "Ask AfuAI"}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </RNAnimated.View>
      )}
    </View>
  );
}

// ── Gradient fallback (for permission screen) ──────────────────────────────────

function LinearGradientFallback({ style, children }: { style?: any; children: React.ReactNode }) {
  try {
    const { LinearGradient } = require("expo-linear-gradient");
    return <LinearGradient colors={[BRAND, BRAND2]} style={style}>{children}</LinearGradient>;
  } catch {
    return <View style={[style, { backgroundColor: BRAND }]}>{children}</View>;
  }
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },

  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    // Top and bottom darkening
    borderTopLeftRadius: 0,
  },

  // Header
  header: {
    position:       "absolute",
    top:            0,
    left:           0,
    right:          0,
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    zIndex:         10,
  },
  headerBack: {
    width:           40,
    height:          40,
    borderRadius:    20,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems:      "center",
    justifyContent:  "center",
  },
  headerCenter: { alignItems: "center" },
  headerLogoRow: { flexDirection: "row", alignItems: "center" },
  headerTitle: {
    color:      "#fff",
    fontSize:   17,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  headerSub: {
    color:     BRAND,
    fontSize:  11,
    fontWeight: "600",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 1,
  },

  // Scan frame
  frameContainer: {
    flex:           1,
    alignItems:     "center",
    justifyContent: "center",
    marginTop:      80,
    marginBottom:   180,
  },
  frameHint: {
    color:     "rgba(255,255,255,0.75)",
    fontSize:  14,
    marginTop: 24,
    textAlign: "center",
    letterSpacing: 0.2,
  },

  // Corner brackets
  corner: {
    position: "absolute",
    width:    28,
    height:   28,
    borderWidth: 3,
  },

  // Scan line
  scanLine: {
    position:        "absolute",
    left:            0,
    right:           0,
    height:          2,
    backgroundColor: BRAND,
    opacity:         0.85,
    ...Platform.select({
      web: { boxShadow: "0 0 6px rgba(255,107,53,0.9)" } as any,
      default: { shadowColor: BRAND, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 6 },
    }),
  },

  // Bottom controls
  bottomArea: {
    position: "absolute",
    bottom:   0,
    left:     0,
    right:    0,
  },
  queryRow: {
    paddingHorizontal: 20,
    marginBottom:      12,
  },
  queryInput: {
    flexDirection:   "row",
    alignItems:      "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius:    24,
    paddingHorizontal: 16,
    paddingVertical:   10,
    borderWidth:     1,
    borderColor:     "rgba(255,255,255,0.15)",
  },
  queryText: {
    flex:      1,
    color:     "#fff",
    fontSize:  15,
    padding:   0,
  },

  errorBanner: {
    flexDirection:     "row",
    alignItems:        "center",
    backgroundColor:   "rgba(255,69,58,0.2)",
    marginHorizontal:  20,
    marginBottom:      8,
    borderRadius:      12,
    paddingHorizontal: 12,
    paddingVertical:   8,
    gap:               8,
    borderWidth:       1,
    borderColor:       "rgba(255,69,58,0.35)",
  },
  errorText: { flex: 1, color: "#FF6B6B", fontSize: 13 },

  captureRow: {
    flexDirection:   "row",
    alignItems:      "center",
    justifyContent:  "center",
    paddingHorizontal: 20,
    gap:             24,
  },
  captureBtn: {
    width:           78,
    height:          78,
    borderRadius:    39,
    backgroundColor: BRAND,
    alignItems:      "center",
    justifyContent:  "center",
    ...Platform.select({
      web: { boxShadow: "0 4px 12px rgba(255,107,53,0.55)" } as any,
      default: { shadowColor: BRAND, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.55, shadowRadius: 12, elevation: 8 },
    }),
    borderWidth:     4,
    borderColor:     "rgba(255,255,255,0.25)",
  },
  captureBtnDisabled: { backgroundColor: "rgba(255,107,53,0.5)" },
  captureBtnInner: { alignItems: "center", justifyContent: "center" },
  sideBtn: {
    width:          72,
    alignItems:     "center",
    gap:            4,
  },
  sideBtnText: { color: "rgba(255,255,255,0.8)", fontSize: 11, fontWeight: "600" },

  // Results sheet
  sheet: {
    position:        "absolute",
    bottom:          0,
    left:            0,
    right:           0,
    maxHeight:       SH * 0.78,
    backgroundColor: "#1C1C1E",
    borderTopLeftRadius:  28,
    borderTopRightRadius: 28,
    ...Platform.select({
      web: { boxShadow: "0 -4px 20px rgba(0,0,0,0.5)" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 24 },
    }),
    zIndex:          50,
  },
  sheetHandle: {
    alignItems:    "center",
    paddingTop:    12,
    paddingBottom: 8,
  },
  handleBar: {
    width:           48,
    height:          5,
    borderRadius:    3,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  sheetScroll: { flex: 1, paddingHorizontal: 20 },

  previewThumb: {
    width:         "100%",
    height:        160,
    borderRadius:  16,
    marginBottom:  16,
    backgroundColor: "#2C2C2E",
  },

  resultHeader: { marginBottom: 10 },
  resultCatBadge: {
    flexDirection:  "row",
    alignItems:     "center",
    alignSelf:      "flex-start",
    backgroundColor: BRAND_BG,
    borderRadius:   20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap:            5,
    marginBottom:   8,
  },
  resultCatText: {
    color:     BRAND,
    fontSize:  12,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  resultTitle: {
    color:      "#fff",
    fontSize:   26,
    fontWeight: "700",
    letterSpacing: -0.3,
    marginBottom: 8,
  },

  badge: {
    flexDirection:  "row",
    alignItems:     "center",
    alignSelf:      "flex-start",
    borderRadius:   20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap:            6,
    borderWidth:    1,
    marginBottom:   8,
  },
  badgeDot:  { width: 7, height: 7, borderRadius: 4 },
  badgeText: { fontSize: 12, fontWeight: "600" },

  resultDesc: {
    color:      "rgba(255,255,255,0.75)",
    fontSize:   15,
    lineHeight: 22,
    marginBottom: 16,
  },

  answerBox: {
    backgroundColor: "rgba(255,107,53,0.12)",
    borderRadius:    16,
    padding:         14,
    marginBottom:    16,
    borderWidth:     1,
    borderColor:     "rgba(255,107,53,0.25)",
  },
  answerHeader: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           6,
    marginBottom:  6,
  },
  answerHeaderText: {
    color:      BRAND,
    fontSize:   12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  answerText: {
    color:      "#fff",
    fontSize:   15,
    lineHeight: 22,
  },

  factsSection: { marginBottom: 20 },
  sectionLabel: {
    color:      "rgba(255,255,255,0.45)",
    fontSize:   12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
  },
  factRow: {
    flexDirection:  "row",
    alignItems:     "flex-start",
    gap:            10,
    marginBottom:   8,
  },
  factDot: {
    width:           6,
    height:          6,
    borderRadius:    3,
    backgroundColor: BRAND,
    marginTop:       7,
    flexShrink:      0,
  },
  factText: {
    flex:       1,
    color:      "rgba(255,255,255,0.8)",
    fontSize:   14,
    lineHeight: 20,
  },

  actions: {
    flexDirection: "row",
    gap:           12,
    marginTop:     4,
  },
  actionBtn: {
    flex:            1,
    flexDirection:   "row",
    alignItems:      "center",
    justifyContent:  "center",
    gap:             8,
    paddingVertical: 13,
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     "rgba(255,107,53,0.35)",
  },
  actionBtnPrimary: {
    backgroundColor: BRAND,
    borderColor:     "transparent",
  },
  actionBtnPrimaryText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  actionBtnText:       { fontSize: 15, fontWeight: "600" },

  // Permission screen
  permScreen: { flex: 1, alignItems: "center", justifyContent: "center" },
  permInner:  { alignItems: "center", paddingHorizontal: 36 },
  permIcon: {
    width:          80,
    height:         80,
    borderRadius:   24,
    alignItems:     "center",
    justifyContent: "center",
    marginBottom:   24,
  },
  permTitle: {
    fontSize:     24,
    fontWeight:   "700",
    textAlign:    "center",
    marginBottom: 12,
  },
  permSub: {
    fontSize:     15,
    lineHeight:   22,
    textAlign:    "center",
    marginBottom: 32,
  },
  permBtn: {
    backgroundColor: BRAND,
    borderRadius:    16,
    paddingHorizontal: 32,
    paddingVertical: 14,
    marginBottom:    12,
    width:           "100%",
    alignItems:      "center",
  },
  permBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  permBack:    { paddingVertical: 8 },
  permBackText: { fontSize: 15 },

  // Web fallback
  webFallback: {
    flex:           1,
    alignItems:     "center",
    justifyContent: "center",
    backgroundColor: "#111",
    gap:            12,
  },
  webFallbackText: { color: "#999", fontSize: 14, textAlign: "center", paddingHorizontal: 32 },
  camLoading: {
    alignItems:     "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    gap:            12,
  },
  camLoadingText: { color: "#fff", fontSize: 14 },
});

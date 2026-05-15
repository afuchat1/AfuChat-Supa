/**
 * General-purpose QR Code Scanner
 * Handles: AfuChat IDs, URLs, Wi-Fi, plain text, contact cards, and more.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing,
} from "react-native-reanimated";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { useOpenLink } from "@/lib/useOpenLink";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width: SW, height: SH } = Dimensions.get("window");
const FRAME_SIZE = Math.min(SW * 0.72, 280);
const HISTORY_KEY = "afu_qr_history";
const MAX_HISTORY = 12;

// ─── Web scanner (BarcodeDetector / polyfill) ─────────────────────────────────

function WebQRScanner({ onScanned, active }: { onScanned: (data: string) => void; active: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then((stream) => {
        if (!mounted) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true");
          videoRef.current.play().then(() => { if (mounted) setReady(true); });
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!ready || !active) return;
    let detector: any = null;
    const BDC = (window as any).BarcodeDetector;
    async function setup() {
      if (typeof BDC !== "undefined") {
        detector = new BDC({ formats: ["qr_code"] });
      } else {
        try {
          const mod = await import("https://cdn.jsdelivr.net/npm/barcode-detector@3/dist/es/pure.min.js" as any);
          detector = new mod.BarcodeDetector({ formats: ["qr_code"] });
        } catch { return; }
      }
      intervalRef.current = setInterval(async () => {
        if (!videoRef.current || !detector) return;
        if (videoRef.current.readyState < 2) return;
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0) onScanned(barcodes[0].rawValue);
        } catch {}
      }, 350);
    }
    setup();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [ready, active, onScanned]);

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <video ref={videoRef as any} style={{ width: "100%", height: "100%", objectFit: "cover" } as any} autoPlay playsInline muted />
    </View>
  );
}

// ─── QR type detection ────────────────────────────────────────────────────────

type QRResult = {
  raw: string;
  type: "afuchat_id" | "afuchat_url" | "url" | "wifi" | "contact" | "email" | "phone" | "text";
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
  parsed?: Record<string, string>;
};

function parseQR(raw: string): QRResult {
  const s = raw.trim();

  // AfuChat ID
  if (s.startsWith("afuchat://id/")) {
    return { raw, type: "afuchat_id", label: "AfuChat User ID", icon: "person-circle", color: Colors.brand };
  }

  // AfuChat URL (profile or deep link)
  if (s.includes("afuchat.com") || s.startsWith("afuchat://")) {
    return { raw, type: "afuchat_url", label: "AfuChat Link", icon: "logo-buffer", color: Colors.brand };
  }

  // Wi-Fi
  if (s.startsWith("WIFI:")) {
    const ssid = (s.match(/S:([^;]+)/) || [])[1] || "";
    const pass = (s.match(/P:([^;]+)/) || [])[1] || "";
    const sec = (s.match(/T:([^;]+)/) || [])[1] || "";
    return { raw, type: "wifi", label: `Wi-Fi: ${ssid}`, icon: "wifi", color: "#007AFF", parsed: { ssid, password: pass, security: sec } };
  }

  // vCard / contact
  if (s.startsWith("BEGIN:VCARD")) {
    const name = (s.match(/FN:(.+)/) || [])[1]?.trim() || "Contact";
    return { raw, type: "contact", label: `Contact: ${name}`, icon: "person", color: "#34C759" };
  }

  // Email
  if (s.startsWith("mailto:") || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
    const email = s.replace("mailto:", "").split("?")[0];
    return { raw, type: "email", label: email, icon: "mail", color: "#FF9500" };
  }

  // Phone
  if (s.startsWith("tel:") || /^\+?[\d\s\-()]{7,20}$/.test(s)) {
    const phone = s.replace("tel:", "");
    return { raw, type: "phone", label: phone, icon: "call", color: "#34C759" };
  }

  // URL
  if (/^https?:\/\//.test(s)) {
    let domain = s;
    try { domain = new URL(s).hostname.replace("www.", ""); } catch {}
    return { raw, type: "url", label: domain, icon: "globe", color: "#5856D6" };
  }

  // Plain text
  return { raw, type: "text", label: s.slice(0, 60) + (s.length > 60 ? "…" : ""), icon: "text", color: "#8E8E93" };
}

// ─── History helpers ──────────────────────────────────────────────────────────

async function saveHistory(result: QRResult) {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    const existing: QRResult[] = raw ? JSON.parse(raw) : [];
    const deduped = existing.filter((r) => r.raw !== result.raw);
    const updated = [result, ...deduped].slice(0, MAX_HISTORY);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch {}
}

async function loadHistory(): Promise<QRResult[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function clearHistory() {
  await AsyncStorage.removeItem(HISTORY_KEY);
}

// ─── Result Sheet ─────────────────────────────────────────────────────────────

function ResultSheet({
  result, colors, insets, onClose, onRescan, user,
}: {
  result: QRResult; colors: any; insets: any; onClose: () => void; onRescan: () => void; user: any;
}) {
  const [resolving, setResolving] = useState(false);
  const openLink = useOpenLink();

  async function handleAfuChatId() {
    const rawAfuId = result.raw.replace("afuchat://id/", "").replace(/\s/g, "");
    const afuId = rawAfuId.padStart(8, "0");
    if (!/^\d{8}$/.test(afuId)) { showAlert("Invalid QR", "Not a valid AfuChat ID."); return; }
    if (!user) { router.push("/(auth)/login" as any); return; }
    setResolving(true);
    const { data } = await supabase.rpc("lookup_profile_by_afu_id", { p_afu_id: afuId });
    const profile = data?.[0];
    if (!profile) { showAlert("Not Found", "No user found with this AfuChat ID."); setResolving(false); return; }
    setResolving(false);
    onClose();
    router.push({ pathname: "/wallet/scan" as any, params: { prefill_afu_id: afuId } });
  }

  async function handleAfuChatUrl() {
    // Extract handle from afuchat.com URL
    try {
      const url = new URL(result.raw);
      const path = url.pathname.replace(/^\//, "");
      if (path) router.push(`/${path}` as any);
    } catch {}
    onClose();
  }

  function handleOpenUrl() {
    openLink(result.raw);
  }

  async function copyToClipboard(text: string) {
    await Clipboard.setStringAsync(text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showAlert("Copied", "Copied to clipboard.");
  }

  return (
    <View style={[sheet.container, { backgroundColor: colors.surface }]}>
      {/* Handle bar */}
      <View style={[sheet.handle, { backgroundColor: colors.border }]} />

      {/* Icon */}
      <View style={[sheet.iconWrap, { backgroundColor: result.color + "15" }]}>
        <Ionicons name={result.icon} size={32} color={result.color} />
      </View>

      <Text style={[sheet.typeLabel, { color: colors.textMuted }]}>
        {result.type.replace(/_/g, " ").toUpperCase()}
      </Text>
      <Text style={[sheet.valueText, { color: colors.text }]} numberOfLines={3} selectable>
        {result.label}
      </Text>

      {/* Wi-Fi details */}
      {result.type === "wifi" && result.parsed && (
        <View style={[sheet.detailCard, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
          <View style={sheet.detailRow}>
            <Text style={[sheet.detailLabel, { color: colors.textMuted }]}>Network</Text>
            <Text style={[sheet.detailValue, { color: colors.text }]}>{result.parsed.ssid}</Text>
          </View>
          {result.parsed.password ? (
            <View style={sheet.detailRow}>
              <Text style={[sheet.detailLabel, { color: colors.textMuted }]}>Password</Text>
              <Text style={[sheet.detailValue, { color: colors.text }]}>{result.parsed.password}</Text>
            </View>
          ) : null}
          <View style={sheet.detailRow}>
            <Text style={[sheet.detailLabel, { color: colors.textMuted }]}>Security</Text>
            <Text style={[sheet.detailValue, { color: colors.text }]}>{result.parsed.security || "Open"}</Text>
          </View>
        </View>
      )}

      {/* Action buttons */}
      <View style={sheet.actions}>
        {result.type === "afuchat_id" && (
          <TouchableOpacity
            style={[sheet.actionBtn, { backgroundColor: Colors.brand }]}
            onPress={handleAfuChatId}
            disabled={resolving}
          >
            {resolving
              ? <ActivityIndicator color="#fff" size="small" />
              : <><Ionicons name="person-circle" size={18} color="#fff" /><Text style={sheet.actionBtnText}>View Profile / Pay</Text></>}
          </TouchableOpacity>
        )}
        {result.type === "afuchat_url" && (
          <TouchableOpacity style={[sheet.actionBtn, { backgroundColor: Colors.brand }]} onPress={handleAfuChatUrl}>
            <Ionicons name="open-outline" size={18} color="#fff" />
            <Text style={sheet.actionBtnText}>Open in AfuChat</Text>
          </TouchableOpacity>
        )}
        {result.type === "url" && (
          <TouchableOpacity style={[sheet.actionBtn, { backgroundColor: "#5856D6" }]} onPress={handleOpenUrl}>
            <Ionicons name="globe" size={18} color="#fff" />
            <Text style={sheet.actionBtnText}>Open in Browser</Text>
          </TouchableOpacity>
        )}
        {result.type === "email" && (
          <TouchableOpacity style={[sheet.actionBtn, { backgroundColor: "#FF9500" }]} onPress={() => Linking.openURL(`mailto:${result.raw.replace("mailto:", "")}`)}>
            <Ionicons name="mail" size={18} color="#fff" />
            <Text style={sheet.actionBtnText}>Send Email</Text>
          </TouchableOpacity>
        )}
        {result.type === "phone" && (
          <TouchableOpacity style={[sheet.actionBtn, { backgroundColor: "#34C759" }]} onPress={() => Linking.openURL(`tel:${result.raw.replace("tel:", "")}`)}>
            <Ionicons name="call" size={18} color="#fff" />
            <Text style={sheet.actionBtnText}>Call Number</Text>
          </TouchableOpacity>
        )}

        {/* Copy raw value */}
        <TouchableOpacity
          style={[sheet.actionBtn, sheet.actionBtnSecondary, { borderColor: colors.border }]}
          onPress={() => copyToClipboard(result.raw)}
        >
          <Ionicons name="copy-outline" size={18} color={colors.text} />
          <Text style={[sheet.actionBtnText, { color: colors.text }]}>Copy</Text>
        </TouchableOpacity>

        {/* Scan again */}
        <TouchableOpacity
          style={[sheet.actionBtn, sheet.actionBtnSecondary, { borderColor: colors.border }]}
          onPress={onRescan}
        >
          <Ionicons name="scan" size={18} color={colors.text} />
          <Text style={[sheet.actionBtnText, { color: colors.text }]}>Scan Again</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function QRScannerScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [result, setResult] = useState<QRResult | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<QRResult[]>([]);
  const [torch, setTorch] = useState(false);
  const processedRef = useRef(false);

  const scanLineY = useSharedValue(0);
  useEffect(() => {
    scanLineY.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1, true,
    );
  }, []);
  const scanLineStyle = useAnimatedStyle(() => ({
    top: `${scanLineY.value * 100}%` as any,
  }));

  useEffect(() => {
    loadHistory().then(setHistory);
  }, []);

  const handleScanned = useCallback(async ({ data }: { data: string }) => {
    if (processedRef.current) return;
    processedRef.current = true;
    setScanned(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const r = parseQR(data);
    setResult(r);
    await saveHistory(r);
    setHistory(await loadHistory());
  }, []);

  const handleWebScanned = useCallback((data: string) => {
    handleScanned({ data });
  }, [handleScanned]);

  function rescan() {
    processedRef.current = false;
    setScanned(false);
    setResult(null);
  }

  if (Platform.OS !== "web" && !permission) {
    return (
      <View style={[s.root, s.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={Colors.brand} />
      </View>
    );
  }

  if (Platform.OS !== "web" && !permission?.granted) {
    return (
      <View style={[s.root, s.centered, { backgroundColor: colors.background, paddingHorizontal: 40 }]}>
        <View style={[s.permCard, { backgroundColor: colors.surface }]}>
          <Ionicons name="camera" size={48} color={colors.textMuted} style={{ marginBottom: 16 }} />
          <Text style={[s.permTitle, { color: colors.text }]}>Camera Required</Text>
          <Text style={[s.permSub, { color: colors.textMuted }]}>AfuChat needs camera access to scan QR codes</Text>
          <TouchableOpacity style={[s.permBtn, { backgroundColor: Colors.brand }]} onPress={requestPermission}>
            <Text style={s.permBtnText}>Allow Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: "#000" }]}>
      {/* Camera */}
      {Platform.OS === "web" ? (
        <WebQRScanner onScanned={handleWebScanned} active={!scanned} />
      ) : (
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          enableTorch={torch}
          onBarcodeScanned={scanned ? undefined : handleScanned}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        />
      )}

      {/* Dark overlay with cutout */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }} />
        <View style={{ flexDirection: "row", height: FRAME_SIZE }}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }} />
          <View style={{ width: FRAME_SIZE }} />
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }} />
        </View>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }} />
      </View>

      {/* Scan frame corners */}
      <View style={[s.frameWrap, { width: FRAME_SIZE, height: FRAME_SIZE }]} pointerEvents="none">
        {/* Corners */}
        {[
          { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
          { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
          { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
          { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
        ].map((corner, i) => (
          <View key={i} style={[s.corner, { ...corner, borderColor: scanned ? "#34C759" : Colors.brand }]} />
        ))}
        {/* Animated scan line */}
        {!scanned && (
          <Animated.View style={[s.scanLine, { backgroundColor: Colors.brand }, scanLineStyle]} />
        )}
        {/* Success checkmark */}
        {scanned && (
          <View style={s.successIcon}>
            <Ionicons name="checkmark-circle" size={56} color="#34C759" />
          </View>
        )}
      </View>

      {/* Top bar */}
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={s.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.topTitle}>QR Scanner</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {Platform.OS !== "web" && (
            <TouchableOpacity style={s.iconBtn} onPress={() => setTorch((t) => !t)}>
              <Ionicons name={torch ? "flash" : "flash-off"} size={22} color={torch ? "#FFD60A" : "#fff"} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.iconBtn} onPress={() => { loadHistory().then(setHistory); setShowHistory(true); }}>
            <Ionicons name="time-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Hint text */}
      {!scanned && (
        <View style={s.hintWrap}>
          <Text style={s.hintText}>Point camera at any QR code</Text>
        </View>
      )}

      {/* Result bottom sheet */}
      {result && (
        <View style={[s.resultSheet, { bottom: 0, paddingBottom: insets.bottom }]}>
          <ResultSheet
            result={result}
            colors={colors}
            insets={insets}
            onClose={() => { rescan(); }}
            onRescan={rescan}
            user={user}
          />
        </View>
      )}

      {/* History Modal */}
      <Modal visible={showHistory} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowHistory(false)}>
        <View style={[s.histModal, { backgroundColor: colors.background }]}>
          <View style={[s.histHeader, { borderBottomColor: colors.border, paddingTop: insets.top + 10 }]}>
            <Text style={[s.histTitle, { color: colors.text }]}>Scan History</Text>
            <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              {history.length > 0 && (
                <TouchableOpacity onPress={async () => { await clearHistory(); setHistory([]); }}>
                  <Text style={{ color: "#FF3B30", fontSize: 14, fontFamily: "Inter_600SemiBold" }}>Clear</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setShowHistory(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
            {history.length === 0 ? (
              <View style={[s.histEmpty]}>
                <Ionicons name="time-outline" size={48} color={colors.textMuted} />
                <Text style={[s.histEmptyText, { color: colors.textMuted }]}>No scan history yet</Text>
              </View>
            ) : (
              history.map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[s.histItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => {
                    setResult(item);
                    setScanned(true);
                    processedRef.current = true;
                    setShowHistory(false);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[s.histIcon, { backgroundColor: item.color + "15" }]}>
                    <Ionicons name={item.icon} size={20} color={item.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.histItemLabel, { color: colors.text }]} numberOfLines={1}>{item.label}</Text>
                    <Text style={[s.histItemType, { color: colors.textMuted }]}>
                      {item.type.replace(/_/g, " ")}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  centered: { alignItems: "center", justifyContent: "center" },

  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  topTitle: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },

  frameWrap: {
    position: "absolute",
    alignSelf: "center",
    top: "50%",
    marginTop: -(FRAME_SIZE / 2) - 30,
    overflow: "hidden",
  },
  corner: { position: "absolute", width: 28, height: 28, borderRadius: 2 },
  scanLine: { position: "absolute", left: 0, right: 0, height: 2, opacity: 0.85 },
  successIcon: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },

  hintWrap: { position: "absolute", bottom: "36%", left: 0, right: 0, alignItems: "center" },
  hintText: { color: "rgba(255,255,255,0.7)", fontSize: 14, fontFamily: "Inter_400Regular" },

  resultSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    maxHeight: SH * 0.55,
  },

  permCard: { borderRadius: 20, padding: 28, alignItems: "center", width: "100%" },
  permTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 8 },
  permSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, marginBottom: 24 },
  permBtn: { paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14, width: "100%", alignItems: "center" },
  permBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },

  histModal: { flex: 1 },
  histHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  histTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  histEmpty: { paddingTop: 80, alignItems: "center" },
  histEmptyText: { marginTop: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  histItem: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 16, marginTop: 10, padding: 14, borderRadius: 14, borderWidth: 1 },
  histIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  histItemLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  histItemType: { fontSize: 12, fontFamily: "Inter_400Regular", textTransform: "capitalize" },
});

const sheet = StyleSheet.create({
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
    ...Platform.select({
      web: { boxShadow: "0 -4px 20px rgba(0,0,0,0.15)" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 12 },
    }),
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 20 },
  iconWrap: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 14 },
  typeLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6, textAlign: "center", marginBottom: 6 },
  valueText: { fontSize: 15, fontFamily: "Inter_600SemiBold", textAlign: "center", marginBottom: 16, lineHeight: 22 },

  detailCard: { borderRadius: 12, borderWidth: 1, marginBottom: 16, overflow: "hidden" },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10 },
  detailLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  detailValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", maxWidth: "60%", textAlign: "right" },

  actions: { gap: 10 },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14 },
  actionBtnSecondary: { backgroundColor: "transparent", borderWidth: 1 },
  actionBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
});

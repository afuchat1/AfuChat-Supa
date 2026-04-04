import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";

const BRAND = "#00BCD4";
const GOLD = "#D4A853";

function padMember(n: number) {
  return String(n).padStart(6, "0");
}
function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtNum(n: number | null | undefined) {
  if (n == null) return "0";
  return n.toLocaleString();
}

function WebQRScanner({ onScanned, active }: { onScanned: (data: string) => void; active: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (!mounted) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true");
          await videoRef.current.play();
          setReady(true);
        }
      } catch {}
    }
    startCamera();
    return () => {
      mounted = false;
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!ready || !active) return;
    let BarcodeDetectorClass: any = (window as any).BarcodeDetector;
    let detector: any = null;
    async function setup() {
      if (typeof BarcodeDetectorClass !== "undefined") {
        detector = new BarcodeDetectorClass({ formats: ["qr_code"] });
      } else {
        try {
          const mod = await import("https://cdn.jsdelivr.net/npm/barcode-detector@3/dist/es/pure.min.js" as any);
          detector = new mod.BarcodeDetector({ formats: ["qr_code"] });
        } catch { return; }
      }
      scanIntervalRef.current = setInterval(async () => {
        if (!videoRef.current || !detector) return;
        if (videoRef.current.readyState < 2) return;
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0) onScanned(barcodes[0].rawValue);
        } catch {}
      }, 350);
    }
    setup();
    return () => { if (scanIntervalRef.current) clearInterval(scanIntervalRef.current); };
  }, [ready, active, onScanned]);

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <video ref={videoRef as any} style={{ width: "100%", height: "100%", objectFit: "cover" } as any} autoPlay playsInline muted />
      <canvas ref={canvasRef as any} style={{ display: "none" } as any} />
    </View>
  );
}

type FullRecord = {
  profile: Record<string, any>;
  memberNumber: number;
  counts: {
    posts: number;
    replies: number;
    followers: number;
    following: number;
    messages: number;
    stories: number;
    giftsReceived: number;
    giftsSent: number;
    referrals: number;
    channels: number;
  };
  subscription: Record<string, any> | null;
  scannedAt: string;
};

function parseAfuId(raw: string): string | null {
  const match = raw.match(/afuchat:\/\/id\/(\d+)/i);
  if (match) return match[1];
  if (/^\d{8}$/.test(raw.trim())) return raw.trim();
  return null;
}

async function fetchFullRecord(afuIdStr: string): Promise<FullRecord | null> {
  const afuIdNum = parseInt(afuIdStr, 10);

  const PROFILE_COLS = [
    "id", "handle", "display_name", "avatar_url", "bio",
    "phone_number", "email", "xp", "acoin", "current_grade",
    "is_verified", "is_admin", "is_organization_verified",
    "is_private", "show_online_status", "tipping_enabled",
    "country", "region", "language", "website_url",
    "gender", "date_of_birth", "interests",
    "onboarding_completed", "scheduled_deletion_at",
    "created_at", "updated_at",
  ].join(", ");

  const { data: profiles } = await supabase
    .from("profiles")
    .select(PROFILE_COLS)
    .order("created_at", { ascending: true });

  if (!profiles || profiles.length === 0) return null;

  const profile = profiles.find((p: any) => {
    const hex = p.id.replace(/-/g, "");
    const num = parseInt(hex.slice(0, 8), 16) % 100000000;
    return num === afuIdNum;
  });

  if (!profile) return null;

  const memberNumber = profiles.filter((p: any) => p.created_at < profile.created_at).length + 1;

  const [
    { count: posts },
    { count: replies },
    { count: followers },
    { count: following },
    { count: messages },
    { count: stories },
    { count: giftsReceived },
    { count: giftsSent },
    { count: referrals },
    { count: channels },
  ] = await Promise.all([
    supabase.from("posts").select("*", { count: "exact", head: true }).eq("author_id", profile.id).is("parent_id", null),
    supabase.from("posts").select("*", { count: "exact", head: true }).eq("author_id", profile.id).not("parent_id", "is", null),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", profile.id),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", profile.id),
    supabase.from("messages").select("*", { count: "exact", head: true }).eq("sender_id", profile.id),
    supabase.from("stories").select("*", { count: "exact", head: true }).eq("author_id", profile.id),
    supabase.from("gifts").select("*", { count: "exact", head: true }).eq("recipient_id", profile.id),
    supabase.from("gifts").select("*", { count: "exact", head: true }).eq("sender_id", profile.id),
    supabase.from("referrals").select("*", { count: "exact", head: true }).eq("referrer_id", profile.id),
    supabase.from("channels").select("*", { count: "exact", head: true }).eq("owner_id", profile.id),
  ]);

  const { data: subscription } = await supabase
    .from("user_subscriptions")
    .select("*, subscription_plans(name, tier)")
    .eq("user_id", profile.id)
    .eq("is_active", true)
    .maybeSingle();

  return {
    profile,
    memberNumber,
    counts: {
      posts: posts ?? 0,
      replies: replies ?? 0,
      followers: followers ?? 0,
      following: following ?? 0,
      messages: messages ?? 0,
      stories: stories ?? 0,
      giftsReceived: giftsReceived ?? 0,
      giftsSent: giftsSent ?? 0,
      referrals: referrals ?? 0,
      channels: channels ?? 0,
    },
    subscription: subscription ?? null,
    scannedAt: new Date().toISOString(),
  };
}

function downloadJson(record: FullRecord) {
  if (Platform.OS !== "web") return;
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `afuchat_id_${record.profile.handle}_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, accent && { color: BRAND }]}>{value}</Text>
    </View>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon as any} size={14} color={BRAND} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

export default function IdScannerScreen() {
  const { profile } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [record, setRecord] = useState<FullRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const processedRef = useRef(false);

  const isAdmin = !!profile?.is_admin;

  const scanLineY = useSharedValue(0);
  useEffect(() => {
    scanLineY.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
      -1, true,
    );
  }, []);

  const scanLineStyle = useAnimatedStyle(() => ({
    top: `${scanLineY.value * 100}%`,
  }));

  const handleScan = useCallback(async (raw: string) => {
    if (processedRef.current) return;
    processedRef.current = true;
    setScanned(true);
    setLoading(true);
    setError(null);

    const afuId = parseAfuId(raw);
    if (!afuId) {
      setError("Invalid QR — not an AfuChat Digital ID");
      setLoading(false);
      return;
    }

    try {
      const rec = await fetchFullRecord(afuId);
      if (!rec) {
        setError("No AfuChat account found for this ID");
      } else {
        setRecord(rec);
      }
    } catch (e: any) {
      setError("Failed to retrieve record: " + (e.message ?? "unknown error"));
    } finally {
      setLoading(false);
    }
  }, []);

  function reset() {
    processedRef.current = false;
    setScanned(false);
    setRecord(null);
    setError(null);
    setLoading(false);
  }

  if (!isAdmin) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { paddingLeft: 16 }]}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.centeredMsg}>
          <Ionicons name="lock-closed" size={40} color="#ffffff33" />
          <Text style={[styles.msgText, { color: colors.textMuted }]}>Admin access required</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Ionicons name="scan" size={18} color={BRAND} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>ID Scanner</Text>
        </View>
        {record && (
          <TouchableOpacity style={styles.downloadBtn} onPress={() => downloadJson(record)}>
            <Ionicons name="download-outline" size={20} color={BRAND} />
          </TouchableOpacity>
        )}
        {!record && <View style={{ width: 40 }} />}
      </View>

      {!scanned ? (
        <View style={styles.scannerContainer}>
          {Platform.OS === "web" ? (
            <WebQRScanner onScanned={handleScan} active={!scanned} />
          ) : permission?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              onBarcodeScanned={({ data }) => handleScan(data)}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            />
          ) : (
            <View style={styles.centeredMsg}>
              <Ionicons name="camera-outline" size={40} color="#ffffff33" />
              <Text style={[styles.msgText, { color: "#ffffff66" }]}>Camera permission required</Text>
              <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
                <Text style={styles.permBtnText}>Grant Permission</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.scanOverlay}>
            <View style={styles.scanBox}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
              <Animated.View style={[styles.scanLine, scanLineStyle]} />
            </View>
            <View style={styles.scanLabel}>
              <Ionicons name="scan-circle" size={18} color={BRAND} />
              <Text style={styles.scanLabelText}>Point at AfuChat Digital ID QR</Text>
            </View>
          </View>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {loading && (
            <View style={styles.centeredMsg}>
              <ActivityIndicator size="large" color={BRAND} />
              <Text style={[styles.msgText, { color: "#ffffff66", marginTop: 12 }]}>Fetching record…</Text>
            </View>
          )}

          {error && !loading && (
            <View style={styles.centeredMsg}>
              <Ionicons name="warning-outline" size={36} color="#FF3B30" />
              <Text style={[styles.msgText, { color: "#FF3B30", marginTop: 8 }]}>{error}</Text>
              <TouchableOpacity style={[styles.resetBtn, { marginTop: 20 }]} onPress={reset}>
                <Ionicons name="refresh" size={16} color="#fff" />
                <Text style={styles.resetBtnText}>Scan Again</Text>
              </TouchableOpacity>
            </View>
          )}

          {record && !loading && (
            <>
              <View style={[styles.recordHeader, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {record.profile.avatar_url ? (
                  <Image source={{ uri: record.profile.avatar_url }} style={styles.recordAvatar} />
                ) : (
                  <View style={[styles.recordAvatar, styles.recordAvatarPlaceholder]}>
                    <Ionicons name="person" size={28} color="#ffffff44" />
                  </View>
                )}
                <View style={styles.recordHeaderInfo}>
                  <Text style={[styles.recordName, { color: colors.text }]}>{record.profile.display_name ?? "—"}</Text>
                  <Text style={[styles.recordHandle, { color: colors.textMuted }]}>@{record.profile.handle}</Text>
                  <View style={styles.recordBadges}>
                    {record.profile.is_verified && (
                      <View style={[styles.badge, { backgroundColor: BRAND + "20", borderColor: BRAND + "60" }]}>
                        <Ionicons name="checkmark-circle" size={10} color={BRAND} />
                        <Text style={[styles.badgeText, { color: BRAND }]}>Verified</Text>
                      </View>
                    )}
                    {record.profile.is_admin && (
                      <View style={[styles.badge, { backgroundColor: GOLD + "20", borderColor: GOLD + "60" }]}>
                        <Ionicons name="shield-checkmark" size={10} color={GOLD} />
                        <Text style={[styles.badgeText, { color: GOLD }]}>Admin</Text>
                      </View>
                    )}
                    {record.subscription && (
                      <View style={[styles.badge, { backgroundColor: "#8B5CF620", borderColor: "#8B5CF660" }]}>
                        <Ionicons name="diamond" size={10} color="#8B5CF6" />
                        <Text style={[styles.badgeText, { color: "#8B5CF6" }]}>{(record.subscription as any)?.subscription_plans?.name ?? "Premium"}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={styles.memberTag}>
                  <Text style={[styles.memberTagLabel, { color: BRAND }]}>AFU‑{padMember(record.memberNumber)}</Text>
                </View>
              </View>

              <Section title="Identity" icon="finger-print">
                <Row label="AFU Member No." value={`AFU‑${padMember(record.memberNumber)}`} accent />
                <Row label="Handle" value={`@${record.profile.handle}`} />
                <Row label="Display Name" value={record.profile.display_name ?? "—"} />
                <Row label="User ID" value={record.profile.id} />
                <Row label="Country" value={record.profile.country ?? "—"} />
                <Row label="Region" value={record.profile.region ?? "—"} />
                <Row label="Language" value={record.profile.language ?? "—"} />
                <Row label="Gender" value={record.profile.gender ?? "—"} />
                <Row label="Date of Birth" value={fmt(record.profile.date_of_birth)} />
                <Row label="Joined" value={fmt(record.profile.created_at)} />
              </Section>

              <Section title="Account Status" icon="shield-checkmark">
                <Row label="Verified" value={record.profile.is_verified ? "Yes" : "No"} accent={record.profile.is_verified} />
                <Row label="Admin" value={record.profile.is_admin ? "Yes" : "No"} accent={record.profile.is_admin} />
                <Row label="Org. Verified" value={record.profile.is_organization_verified ? "Yes" : "No"} />
                <Row label="Private Account" value={record.profile.is_private ? "Yes" : "No"} />
                <Row label="Show Online" value={record.profile.show_online_status ? "Yes" : "No"} />
                <Row label="Tipping Enabled" value={record.profile.tipping_enabled ? "Yes" : "No"} />
                <Row label="Onboarding Done" value={record.profile.onboarding_completed ? "Yes" : "No"} />
                {record.profile.scheduled_deletion_at && (
                  <Row label="Deletion Scheduled" value={fmt(record.profile.scheduled_deletion_at)} />
                )}
                <Row label="Subscription" value={record.subscription ? ((record.subscription as any)?.subscription_plans?.tier ?? "Active") : "None"} />
              </Section>

              <Section title="Activity & Interactions" icon="bar-chart">
                <Row label="Posts" value={fmtNum(record.counts.posts)} />
                <Row label="Replies" value={fmtNum(record.counts.replies)} />
                <Row label="Stories" value={fmtNum(record.counts.stories)} />
                <Row label="Messages Sent" value={fmtNum(record.counts.messages)} />
                <Row label="Followers" value={fmtNum(record.counts.followers)} />
                <Row label="Following" value={fmtNum(record.counts.following)} />
                <Row label="Gifts Received" value={fmtNum(record.counts.giftsReceived)} />
                <Row label="Gifts Sent" value={fmtNum(record.counts.giftsSent)} />
                <Row label="Referrals" value={fmtNum(record.counts.referrals)} />
                <Row label="Channels Owned" value={fmtNum(record.counts.channels)} />
              </Section>

              <Section title="Economy" icon="cash">
                <Row label="Nexa (XP)" value={fmtNum(record.profile.xp)} accent />
                <Row label="ACoin Balance" value={fmtNum(record.profile.acoin)} accent />
                <Row label="Current Grade" value={record.profile.current_grade ?? "—"} />
              </Section>

              <Section title="Profile Info" icon="person-circle">
                <Row label="Bio" value={record.profile.bio ?? "—"} />
                <Row label="Website" value={record.profile.website_url ?? "—"} />
                <Row label="Phone" value={record.profile.phone_number ?? "—"} />
                <Row label="Interests" value={Array.isArray(record.profile.interests) ? record.profile.interests.join(", ") : (record.profile.interests ?? "—")} />
              </Section>

              <View style={styles.metaRow}>
                <Ionicons name="time-outline" size={12} color="#ffffff44" />
                <Text style={styles.metaText}>Scanned {fmt(record.scannedAt)} · Admin: @{profile?.handle}</Text>
              </View>

              <View style={styles.actions}>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: BRAND + "20", borderColor: BRAND + "40" }]} onPress={() => downloadJson(record)}>
                  <Ionicons name="download-outline" size={18} color={BRAND} />
                  <Text style={[styles.actionBtnText, { color: BRAND }]}>Download JSON</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#ffffff10", borderColor: "#ffffff20" }]} onPress={reset}>
                  <Ionicons name="scan-outline" size={18} color="#ffffffaa" />
                  <Text style={[styles.actionBtnText, { color: "#ffffffaa" }]}>Scan Another</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle: { fontSize: 17, fontWeight: "700", letterSpacing: 0.3 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  downloadBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },

  scannerContainer: { flex: 1, position: "relative", backgroundColor: "#000" },
  scanOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", pointerEvents: "none" as any },
  scanBox: { width: 220, height: 220, position: "relative" },
  corner: { position: "absolute", width: 22, height: 22, borderColor: BRAND, borderWidth: 3 },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 4 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 4 },
  scanLine: { position: "absolute", left: 8, right: 8, height: 2, backgroundColor: BRAND, opacity: 0.7, borderRadius: 1 },
  scanLabel: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: 24,
    backgroundColor: "#000000aa", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
  },
  scanLabelText: { fontSize: 13, color: "#ffffffcc", letterSpacing: 0.3 },

  scroll: { padding: 16, gap: 12 },
  centeredMsg: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 8 },
  msgText: { fontSize: 14, textAlign: "center" },
  permBtn: { marginTop: 16, backgroundColor: BRAND, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  permBtnText: { color: "#fff", fontWeight: "700" },
  resetBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: BRAND, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  resetBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  recordHeader: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 4,
  },
  recordAvatar: { width: 60, height: 60, borderRadius: 30 },
  recordAvatarPlaceholder: { backgroundColor: "#ffffff10", alignItems: "center", justifyContent: "center" },
  recordHeaderInfo: { flex: 1, gap: 2 },
  recordName: { fontSize: 17, fontWeight: "700" },
  recordHandle: { fontSize: 13 },
  recordBadges: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  badge: { flexDirection: "row", alignItems: "center", gap: 3, borderWidth: 0.5, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: "700" },
  memberTag: { alignItems: "flex-end" },
  memberTagLabel: { fontSize: 12, fontWeight: "800", letterSpacing: 1, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },

  section: { borderRadius: 12, overflow: "hidden", backgroundColor: "#ffffff08", borderWidth: 0.5, borderColor: "#ffffff15" },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: "#ffffff06", borderBottomWidth: 0.5, borderBottomColor: "#ffffff15" },
  sectionTitle: { fontSize: 12, fontWeight: "700", color: BRAND, letterSpacing: 0.8, textTransform: "uppercase" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: "#ffffff08" },
  rowLabel: { fontSize: 13, color: "#ffffff66", flex: 1 },
  rowValue: { fontSize: 13, color: "#ffffffcc", fontWeight: "500", flex: 1.5, textAlign: "right", flexWrap: "wrap" },

  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center", marginTop: 4 },
  metaText: { fontSize: 11, color: "#ffffff33" },

  actions: { flexDirection: "row", gap: 10, marginTop: 8 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 10, borderWidth: 1 },
  actionBtnText: { fontSize: 14, fontWeight: "600" },
});

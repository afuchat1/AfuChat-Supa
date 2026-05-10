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
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { DesktopCameraFallback } from "@/components/desktop/DesktopCameraFallback";
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
const GOLD  = "#D4A853";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function padMember(n: number) { return String(n).padStart(6, "0"); }

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtNum(n: number | null | undefined) {
  return n == null ? "0" : n.toLocaleString();
}

// ─── Web QR Scanner ───────────────────────────────────────────────────────────

function WebQRScanner({ onScanned, active }: { onScanned: (data: string) => void; active: boolean }) {
  const videoRef  = useRef<HTMLVideoElement | null>(null);
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
    let detector: any = null;
    async function setup() {
      const BarcodeDetectorClass: any = (window as any).BarcodeDetector;
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
      <video
        ref={videoRef as any}
        style={{ width: "100%", height: "100%", objectFit: "cover" } as any}
        autoPlay playsInline muted
      />
      <canvas ref={canvasRef as any} style={{ display: "none" } as any} />
    </View>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type FullRecord = {
  profile: Record<string, any>;
  memberNumber: number;
  counts: {
    posts: number; replies: number; followers: number; following: number;
    messages: number; stories: number; giftsReceived: number; giftsSent: number;
    referrals: number; channels: number;
  };
  subscription: Record<string, any> | null;
  scannedAt: string;
};

// ─── Data helpers ─────────────────────────────────────────────────────────────

function parseAfuId(raw: string): string | null {
  const match = raw.match(/afuchat:\/\/id\/(\d+)/i);
  if (match) return match[1];
  if (/^\d{8}$/.test(raw.trim())) return raw.trim();
  return null;
}

async function fetchFullRecord(afuIdStr: string): Promise<FullRecord | null> {
  const afuIdNum = parseInt(afuIdStr, 10);

  const COLS = [
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
    .select(COLS)
    .order("created_at", { ascending: true });

  if (!profiles || profiles.length === 0) return null;

  const profile = profiles.find((p: any) => {
    const hex = p.id.replace(/-/g, "");
    return parseInt(hex.slice(0, 8), 16) % 100000000 === afuIdNum;
  });
  if (!profile) return null;

  const memberNumber = profiles.filter((p: any) => p.created_at < profile.created_at).length + 1;

  const [
    { count: posts }, { count: replies }, { count: followers }, { count: following },
    { count: messages }, { count: stories }, { count: giftsReceived }, { count: giftsSent },
    { count: referrals }, { count: channels },
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
      posts: posts ?? 0, replies: replies ?? 0, followers: followers ?? 0,
      following: following ?? 0, messages: messages ?? 0, stories: stories ?? 0,
      giftsReceived: giftsReceived ?? 0, giftsSent: giftsSent ?? 0,
      referrals: referrals ?? 0, channels: channels ?? 0,
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

// ─── Row / Section sub-components ────────────────────────────────────────────

function Row({
  label, value, accent, colors,
}: {
  label: string;
  value: string;
  accent?: boolean;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <View style={[st.row, { borderBottomColor: colors.border }]}>
      <Text style={[st.rowLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text
        style={[st.rowValue, { color: accent ? BRAND : colors.text }]}
        numberOfLines={3}
      >
        {value}
      </Text>
    </View>
  );
}

function Section({
  title, icon, children, colors,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <View style={[st.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[st.sectionHeader, { backgroundColor: colors.backgroundSecondary, borderBottomColor: colors.border }]}>
        <Ionicons name={icon as any} size={13} color={BRAND} />
        <Text style={st.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

// ─── Screen export ────────────────────────────────────────────────────────────

export default function IdScannerScreen() {
  const { isDesktop } = useIsDesktop();
  if (isDesktop) {
    return (
      <DesktopCameraFallback
        title="ID verification on phone"
        description="Open AfuChat on a phone with a camera to scan or capture an ID. Use this code to jump straight to the scanner."
      />
    );
  }
  return <IdScannerScreenMobile />;
}

// ─── Mobile scanner screen ────────────────────────────────────────────────────

function IdScannerScreenMobile() {
  const { profile } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [record, setRecord]     = useState<FullRecord | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const processedRef = useRef(false);

  const isAdmin = !!profile?.is_admin;

  // Animated scan line
  const scanLineY = useSharedValue(0);
  useEffect(() => {
    scanLineY.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
      -1, true,
    );
  }, []);
  const scanLineStyle = useAnimatedStyle(() => ({ top: `${scanLineY.value * 100}%` }));

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
      if (!rec) setError("No AfuChat account found for this ID");
      else setRecord(rec);
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

  // ── Access gate ──
  if (!isAdmin) {
    return (
      <View style={[st.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={[st.backBtn, { marginLeft: 4 }]}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={st.centeredMsg}>
          <Ionicons name="lock-closed" size={40} color={colors.textMuted} />
          <Text style={[st.msgText, { color: colors.textMuted }]}>Admin access required</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>

      <GlassHeader
        title="ID Scanner"
        right={record ? (
          <TouchableOpacity onPress={() => downloadJson(record)} hitSlop={8}>
            <Ionicons name="download-outline" size={20} color={BRAND} />
          </TouchableOpacity>
        ) : undefined}
      />

      {/* ── Scanner view ── */}
      {!scanned && (
        <View style={st.scannerContainer}>
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
            <View style={st.centeredMsg}>
              <Ionicons name="camera-outline" size={44} color="rgba(255,255,255,0.35)" />
              <Text style={[st.msgText, { color: "rgba(255,255,255,0.5)", marginTop: 8 }]}>
                Camera permission required
              </Text>
              <TouchableOpacity style={[st.actionPrimary, { marginTop: 20 }]} onPress={requestPermission}>
                <Text style={st.actionPrimaryText}>Grant Camera Access</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Overlay: corners + scan line + label */}
          <View style={st.scanOverlay} pointerEvents="none">
            <View style={st.scanBox}>
              <View style={[st.corner, st.cornerTL]} />
              <View style={[st.corner, st.cornerTR]} />
              <View style={[st.corner, st.cornerBL]} />
              <View style={[st.corner, st.cornerBR]} />
              <Animated.View style={[st.scanLine, scanLineStyle]} />
            </View>
            <View style={st.scanLabel}>
              <Ionicons name="scan-circle" size={16} color={BRAND} />
              <Text style={st.scanLabelText}>Point at AfuChat Digital ID QR</Text>
            </View>
          </View>
        </View>
      )}

      {/* ── Loading state ── */}
      {scanned && loading && (
        <View style={[st.centeredMsg, { flex: 1 }]}>
          <ActivityIndicator size="large" color={BRAND} />
          <Text style={[st.msgText, { color: colors.textMuted, marginTop: 12 }]}>
            Fetching record…
          </Text>
        </View>
      )}

      {/* ── Error state ── */}
      {scanned && !loading && error && (
        <View style={[st.centeredMsg, { flex: 1 }]}>
          <Ionicons name="warning-outline" size={44} color="#FF3B30" />
          <Text style={[st.msgText, { color: "#FF3B30", marginTop: 8 }]}>{error}</Text>
          <TouchableOpacity style={[st.actionPrimary, { marginTop: 24 }]} onPress={reset}>
            <Ionicons name="refresh" size={16} color="#fff" />
            <Text style={st.actionPrimaryText}>Scan Again</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Record results ── */}
      {scanned && !loading && record && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[st.scroll, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Profile card */}
          <View style={[st.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={st.profileCardTop}>
              {record.profile.avatar_url ? (
                <Image source={{ uri: record.profile.avatar_url }} style={st.avatar} />
              ) : (
                <View style={[st.avatar, st.avatarPlaceholder, { backgroundColor: colors.backgroundSecondary }]}>
                  <Ionicons name="person" size={28} color={colors.textMuted} />
                </View>
              )}
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[st.profileName, { color: colors.text }]} numberOfLines={1}>
                  {record.profile.display_name ?? "—"}
                </Text>
                <Text style={[st.profileHandle, { color: colors.textSecondary }]}>
                  @{record.profile.handle}
                </Text>

                {/* Badges */}
                <View style={st.badgeRow}>
                  {record.profile.is_verified && (
                    <View style={[st.badge, { backgroundColor: BRAND + "20", borderColor: BRAND + "50" }]}>
                      <Ionicons name="checkmark-circle" size={10} color={BRAND} />
                      <Text style={[st.badgeText, { color: BRAND }]}>Verified</Text>
                    </View>
                  )}
                  {record.profile.is_admin && (
                    <View style={[st.badge, { backgroundColor: GOLD + "20", borderColor: GOLD + "50" }]}>
                      <Ionicons name="shield-checkmark" size={10} color={GOLD} />
                      <Text style={[st.badgeText, { color: GOLD }]}>Admin</Text>
                    </View>
                  )}
                  {record.subscription && (
                    <View style={[st.badge, { backgroundColor: "#8B5CF620", borderColor: "#8B5CF650" }]}>
                      <Ionicons name="diamond" size={10} color="#8B5CF6" />
                      <Text style={[st.badgeText, { color: "#8B5CF6" }]}>
                        {(record.subscription as any)?.subscription_plans?.name ?? "Premium"}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Member number strip */}
            <View style={[st.memberStrip, { borderTopColor: colors.border, backgroundColor: colors.backgroundSecondary }]}>
              <Ionicons name="id-card-outline" size={13} color={BRAND} />
              <Text style={[st.memberStripText, { color: BRAND }]}>
                AFU‑{padMember(record.memberNumber)}
              </Text>
              <Text style={[st.memberStripSub, { color: colors.textMuted }]}>
                Member #{record.memberNumber}
              </Text>
            </View>
          </View>

          {/* Identity */}
          <Section title="Identity" icon="finger-print" colors={colors}>
            <Row label="AFU Member No."  value={`AFU‑${padMember(record.memberNumber)}`} accent colors={colors} />
            <Row label="Handle"          value={`@${record.profile.handle}`} colors={colors} />
            <Row label="Display Name"    value={record.profile.display_name ?? "—"} colors={colors} />
            <Row label="User ID"         value={record.profile.id} colors={colors} />
            <Row label="Country"         value={record.profile.country ?? "—"} colors={colors} />
            <Row label="Region"          value={record.profile.region ?? "—"} colors={colors} />
            <Row label="Language"        value={record.profile.language ?? "—"} colors={colors} />
            <Row label="Gender"          value={record.profile.gender ?? "—"} colors={colors} />
            <Row label="Date of Birth"   value={fmt(record.profile.date_of_birth)} colors={colors} />
            <Row label="Joined"          value={fmt(record.profile.created_at)} colors={colors} />
          </Section>

          {/* Account Status */}
          <Section title="Account Status" icon="shield-checkmark" colors={colors}>
            <Row label="Verified"          value={record.profile.is_verified ? "Yes" : "No"} accent={record.profile.is_verified} colors={colors} />
            <Row label="Admin"             value={record.profile.is_admin ? "Yes" : "No"} accent={record.profile.is_admin} colors={colors} />
            <Row label="Org. Verified"     value={record.profile.is_organization_verified ? "Yes" : "No"} colors={colors} />
            <Row label="Private Account"   value={record.profile.is_private ? "Yes" : "No"} colors={colors} />
            <Row label="Show Online"       value={record.profile.show_online_status ? "Yes" : "No"} colors={colors} />
            <Row label="Tipping Enabled"   value={record.profile.tipping_enabled ? "Yes" : "No"} colors={colors} />
            <Row label="Onboarding Done"   value={record.profile.onboarding_completed ? "Yes" : "No"} colors={colors} />
            {record.profile.scheduled_deletion_at && (
              <Row label="Deletion Scheduled" value={fmt(record.profile.scheduled_deletion_at)} colors={colors} />
            )}
            <Row label="Subscription"      value={record.subscription ? ((record.subscription as any)?.subscription_plans?.tier ?? "Active") : "None"} colors={colors} />
          </Section>

          {/* Activity */}
          <Section title="Activity & Interactions" icon="bar-chart" colors={colors}>
            <Row label="Posts"          value={fmtNum(record.counts.posts)} colors={colors} />
            <Row label="Replies"        value={fmtNum(record.counts.replies)} colors={colors} />
            <Row label="Stories"        value={fmtNum(record.counts.stories)} colors={colors} />
            <Row label="Messages Sent"  value={fmtNum(record.counts.messages)} colors={colors} />
            <Row label="Followers"      value={fmtNum(record.counts.followers)} colors={colors} />
            <Row label="Following"      value={fmtNum(record.counts.following)} colors={colors} />
            <Row label="Gifts Received" value={fmtNum(record.counts.giftsReceived)} colors={colors} />
            <Row label="Gifts Sent"     value={fmtNum(record.counts.giftsSent)} colors={colors} />
            <Row label="Referrals"      value={fmtNum(record.counts.referrals)} colors={colors} />
            <Row label="Channels Owned" value={fmtNum(record.counts.channels)} colors={colors} />
          </Section>

          {/* Economy */}
          <Section title="Economy" icon="cash" colors={colors}>
            <Row label="Nexa (XP)"      value={fmtNum(record.profile.xp)} accent colors={colors} />
            <Row label="ACoin Balance"  value={fmtNum(record.profile.acoin)} accent colors={colors} />
            <Row label="Current Grade"  value={record.profile.current_grade ?? "—"} colors={colors} />
          </Section>

          {/* Profile Info */}
          <Section title="Profile Info" icon="person-circle" colors={colors}>
            <Row label="Bio"      value={record.profile.bio ?? "—"} colors={colors} />
            <Row label="Website"  value={record.profile.website_url ?? "—"} colors={colors} />
            <Row label="Phone"    value={record.profile.phone_number ?? "—"} colors={colors} />
            <Row
              label="Interests"
              value={Array.isArray(record.profile.interests) ? record.profile.interests.join(", ") : (record.profile.interests ?? "—")}
              colors={colors}
            />
          </Section>

          {/* Meta */}
          <View style={st.metaRow}>
            <Ionicons name="time-outline" size={12} color={colors.textMuted} />
            <Text style={[st.metaText, { color: colors.textMuted }]}>
              Scanned {fmt(record.scannedAt)} · Admin: @{profile?.handle}
            </Text>
          </View>

          {/* Actions */}
          <View style={st.actions}>
            <TouchableOpacity
              style={[st.actionOutline, { borderColor: BRAND + "50", backgroundColor: BRAND + "15" }]}
              onPress={() => downloadJson(record)}
            >
              <Ionicons name="download-outline" size={17} color={BRAND} />
              <Text style={[st.actionOutlineText, { color: BRAND }]}>Download JSON</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.actionOutline, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={reset}
            >
              <Ionicons name="scan-outline" size={17} color={colors.text} />
              <Text style={[st.actionOutlineText, { color: colors.text }]}>Scan Another</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 8, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", letterSpacing: 0.2 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerAction: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },

  // Scanner
  scannerContainer: { flex: 1, backgroundColor: "#000", position: "relative" },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center", justifyContent: "center",
  },
  scanBox: { width: 230, height: 230, position: "relative" },
  corner: { position: "absolute", width: 24, height: 24, borderColor: BRAND, borderWidth: 3 },
  cornerTL: { top: 0,    left: 0,   borderRightWidth: 0,  borderBottomWidth: 0, borderTopLeftRadius: 5 },
  cornerTR: { top: 0,    right: 0,  borderLeftWidth: 0,   borderBottomWidth: 0, borderTopRightRadius: 5 },
  cornerBL: { bottom: 0, left: 0,   borderRightWidth: 0,  borderTopWidth: 0,    borderBottomLeftRadius: 5 },
  cornerBR: { bottom: 0, right: 0,  borderLeftWidth: 0,   borderTopWidth: 0,    borderBottomRightRadius: 5 },
  scanLine: {
    position: "absolute", left: 10, right: 10, height: 2,
    backgroundColor: BRAND, opacity: 0.75, borderRadius: 1,
  },
  scanLabel: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: 28,
    backgroundColor: "rgba(0,0,0,0.65)", paddingHorizontal: 18, paddingVertical: 9, borderRadius: 22,
  },
  scanLabelText: { fontSize: 13, color: "rgba(255,255,255,0.9)", fontFamily: "Inter_500Medium" },

  // States
  centeredMsg: { alignItems: "center", justifyContent: "center", padding: 48, gap: 6 },
  msgText: { fontSize: 14, textAlign: "center", fontFamily: "Inter_500Medium" },

  // Buttons
  actionPrimary: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: BRAND, paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: 10,
  },
  actionPrimaryText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },

  // Scroll / results
  scroll: { padding: 16, gap: 14 },

  // Profile card
  profileCard: {
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden",
  },
  profileCardTop: { flexDirection: "row", alignItems: "flex-start", gap: 14, padding: 16 },
  avatar: { width: 62, height: 62, borderRadius: 31, flexShrink: 0 },
  avatarPlaceholder: { alignItems: "center", justifyContent: "center" },
  profileName: { fontSize: 17, fontFamily: "Inter_700Bold" },
  profileHandle: { fontSize: 13, fontFamily: "Inter_400Regular" },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 5 },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    borderWidth: 0.5, borderRadius: 5,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  badgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  memberStrip: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  memberStripText: {
    fontSize: 13, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontWeight: "800", letterSpacing: 1, flex: 1,
  },
  memberStripSub: { fontSize: 12, fontFamily: "Inter_400Regular" },

  // Sections
  section: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: {
    fontSize: 11, fontFamily: "Inter_700Bold",
    color: BRAND, letterSpacing: 0.8, textTransform: "uppercase",
  },
  row: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  rowValue: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1.4, textAlign: "right", flexWrap: "wrap" },

  // Meta + actions
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center", marginTop: -2 },
  metaText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  actions: { flexDirection: "row", gap: 10 },
  actionOutline: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 7, paddingVertical: 13, borderRadius: 11, borderWidth: 1,
  },
  actionOutlineText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});

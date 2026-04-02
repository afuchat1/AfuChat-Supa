import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";

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

type ScannedProfile = {
  userId: string;
  afu_id: string;
  handle: string;
  name: string;
  avatar: string | null;
  bio: string | null;
  country: string | null;
  region: string | null;
  verified: boolean;
  orgVerified: boolean;
  grade: string;
  xp: number;
};

type ActionMode = "pay" | "request";

export default function ScanScreen() {
  const { colors } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [scannedProfile, setScannedProfile] = useState<ScannedProfile | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [actionMode, setActionMode] = useState<ActionMode>("pay");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const processedRef = useRef(false);

  const scanLineY = useSharedValue(0);
  useEffect(() => {
    scanLineY.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);

  const scanLineStyle = useAnimatedStyle(() => ({
    top: `${scanLineY.value * 100}%`,
  }));

  const handleBarCodeScanned = useCallback(
    async ({ data }: { data: string }) => {
      if (processedRef.current) return;
      processedRef.current = true;
      setScanned(true);
      setLookingUp(true);

      if (!data.startsWith("afuchat://id/")) {
        showAlert("Invalid QR", "This is not a valid AfuChat ID card QR code.");
        processedRef.current = false;
        setScanned(false);
        setLookingUp(false);
        return;
      }

      const rawAfuId = data.replace("afuchat://id/", "").replace(/\s/g, "");
      const scannedAfuId = rawAfuId.padStart(8, "0");

      if (!/^\d{8}$/.test(scannedAfuId)) {
        showAlert("Invalid QR", "Invalid AfuChat ID format.");
        processedRef.current = false;
        setScanned(false);
        setLookingUp(false);
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const { data: rows, error } = await supabase.rpc("lookup_profile_by_afu_id", {
        p_afu_id: scannedAfuId,
      });

      const matchedProfile = rows?.[0] ?? null;

      if (error || !matchedProfile) {
        showAlert("Not Found", "No user found with this AfuChat ID.");
        processedRef.current = false;
        setScanned(false);
        setLookingUp(false);
        return;
      }

      if (matchedProfile.id === user?.id) {
        showAlert("That's You!", "You scanned your own AfuChat ID card.");
        processedRef.current = false;
        setScanned(false);
        setLookingUp(false);
        return;
      }

      setScannedProfile({
        userId: matchedProfile.id,
        afu_id: scannedAfuId,
        handle: matchedProfile.handle || "",
        name: matchedProfile.display_name || "",
        avatar: matchedProfile.avatar_url,
        bio: matchedProfile.bio,
        country: matchedProfile.country,
        region: matchedProfile.region,
        verified: matchedProfile.is_verified || false,
        orgVerified: matchedProfile.is_organization_verified || false,
        grade: matchedProfile.current_grade || "explorer",
        xp: matchedProfile.xp || 0,
      });
      setLookingUp(false);
    },
    [user],
  );

  function openAction(mode: ActionMode) {
    setActionMode(mode);
    setAmount("");
    setMessage("");
    setShowModal(true);
  }

  function resetScanner() {
    setScannedProfile(null);
    setScanned(false);
    setShowModal(false);
    setAmount("");
    setMessage("");
    processedRef.current = false;
  }

  async function submitPay() {
    if (!scannedProfile?.userId || !user || !profile || !amount.trim()) return;
    const amt = parseInt(amount);
    if (isNaN(amt) || amt <= 0) {
      showAlert("Invalid Amount", "Please enter a valid ACoin amount.");
      return;
    }
    if (amt > (profile.acoin || 0)) {
      showAlert("Insufficient Balance", `You only have ${profile.acoin || 0} ACoin.`);
      return;
    }

    showAlert(
      "Confirm Payment",
      `Send ${amt} ACoin to @${scannedProfile.handle}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Pay",
          onPress: async () => {
            setSending(true);

            const { error: deductErr } = await supabase.rpc("deduct_acoin", {
              p_user_id: user.id,
              p_amount: amt,
            });
            if (deductErr) {
              showAlert("Error", "Could not deduct ACoin — balance may have changed.");
              setSending(false);
              return;
            }

            const { error: creditErr } = await supabase.rpc("credit_acoin", {
              p_user_id: scannedProfile.userId,
              p_amount: amt,
            });
            if (creditErr) {
              await supabase.rpc("credit_acoin", { p_user_id: user.id, p_amount: amt });
              showAlert("Error", "Could not credit recipient. Your ACoin has been refunded.");
              setSending(false);
              return;
            }

            await supabase.from("acoin_transactions").insert([
              {
                user_id: user.id,
                amount: -amt,
                transaction_type: "acoin_transfer_sent",
                metadata: {
                  to_handle: scannedProfile.handle,
                  to_user_id: scannedProfile.userId,
                  via: "qr_scan",
                  message: message.trim() || null,
                },
              },
              {
                user_id: scannedProfile.userId,
                amount: amt,
                transaction_type: "acoin_transfer_received",
                metadata: {
                  from_handle: profile.handle,
                  from_user_id: user.id,
                  via: "qr_scan",
                  message: message.trim() || null,
                },
              },
            ]);

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            showAlert("Payment Sent!", `${amt} ACoin sent to @${scannedProfile.handle}`);
            setSending(false);
            refreshProfile();
            resetScanner();
            router.back();
          },
        },
      ],
    );
  }

  async function submitRequest() {
    if (!scannedProfile?.userId || !user || !amount.trim()) return;
    const amt = parseInt(amount);
    if (isNaN(amt) || amt <= 0) {
      showAlert("Invalid Amount", "Please enter a valid ACoin amount.");
      return;
    }
    setSending(true);

    const { error } = await supabase.from("transaction_requests").insert({
      requester_id: user.id,
      owner_id: scannedProfile.userId,
      currency: "acoin",
      amount: amt,
      message: message.trim() || null,
    });

    if (error) {
      showAlert("Error", error.message);
      setSending(false);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showAlert("Request Sent!", `Requested ${amt} ACoin from @${scannedProfile.handle}`);
    setSending(false);
    resetScanner();
    router.back();
  }

  if (!permission) {
    return (
      <View style={[styles.root, { backgroundColor: "#000" }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.permBox, { paddingTop: insets.top + 20 }]}>
          <View style={[styles.permIconCircle, { backgroundColor: colors.accent + "18" }]}>
            <Ionicons name="camera-outline" size={48} color={colors.accent} />
          </View>
          <Text style={[styles.permTitle, { color: colors.text }]}>Camera Access Required</Text>
          <Text style={[styles.permSub, { color: colors.textSecondary }]}>
            We need camera permission to scan AfuChat ID card QR codes for payments.
          </Text>
          <TouchableOpacity style={[styles.permBtn, { backgroundColor: colors.accent }]} onPress={requestPermission}>
            <Ionicons name="camera" size={18} color="#fff" />
            <Text style={styles.permBtnText}>Allow Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 14 }}>
            <Text style={{ color: colors.textMuted, fontSize: 15 }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const isPay = actionMode === "pay";

  return (
    <View style={styles.root}>
      {Platform.OS === "web" ? (
        <WebQRScanner onScanned={(d) => handleBarCodeScanned({ data: d })} active={!scanned} />
      ) : (
        <CameraView
          style={StyleSheet.absoluteFillObject}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        />
      )}

      <View style={styles.overlay}>
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Scan to Pay</Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.scanArea}>
          <Text style={styles.scanLabel}>Point at an AfuChat ID card</Text>
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.tl, { borderColor: colors.accent }]} />
            <View style={[styles.corner, styles.tr, { borderColor: colors.accent }]} />
            <View style={[styles.corner, styles.bl, { borderColor: colors.accent }]} />
            <View style={[styles.corner, styles.br, { borderColor: colors.accent }]} />
            <Animated.View style={[styles.scanLine, { backgroundColor: colors.accent, shadowColor: colors.accent }, scanLineStyle]} />
          </View>
          <Text style={styles.scanHint}>
            Align the QR code within the frame
          </Text>
        </View>
      </View>

      {lookingUp && (
        <View style={styles.resultOverlay}>
          <View style={[styles.resultCard, { backgroundColor: colors.surface, alignItems: "center", paddingVertical: 48 }]}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 14, fontFamily: "Inter_400Regular" }}>
              Looking up user...
            </Text>
          </View>
        </View>
      )}

      {scannedProfile && !showModal && !lookingUp && (
        <View style={styles.resultOverlay}>
          <View style={[styles.resultCard, { backgroundColor: colors.surface }]}>
            <View style={styles.resultHeader}>
              {scannedProfile.avatar ? (
                <Image source={{ uri: scannedProfile.avatar }} style={styles.resultAvatar} />
              ) : (
                <View style={[styles.resultAvatar, { backgroundColor: colors.accent + "22", justifyContent: "center", alignItems: "center" }]}>
                  <Text style={{ fontSize: 22, color: colors.accent }}>{(scannedProfile.name || "?")[0].toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <Text style={[styles.resultName, { color: colors.text }]} numberOfLines={1}>{scannedProfile.name}</Text>
                  {scannedProfile.verified && (
                    <Ionicons name="checkmark-circle" size={16} color={scannedProfile.orgVerified ? Colors.gold : colors.accent} />
                  )}
                </View>
                <Text style={[styles.resultHandle, { color: colors.textMuted }]}>@{scannedProfile.handle}</Text>
                {(scannedProfile.region || scannedProfile.country) && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 }}>
                    <Ionicons name="location-outline" size={11} color={colors.accent} />
                    <Text style={{ color: colors.textMuted, fontSize: 11, fontFamily: "Inter_400Regular" }}>
                      {[scannedProfile.region, scannedProfile.country].filter(Boolean).join(", ")}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {scannedProfile.bio ? (
              <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18, fontFamily: "Inter_400Regular" }} numberOfLines={2}>
                {scannedProfile.bio}
              </Text>
            ) : null}

            <View style={[styles.idPill, { backgroundColor: colors.backgroundTertiary || colors.backgroundSecondary }]}>
              <Ionicons name="card-outline" size={13} color={colors.accent} />
              <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: "Inter_400Regular" }}>AFU ID</Text>
              <Text style={{ color: colors.text, fontSize: 15, fontFamily: "Inter_700Bold", letterSpacing: 2 }}>
                {scannedProfile.afu_id.slice(0, 4)} {scannedProfile.afu_id.slice(4)}
              </Text>
            </View>

            <View style={styles.actionBtns}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: Colors.gold || "#D4A853" }]}
                onPress={() => openAction("pay")}
              >
                <Ionicons name="arrow-up-circle" size={20} color="#fff" />
                <Text style={styles.actionBtnText}>Pay</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.accent }]}
                onPress={() => openAction("request")}
              >
                <Ionicons name="arrow-down-circle" size={20} color="#fff" />
                <Text style={styles.actionBtnText}>Request</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.scanAgainBtn} onPress={resetScanner}>
              <Ionicons name="scan-outline" size={16} color={colors.accent} />
              <Text style={{ color: colors.accent, fontSize: 14, fontFamily: "Inter_600SemiBold" }}>Scan Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Modal visible={showModal} animationType="slide" transparent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
              <View style={styles.dragHandle} />
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  {isPay ? "Pay ACoin" : "Request ACoin"}
                </Text>
                <TouchableOpacity onPress={() => setShowModal(false)}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.recipientRow}>
                {scannedProfile?.avatar ? (
                  <Image source={{ uri: scannedProfile.avatar }} style={styles.recipientAvatar} />
                ) : (
                  <View style={[styles.recipientAvatar, { backgroundColor: colors.accent + "22", alignItems: "center", justifyContent: "center" }]}>
                    <Text style={{ color: colors.accent }}>{(scannedProfile?.name || "?")[0].toUpperCase()}</Text>
                  </View>
                )}
                <View>
                  <Text style={{ color: colors.text, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>{scannedProfile?.name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>@{scannedProfile?.handle}</Text>
                </View>
              </View>

              {isPay && (
                <View style={[styles.balanceRow, { backgroundColor: colors.backgroundSecondary || colors.backgroundTertiary }]}>
                  <Ionicons name="diamond" size={14} color={Colors.gold || "#D4A853"} />
                  <Text style={{ color: colors.textSecondary, fontSize: 13, fontFamily: "Inter_400Regular" }}>
                    Your balance: <Text style={{ fontFamily: "Inter_700Bold", color: colors.text }}>{profile?.acoin || 0} ACoin</Text>
                  </Text>
                </View>
              )}

              <TextInput
                style={[styles.modalInput, { color: colors.text, backgroundColor: colors.backgroundSecondary || colors.inputBg, borderColor: colors.border }]}
                placeholder="Amount (ACoin)"
                placeholderTextColor={colors.textMuted}
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                autoFocus
              />
              <TextInput
                style={[styles.modalInput, { color: colors.text, backgroundColor: colors.backgroundSecondary || colors.inputBg, borderColor: colors.border }]}
                placeholder="Message (optional)"
                placeholderTextColor={colors.textMuted}
                value={message}
                onChangeText={setMessage}
              />

              <TouchableOpacity
                style={[
                  styles.sendBtn,
                  { backgroundColor: isPay ? Colors.gold || "#D4A853" : colors.accent },
                  (sending || !amount.trim()) && { opacity: 0.55 },
                ]}
                onPress={isPay ? submitPay : submitRequest}
                disabled={sending || !amount.trim()}
              >
                {sending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name={isPay ? "arrow-up-circle" : "arrow-down-circle"} size={18} color="#fff" />
                    <Text style={styles.sendBtnText}>{isPay ? "Pay" : "Send Request"}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: "space-between" },
  topBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: { color: "#fff", fontSize: 17, fontFamily: "Inter_600SemiBold" },
  scanArea: { flex: 1, alignItems: "center", justifyContent: "center", gap: 20 },
  scanLabel: { color: "rgba(255,255,255,0.8)", fontSize: 13, fontFamily: "Inter_500Medium" },
  scanFrame: { width: 256, height: 256, position: "relative" },
  corner: { position: "absolute", width: 32, height: 32, borderColor: Colors.brand, borderWidth: 3.5 },
  tl: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 14 },
  tr: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 14 },
  bl: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 14 },
  br: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 14 },
  scanLine: {
    position: "absolute",
    left: 6,
    right: 6,
    height: 2.5,
    backgroundColor: Colors.brand,
    borderRadius: 2,
    shadowColor: Colors.brand,
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  scanHint: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    textAlign: "center",
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 40,
  },
  permBox: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16, paddingHorizontal: 40 },
  permIconCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: Colors.brand + "18", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  permTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  permSub: { fontSize: 15, textAlign: "center", lineHeight: 23, fontFamily: "Inter_400Regular" },
  permBtn: { backgroundColor: Colors.brand, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 28, flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  permBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  resultOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.65)" },
  resultCard: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 14 },
  resultHeader: { flexDirection: "row", alignItems: "center", gap: 14 },
  resultAvatar: { width: 56, height: 56, borderRadius: 28 },
  resultName: { fontSize: 18, fontFamily: "Inter_700Bold" },
  resultHandle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 1 },
  idPill: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  actionBtns: { flexDirection: "row", gap: 12 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 28, paddingVertical: 14 },
  actionBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  scanAgainBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 8 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  modalContent: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 14 },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(0,0,0,0.15)", alignSelf: "center", marginBottom: 4 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  recipientRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  recipientAvatar: { width: 40, height: 40, borderRadius: 20 },
  balanceRow: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  modalInput: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, fontFamily: "Inter_400Regular" },
  sendBtn: { borderRadius: 28, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  sendBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
});

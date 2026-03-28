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
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
            focusMode: "continuous" as any,
          },
        });
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true");
          await videoRef.current.play();
          setReady(true);
        }
      } catch (_) {}
    }

    startCamera();

    return () => {
      mounted = false;
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!ready || !active) return;

    let BarcodeDetectorClass: any = (window as any).BarcodeDetector;
    let detector: any = null;
    let fallbackModule: any = null;

    async function setup() {
      if (typeof BarcodeDetectorClass !== "undefined") {
        detector = new BarcodeDetectorClass({ formats: ["qr_code"] });
      } else {
        try {
          const mod = await import("https://cdn.jsdelivr.net/npm/barcode-detector@3/dist/es/pure.min.js" as any);
          fallbackModule = mod;
          detector = new mod.BarcodeDetector({ formats: ["qr_code"] });
        } catch (_) {
          return;
        }
      }
      scanIntervalRef.current = setInterval(scanFrame, 350);
    }

    async function scanFrame() {
      if (!videoRef.current || !detector) return;
      const video = videoRef.current;
      if (video.readyState < 2) return;
      try {
        const barcodes = await detector.detect(video);
        if (barcodes.length > 0) {
          onScanned(barcodes[0].rawValue);
        }
      } catch (_) {}
    }

    setup();

    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
  }, [ready, active, onScanned]);

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <video
        ref={videoRef as any}
        style={{ width: "100%", height: "100%", objectFit: "cover" } as any}
        autoPlay
        playsInline
        muted
      />
      <canvas ref={canvasRef as any} style={{ display: "none" } as any} />
    </View>
  );
}

function toAfuId(uuid: string): string {
  const hex = uuid.replace(/-/g, "").slice(0, 8);
  const num = parseInt(hex, 16) % 100000000;
  return num.toString().padStart(8, "0");
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
      true
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
        showAlert("Invalid QR", "This is not a valid AfuChat ID card.");
        processedRef.current = false;
        setScanned(false);
        setLookingUp(false);
        return;
      }

      const scannedAfuId = data.replace("afuchat://id/", "").replace(/\s/g, "").padStart(8, "0");
      if (!/^\d{8}$/.test(scannedAfuId)) {
        showAlert("Invalid QR", "Invalid AfuChat ID format.");
        processedRef.current = false;
        setScanned(false);
        setLookingUp(false);
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const { data: allProfiles } = await supabase
        .from("profiles")
        .select("id, handle, display_name, avatar_url, bio, country, region, is_verified, is_organization_verified, current_grade, xp");

      let matchedProfile: any = null;
      for (const p of allProfiles || []) {
        if (toAfuId(p.id) === scannedAfuId) {
          matchedProfile = p;
          break;
        }
      }

      if (!matchedProfile) {
        showAlert("Not Found", "No user found with this AfuChat ID.");
        processedRef.current = false;
        setScanned(false);
        setLookingUp(false);
        return;
      }

      if (matchedProfile.id === user?.id) {
        showAlert("That's You!", "You scanned your own card.");
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
    [user]
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
      showAlert("Invalid", "Enter a valid amount.");
      return;
    }
    if (amt > (profile.acoin || 0)) {
      showAlert("Insufficient ACoin", `You only have ${profile.acoin || 0} ACoin.`);
      return;
    }

    showAlert(
      "Confirm Payment",
      `Send ${amt} ACoin to @${scannedProfile?.handle}?`,
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
              p_user_id: scannedProfile?.userId,
              p_amount: amt,
            });
            if (creditErr) {
              await supabase.rpc("credit_acoin", { p_user_id: user.id, p_amount: amt });
              showAlert("Error", "Could not credit recipient. Your ACoin has been refunded.");
              setSending(false);
              return;
            }

            const { error: logErr } = await supabase.from("acoin_transactions").insert([
              {
                user_id: user.id,
                amount: -amt,
                transaction_type: "acoin_transfer_sent",
                metadata: { to_handle: scannedProfile?.handle, via: "qr_scan", message: message.trim() || null },
              },
              {
                user_id: scannedProfile?.userId,
                amount: amt,
                transaction_type: "acoin_transfer_received",
                metadata: { from_handle: profile.handle, via: "qr_scan", message: message.trim() || null },
              },
            ]);
            if (logErr) console.warn("ACoin transfer succeeded but log failed:", logErr.message);

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            showAlert("Sent!", `${amt} ACoin sent to @${scannedProfile?.handle}`);
            setSending(false);
            refreshProfile();
            resetScanner();
            router.back();
          },
        },
      ]
    );
  }

  async function submitRequest() {
    if (!scannedProfile?.userId || !user || !amount.trim()) return;
    const amt = parseInt(amount);
    if (isNaN(amt) || amt <= 0) {
      showAlert("Invalid", "Enter a valid amount.");
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
    showAlert("Request Sent!", `Requested ${amt} ACoin from @${scannedProfile?.handle}`);
    setSending(false);
    resetScanner();
    router.back();
  }

  if (!permission) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={Colors.brand} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.permBox, { paddingTop: insets.top + 16 }]}>
          <Ionicons name="camera-outline" size={64} color={colors.textMuted} />
          <Text style={[styles.permTitle, { color: colors.text }]}>Camera Permission</Text>
          <Text style={[styles.permSub, { color: colors.textSecondary }]}>
            We need camera access to scan QR codes on Digital ID cards.
          </Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnText}>Allow Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
            <Text style={{ color: colors.textMuted, fontSize: 15 }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const isPay = actionMode === "pay";
  const modalTitle = isPay ? "Pay ACoin" : "Request ACoin";
  const modalLabel = isPay ? "To:" : "From:";
  const modalBtnText = isPay ? "Pay" : "Send Request";
  const modalBtnColor = isPay ? Colors.gold : Colors.brand;

  const handleWebScanned = useCallback((data: string) => {
    handleBarCodeScanned({ data });
  }, [handleBarCodeScanned]);

  return (
    <View style={[styles.root, { backgroundColor: "#000" }]}>
      {Platform.OS === "web" ? (
        <WebQRScanner onScanned={handleWebScanned} active={!scanned} />
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
          <Text style={styles.topTitle}>Scan ID Card</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.scanArea}>
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.tl]} />
            <View style={[styles.corner, styles.tr]} />
            <View style={[styles.corner, styles.bl]} />
            <View style={[styles.corner, styles.br]} />
            <Animated.View style={[styles.scanLine, scanLineStyle]} />
          </View>
          <Text style={styles.scanHint}>Point your camera at an AfuChat ID card QR code</Text>
        </View>
      </View>

      {lookingUp && (
        <View style={styles.resultOverlay}>
          <View style={[styles.resultCard, { backgroundColor: colors.surface, alignItems: "center", paddingVertical: 40 }]}>
            <ActivityIndicator size="large" color={Colors.brand} />
            <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 12 }}>Looking up user...</Text>
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
                <View style={[styles.resultAvatar, { backgroundColor: colors.inputBg, justifyContent: "center", alignItems: "center" }]}>
                  <Text style={{ fontSize: 20, color: colors.text }}>{(scannedProfile.name || "?")[0].toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={[styles.resultName, { color: colors.text }]} numberOfLines={1}>{scannedProfile.name}</Text>
                  {scannedProfile.verified && (
                    <Ionicons name="checkmark-circle" size={16} color={scannedProfile.orgVerified ? Colors.gold : Colors.brand} />
                  )}
                </View>
                <Text style={[styles.resultHandle, { color: colors.textMuted }]}>@{scannedProfile.handle}</Text>
                {(scannedProfile.region || scannedProfile.country) && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 }}>
                    <Ionicons name="location" size={10} color={Colors.brand} />
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                      {[scannedProfile.region, scannedProfile.country].filter(Boolean).join(", ")}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {scannedProfile.bio ? (
              <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }} numberOfLines={2}>{scannedProfile.bio}</Text>
            ) : null}

            <View style={[styles.resultIdRow, { backgroundColor: colors.inputBg }]}>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>AFU ID</Text>
              <Text style={{ color: colors.text, fontSize: 14, fontFamily: "Inter_600SemiBold" }}>
                {scannedProfile.afu_id.slice(0, 4)} {scannedProfile.afu_id.slice(4)}
              </Text>
            </View>

            <View style={styles.resultActions}>
              <TouchableOpacity
                style={[styles.resultActionBtn, { backgroundColor: Colors.gold }]}
                onPress={() => openAction("pay")}
              >
                <Ionicons name="arrow-up-circle" size={20} color="#fff" />
                <Text style={styles.resultActionText}>Pay</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.resultActionBtn, { backgroundColor: Colors.brand }]}
                onPress={() => openAction("request")}
              >
                <Ionicons name="arrow-down-circle" size={20} color="#fff" />
                <Text style={styles.resultActionText}>Request</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.scanAgainBtn} onPress={resetScanner}>
              <Ionicons name="scan-outline" size={18} color={Colors.brand} />
              <Text style={{ color: Colors.brand, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>Scan Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Modal visible={showModal} animationType="slide" transparent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
              <View style={styles.dragHandle} />
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>{modalTitle}</Text>
                <TouchableOpacity onPress={() => setShowModal(false)}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{modalLabel}</Text>
                <Text style={{ color: colors.text, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>
                  @{scannedProfile?.handle}
                </Text>
              </View>

              {isPay && (
                <View style={[styles.balanceRow, { backgroundColor: colors.inputBg }]}>
                  <Ionicons name="diamond" size={14} color={Colors.gold} />
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                    Your balance: {profile?.acoin || 0} ACoin
                  </Text>
                </View>
              )}

              <TextInput
                style={[styles.modalInput, { color: colors.text, backgroundColor: colors.inputBg }]}
                placeholder="Amount (ACoin)"
                placeholderTextColor={colors.textMuted}
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
              />
              <TextInput
                style={[styles.modalInput, { color: colors.text, backgroundColor: colors.inputBg }]}
                placeholder="Message (optional)"
                placeholderTextColor={colors.textMuted}
                value={message}
                onChangeText={setMessage}
              />

              <TouchableOpacity
                style={[styles.sendBtn, { backgroundColor: modalBtnColor }, sending && { opacity: 0.6 }]}
                onPress={isPay ? submitPay : submitRequest}
                disabled={sending}
              >
                {sending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.sendBtnText}>{modalBtnText}</Text>
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
  root: { flex: 1, justifyContent: "center", alignItems: "center" },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: "space-between" },
  topBar: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  topTitle: { color: "#fff", fontSize: 17, fontFamily: "Inter_600SemiBold" },
  scanArea: { flex: 1, justifyContent: "center", alignItems: "center" },
  scanFrame: { width: 250, height: 250, position: "relative" },
  corner: { position: "absolute", width: 30, height: 30, borderColor: Colors.brand, borderWidth: 3 },
  tl: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 12 },
  tr: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 12 },
  bl: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 12 },
  br: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 12 },
  scanLine: { position: "absolute", left: 4, right: 4, height: 2, backgroundColor: Colors.brand, borderRadius: 1 },
  scanHint: { color: "rgba(255,255,255,0.7)", fontSize: 14, textAlign: "center", marginTop: 24, fontFamily: "Inter_400Regular", paddingHorizontal: 32 },
  permBox: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16, paddingHorizontal: 40 },
  permTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  permSub: { fontSize: 15, textAlign: "center", lineHeight: 22, fontFamily: "Inter_400Regular" },
  permBtn: { backgroundColor: Colors.brand, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14, marginTop: 8 },
  permBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  resultOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" },
  resultCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 12 },
  resultHeader: { flexDirection: "row", alignItems: "center", gap: 14 },
  resultAvatar: { width: 56, height: 56, borderRadius: 28 },
  resultName: { fontSize: 18, fontFamily: "Inter_700Bold" },
  resultHandle: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 2 },
  resultIdRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12, borderRadius: 10 },
  resultActions: { flexDirection: "row", gap: 10 },
  resultActionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14 },
  resultActionText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  scanAgainBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, marginTop: 4 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 14 },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#ccc", alignSelf: "center", marginBottom: 4 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  balanceRow: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, borderRadius: 10 },
  modalInput: { borderRadius: 12, padding: 14, fontSize: 15, fontFamily: "Inter_400Regular" },
  sendBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  sendBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});

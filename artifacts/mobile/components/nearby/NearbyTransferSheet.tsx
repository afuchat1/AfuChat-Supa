import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Network from "expo-network";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "@/components/ui/QRCode";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import {
  acceptLocalTransferOffer,
  cancelLocalTransfer,
  completeLocalTransferAnswer,
  createLocalTransferOffer,
  parseLocalTransferCode,
  subscribeToLocalTransfer,
  type LocalTransferOffer,
  type LocalTransferProgress,
} from "@/lib/localTransferQr";

type TransferFile = {
  uri: string;
  name: string;
  size: number;
  mimeType?: string;
};

type Props = {
  visible: boolean;
  file: TransferFile | null;
  onClose: () => void;
};

type Step =
  | "home"
  | "send-offer"
  | "scan-answer"
  | "scan-offer"
  | "confirm-receive"
  | "show-answer"
  | "progress";

const STEP_COPY: Record<Step, string> = {
  home: "Choose whether this phone is sending or receiving.",
  "send-offer": "Have the receiving phone scan this code.",
  "scan-answer": "Scan the answer code shown on the receiving phone.",
  "scan-offer": "Scan the sender's offer code.",
  "confirm-receive": "Review the file before accepting it.",
  "show-answer": "Have the sending phone scan this answer code.",
  progress: "The file is moving directly between the two phones.",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function displayName(profile: { display_name?: string; handle?: string } | null, fallback?: string): string {
  return profile?.display_name?.trim() || profile?.handle?.trim() || fallback || "AfuChat device";
}

export default function NearbyTransferSheet({ visible, file, onClose }: Props) {
  const { colors, isDark } = useTheme();
  const { user, profile } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<Step>("home");
  const [offerCode, setOfferCode] = useState("");
  const [answerCode, setAnswerCode] = useState("");
  const [pendingOffer, setPendingOffer] = useState<LocalTransferOffer | null>(null);
  const [progress, setProgress] = useState<LocalTransferProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [networkLabel, setNetworkLabel] = useState("Checking local network…");
  const [ipAddress, setIpAddress] = useState<string | null>(null);
  const scannedRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setStep("home");
    setOfferCode("");
    setAnswerCode("");
    setPendingOffer(null);
    setProgress(null);
    setBusy(false);
    setError(null);
    scannedRef.current = false;
    let cancelled = false;
    Promise.all([
      Network.getNetworkStateAsync().catch(() => null),
      Network.getIpAddressAsync().catch(() => null),
    ]).then(([state, address]) => {
      if (cancelled) return;
      const networkState = state as Network.NetworkState | null;
      setNetworkLabel(
        networkState?.type === Network.NetworkStateType.WIFI
          ? "Wi-Fi connected"
          : networkState?.isConnected
            ? "Connected, but not Wi-Fi"
            : "No network detected",
      );
      setIpAddress(address as string | null);
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    return subscribeToLocalTransfer({
      onProgress: (next) => {
        setProgress(next);
        if (next.status === "complete" || next.status === "failed" || next.status === "cancelled") {
          setStep("progress");
        }
      },
      onError: (message) => {
        setError(message);
        setStep("progress");
      },
    });
  }, [visible]);

  const close = useCallback(async () => {
    if (progress && (progress.status === "waiting" || progress.status === "connecting" || progress.status === "transferring")) {
      await cancelLocalTransfer(progress.transferId);
    }
    onClose();
  }, [onClose, progress]);

  const startSending = useCallback(async () => {
    if (!file || !user) {
      setError("Select a local device file before starting a transfer.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await createLocalTransferOffer({
        senderId: user.id,
        senderName: displayName(profile, user.email?.split("@")[0]),
        file,
      });
      setOfferCode(result.code);
      setStep("send-offer");
    } catch (caught: any) {
      setError(caught?.message || "Could not start the nearby transfer.");
    } finally {
      setBusy(false);
    }
  }, [file, profile, user]);

  const scanCode = useCallback(
    async (raw: string) => {
      if (scannedRef.current || busy) return;
      scannedRef.current = true;
      setBusy(true);
      setError(null);
      try {
        const parsed = parseLocalTransferCode(raw);
        if (step === "scan-offer") {
          if (parsed.description.type !== "offer") {
            throw new Error("This is not the sender's offer code.");
          }
          setPendingOffer(parsed as LocalTransferOffer);
          setStep("confirm-receive");
        } else {
          if (parsed.description.type !== "answer") {
            throw new Error("This is not the receiver's answer code.");
          }
          await completeLocalTransferAnswer(raw);
          setStep("progress");
        }
      } catch (caught: any) {
        scannedRef.current = false;
        setError(caught?.message || "That QR code could not be used.");
      } finally {
        setBusy(false);
      }
    },
    [busy, step],
  );

  const acceptOffer = useCallback(async () => {
    if (!pendingOffer) return;
    setBusy(true);
    setError(null);
    try {
      const result = await acceptLocalTransferOffer({
        code: `${"afuchat-transfer-v1:"}${JSON.stringify(pendingOffer)}`,
        receiverName: displayName(profile, user?.email?.split("@")[0]),
      });
      setAnswerCode(result.code);
      setProgress({
        transferId: result.transferId,
        direction: "receive",
        status: "connecting",
        fileName: pendingOffer.fileName,
        fileSize: pendingOffer.fileSize,
        transferredBytes: 0,
        peerName: pendingOffer.senderName,
        localUri: result.localUri,
      });
      setStep("show-answer");
    } catch (caught: any) {
      setError(caught?.message || "Could not accept the nearby transfer.");
      scannedRef.current = false;
    } finally {
      setBusy(false);
    }
  }, [pendingOffer, profile, user]);

  const enterScanner = useCallback(async (nextStep: "scan-offer" | "scan-answer") => {
    if (Platform.OS === "web") {
      setError("Nearby transfer needs the installed Android or iOS build. Expo Go and the web preview cannot use WebRTC.");
      return;
    }
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setError("Camera permission is needed to scan the pairing code.");
        return;
      }
    }
    scannedRef.current = false;
    setError(null);
    setStep(nextStep);
  }, [permission?.granted, requestPermission]);

  const percent = progress && progress.fileSize > 0
    ? Math.min(100, Math.round((progress.transferredBytes / progress.fileSize) * 100))
    : 0;
  const isScanning = step === "scan-offer" || step === "scan-answer";
  const sheetBackground = colors.background;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={[styles.backdrop, { backgroundColor: isDark ? "rgba(0,0,0,0.76)" : "rgba(0,0,0,0.42)" }]}>
        <View style={[styles.sheet, { backgroundColor: sheetBackground }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text }]}>Nearby transfer</Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>{STEP_COPY[step]}</Text>
            </View>
            <Pressable onPress={close} hitSlop={12} accessibilityLabel="Close nearby transfer">
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>

          {isScanning ? (
            <View style={styles.scannerWrap}>
              <CameraView
                style={styles.camera}
                facing="back"
                onBarcodeScanned={busy ? undefined : ({ data }) => void scanCode(data)}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              />
              <View style={styles.scanFrame}>
                <View style={[styles.corner, styles.cornerTopLeft, { borderColor: colors.accent }]} />
                <View style={[styles.corner, styles.cornerTopRight, { borderColor: colors.accent }]} />
                <View style={[styles.corner, styles.cornerBottomLeft, { borderColor: colors.accent }]} />
                <View style={[styles.corner, styles.cornerBottomRight, { borderColor: colors.accent }]} />
              </View>
              <Text style={styles.scanHint}>Align the pairing QR code inside the frame</Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
              scrollEnabled={step !== "send-offer" && step !== "show-answer"}
            >
              <View style={[styles.networkCard, { backgroundColor: colors.surface }]}>
                <Ionicons
                  name={networkLabel === "Wi-Fi connected" ? "wifi" : "wifi-outline"}
                  size={22}
                  color={colors.accent}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.networkTitle, { color: colors.text }]}>{networkLabel}</Text>
                  <Text style={[styles.networkMeta, { color: colors.textMuted }]}>
                    {ipAddress
                      ? `Local address ${ipAddress} · both phones must share Wi-Fi`
                      : "Both phones must be on the same Wi-Fi or hotspot"}
                  </Text>
                </View>
              </View>

              {step === "home" && (
                <>
                  <View style={[styles.directCard, { backgroundColor: colors.accent + "16" }]}>
                    <View style={[styles.directIcon, { backgroundColor: colors.accent }]}>
                      <Ionicons name="shield-checkmark" size={23} color={colors.background} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.directTitle, { color: colors.text }]}>Direct device-to-device</Text>
                      <Text style={[styles.directText, { color: colors.textMuted }]}>
                        AfuChat only exchanges pairing details. File bytes travel over a private WebRTC channel and never go to AfuChat servers.
                      </Text>
                    </View>
                  </View>
                  {file ? (
                    <View style={[styles.fileCard, { backgroundColor: colors.surface }]}>
                      <Ionicons name="document-outline" size={25} color={colors.accent} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>{file.name}</Text>
                        <Text style={[styles.fileMeta, { color: colors.textMuted }]}>{formatBytes(file.size)} · {file.mimeType || "File"}</Text>
                      </View>
                    </View>
                  ) : (
                    <Text style={[styles.mutedCenter, { color: colors.textMuted }]}>Select a file from your library to send it.</Text>
                  )}
                  <Pressable
                    testID="nearby-transfer-send"
                    onPress={startSending}
                    disabled={busy || !file}
                    style={[styles.primary, { backgroundColor: colors.accent, opacity: busy || !file ? 0.5 : 1 }]}
                  >
                    {busy ? <ActivityIndicator color={colors.background} /> : <Ionicons name="paper-plane" size={19} color={colors.background} />}
                    <Text style={[styles.primaryText, { color: colors.background }]}>Send from this phone</Text>
                  </Pressable>
                  <Pressable
                    testID="nearby-transfer-receive"
                    onPress={() => void enterScanner("scan-offer")}
                    style={[styles.secondary, { borderColor: colors.border }]}
                  >
                    <Ionicons name="download-outline" size={19} color={colors.text} />
                    <Text style={[styles.secondaryText, { color: colors.text }]}>Receive on this phone</Text>
                  </Pressable>
                </>
              )}

              {(step === "send-offer" || step === "show-answer") && (
                <View style={styles.qrPanel}>
                  <View style={[styles.qrBox, { backgroundColor: "#fff" }]}>
                    <QRCode value={step === "send-offer" ? offerCode : answerCode} size={230} />
                  </View>
                  <Text style={[styles.qrTitle, { color: colors.text }]}>
                    {step === "send-offer" ? "Offer ready" : "Answer ready"}
                  </Text>
                  <Text style={[styles.qrText, { color: colors.textMuted }]}>
                    {step === "send-offer"
                      ? `${file?.name || "This file"} · ${formatBytes(file?.size || 0)}`
                      : "The sender can now finish pairing. Keep this screen open."}
                  </Text>
                  {step === "send-offer" ? (
                    <Pressable
                      testID="nearby-transfer-scan-answer"
                      onPress={() => void enterScanner("scan-answer")}
                      style={[styles.primary, { backgroundColor: colors.accent }]}
                    >
                      <Ionicons name="scan-outline" size={19} color={colors.background} />
                      <Text style={[styles.primaryText, { color: colors.background }]}>Scan receiver answer</Text>
                    </Pressable>
                  ) : (
                    <View style={[styles.waitCard, { backgroundColor: colors.surface }]}>
                      <ActivityIndicator color={colors.accent} />
                      <Text style={[styles.waitText, { color: colors.textMuted }]}>Waiting for the sender to connect…</Text>
                    </View>
                  )}
                </View>
              )}

              {step === "confirm-receive" && pendingOffer && (
                <View>
                  <View style={[styles.confirmCard, { backgroundColor: colors.surface }]}>
                    <View style={[styles.confirmIcon, { backgroundColor: colors.accent + "1A" }]}>
                      <Ionicons name="document-text-outline" size={29} color={colors.accent} />
                    </View>
                    <Text style={[styles.confirmName, { color: colors.text }]} numberOfLines={2}>{pendingOffer.fileName}</Text>
                    <Text style={[styles.confirmMeta, { color: colors.textMuted }]}>
                      {formatBytes(pendingOffer.fileSize)} · sent by {pendingOffer.senderName || "AfuChat device"}
                    </Text>
                  </View>
                  <Text style={[styles.confirmNotice, { color: colors.textMuted }]}>
                    Accepting saves a new copy in AfuChat's permanent device storage. Only accept files from someone you trust.
                  </Text>
                  <Pressable
                    testID="nearby-transfer-accept"
                    onPress={() => void acceptOffer()}
                    disabled={busy}
                    style={[styles.primary, { backgroundColor: colors.accent, opacity: busy ? 0.5 : 1 }]}
                  >
                    {busy ? <ActivityIndicator color={colors.background} /> : <Ionicons name="checkmark-circle" size={19} color={colors.background} />}
                    <Text style={[styles.primaryText, { color: colors.background }]}>Accept and pair</Text>
                  </Pressable>
                  <Pressable onPress={() => { setPendingOffer(null); scannedRef.current = false; setStep("home"); }} style={styles.textButton}>
                    <Text style={[styles.textButtonText, { color: colors.textMuted }]}>Decline</Text>
                  </Pressable>
                </View>
              )}

              {step === "progress" && progress && (
                <View style={styles.progressPanel}>
                  <View style={[styles.progressIcon, { backgroundColor: progress.status === "complete" ? "#34C75922" : colors.accent + "1A" }]}>
                    <Ionicons
                      name={progress.status === "complete" ? "checkmark-circle" : progress.status === "failed" ? "alert-circle" : "swap-horizontal"}
                      size={34}
                      color={progress.status === "complete" ? "#34C759" : progress.status === "failed" ? "#FF3B30" : colors.accent}
                    />
                  </View>
                  <Text style={[styles.progressTitle, { color: colors.text }]}>
                    {progress.status === "complete" ? "Transfer complete" : progress.status === "failed" ? "Transfer failed" : progress.status === "cancelled" ? "Transfer cancelled" : "Connecting devices…"}
                  </Text>
                  <Text style={[styles.progressFile, { color: colors.textMuted }]} numberOfLines={2}>{progress.fileName}</Text>
                  {(progress.status === "transferring" || progress.status === "connecting") && (
                    <>
                      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                        <View style={[styles.progressFill, { width: `${percent}%`, backgroundColor: colors.accent }]} />
                      </View>
                      <Text style={[styles.progressPercent, { color: colors.textMuted }]}>{percent}% · {formatBytes(progress.transferredBytes)} of {formatBytes(progress.fileSize)}</Text>
                    </>
                  )}
                  {progress.status === "complete" && (
                    <Text style={[styles.savedText, { color: "#34C759" }]}>Saved securely on this device</Text>
                  )}
                </View>
              )}

              {error ? (
                <View style={[styles.errorCard, { backgroundColor: "#FF3B3014" }]}>
                  <Ionicons name="warning-outline" size={18} color="#FF3B30" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {step !== "home" && step !== "progress" && step !== "confirm-receive" && (
                <Pressable onPress={() => { setError(null); setStep("home"); }} style={styles.textButton}>
                  <Text style={[styles.textButtonText, { color: colors.textMuted }]}>Back to transfer options</Text>
                </Pressable>
              )}
              {step === "progress" ? (
                <Pressable onPress={close} style={[styles.primary, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.primaryText, { color: colors.background }]}>Done</Text>
                </Pressable>
              ) : null}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  sheet: { maxHeight: "92%", borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 10, paddingBottom: 24 },
  handle: { width: 38, height: 4, borderRadius: 99, alignSelf: "center", marginBottom: 16 },
  header: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 18, marginBottom: 14 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, lineHeight: 18, marginTop: 4, paddingRight: 14, fontFamily: "Inter_400Regular" },
  content: { paddingHorizontal: 18, paddingBottom: 12 },
  networkCard: { flexDirection: "row", alignItems: "center", gap: 11, borderRadius: 16, padding: 13, marginBottom: 12 },
  networkTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  networkMeta: { fontSize: 11, lineHeight: 15, marginTop: 3, fontFamily: "Inter_400Regular" },
  directCard: { flexDirection: "row", alignItems: "flex-start", gap: 11, padding: 13, borderRadius: 17, marginBottom: 12 },
  directIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  directTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  directText: { fontSize: 12, lineHeight: 17, marginTop: 4, fontFamily: "Inter_400Regular" },
  fileCard: { flexDirection: "row", alignItems: "center", gap: 11, borderRadius: 16, padding: 13, marginBottom: 12 },
  fileName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  fileMeta: { fontSize: 12, marginTop: 4, fontFamily: "Inter_400Regular" },
  mutedCenter: { textAlign: "center", fontSize: 13, lineHeight: 19, marginVertical: 12, fontFamily: "Inter_400Regular" },
  primary: { minHeight: 52, borderRadius: 15, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 10, paddingHorizontal: 15 },
  primaryText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  secondary: { minHeight: 50, borderRadius: 15, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 9, borderWidth: 1, paddingHorizontal: 15 },
  secondaryText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  qrPanel: { alignItems: "center" },
  qrBox: { padding: 10, borderRadius: 18, marginBottom: 14 },
  qrTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  qrText: { textAlign: "center", fontSize: 13, lineHeight: 18, marginTop: 5, maxWidth: 300, fontFamily: "Inter_400Regular" },
  waitCard: { width: "100%", borderRadius: 15, padding: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 14 },
  waitText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  confirmCard: { borderRadius: 18, alignItems: "center", padding: 22 },
  confirmIcon: { width: 60, height: 60, borderRadius: 19, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  confirmName: { fontSize: 17, textAlign: "center", fontFamily: "Inter_700Bold" },
  confirmMeta: { fontSize: 13, textAlign: "center", marginTop: 5, fontFamily: "Inter_400Regular" },
  confirmNotice: { textAlign: "center", fontSize: 12, lineHeight: 17, marginVertical: 13, paddingHorizontal: 8, fontFamily: "Inter_400Regular" },
  progressPanel: { alignItems: "center", paddingVertical: 30 },
  progressIcon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 15 },
  progressTitle: { fontSize: 19, textAlign: "center", fontFamily: "Inter_700Bold" },
  progressFile: { textAlign: "center", fontSize: 13, marginTop: 5, maxWidth: 280, fontFamily: "Inter_400Regular" },
  progressTrack: { height: 8, width: "100%", borderRadius: 99, overflow: "hidden", marginTop: 22 },
  progressFill: { height: "100%", borderRadius: 99 },
  progressPercent: { fontSize: 12, marginTop: 7, fontFamily: "Inter_500Medium" },
  savedText: { fontSize: 13, marginTop: 14, fontFamily: "Inter_600SemiBold" },
  errorCard: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 13, padding: 11, marginTop: 13 },
  errorText: { color: "#FF3B30", flex: 1, fontSize: 12, lineHeight: 17, fontFamily: "Inter_500Medium" },
  textButton: { alignItems: "center", paddingVertical: 13 },
  textButtonText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  scannerWrap: { height: 430, backgroundColor: "#000", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  camera: { ...StyleSheet.absoluteFill },
  scanFrame: { width: 250, height: 250, position: "relative" },
  corner: { width: 30, height: 30, position: "absolute", borderWidth: 3 },
  cornerTopLeft: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTopRight: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBottomLeft: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBottomRight: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  scanHint: { color: "#fff", fontSize: 13, position: "absolute", bottom: 20, fontFamily: "Inter_500Medium" },
});
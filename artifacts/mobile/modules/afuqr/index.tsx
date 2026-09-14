import React, { useEffect, useRef, useState } from "react";
import {
  Clipboard,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions, BarcodeScanningResult } from "expo-camera";
import { useTheme } from "@/hooks/useTheme";
import { showAlert } from "@/lib/alert";
import * as Haptics from "@/lib/haptics";
import Colors from "@/constants/colors";

type ScanResult = {
  data: string;
  type: string;
};

function detectType(data: string): { label: string; icon: React.ComponentProps<typeof Ionicons>["name"] } {
  if (/^https?:\/\//i.test(data)) return { label: "Website URL", icon: "globe" };
  if (/^afupay:/i.test(data)) return { label: "AfuPay Transfer", icon: "wallet" };
  if (/^tel:/i.test(data)) return { label: "Phone Number", icon: "call" };
  if (/^mailto:/i.test(data)) return { label: "Email Address", icon: "mail" };
  if (/^WIFI:/i.test(data)) return { label: "Wi-Fi Network", icon: "wifi" };
  if (/^BEGIN:VCARD/i.test(data)) return { label: "Contact Card", icon: "person" };
  if (/^geo:/i.test(data)) return { label: "Location", icon: "location" };
  return { label: "Text", icon: "text" };
}

export default function AfuQRApp() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanned, setScanned] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const cooldown = useRef(false);

  function handleBarcode(scanning: BarcodeScanningResult) {
    if (scanned || cooldown.current) return;
    cooldown.current = true;
    setScanned(true);
    setResult({ data: scanning.data, type: scanning.type });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  function reset() {
    setResult(null);
    setScanned(false);
    setTimeout(() => { cooldown.current = false; }, 600);
  }

  async function handleAction() {
    if (!result) return;
    const { data } = result;
    if (/^https?:\/\//i.test(data)) {
      await Linking.openURL(data).catch(() => showAlert("Error", "Could not open URL."));
    } else if (/^tel:/i.test(data)) {
      await Linking.openURL(data).catch(() => showAlert("Error", "Could not open phone."));
    } else if (/^mailto:/i.test(data)) {
      await Linking.openURL(data).catch(() => showAlert("Error", "Could not open email."));
    } else {
      showAlert("Scanned Data", data, [{ text: "OK" }]);
    }
  }

  function handleCopy() {
    if (!result) return;
    (Clipboard as any).setString(result.data);
    showAlert("Copied", "Text copied to clipboard.");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  if (!permission) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <Ionicons name="camera" size={40} color={colors.textMuted} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[s.center, { backgroundColor: colors.background, padding: 36 }]}>
        <View style={[s.permIconWrap, { backgroundColor: "#1C1C1E" }]}>
          <Ionicons name="qr-code" size={48} color="#fff" />
        </View>
        <Text style={[s.permTitle, { color: colors.text }]}>Camera Access</Text>
        <Text style={[s.permSub, { color: colors.textMuted }]}>
          AfuQR needs access to your camera to scan QR codes and barcodes.
        </Text>
        <TouchableOpacity
          style={[s.permBtn, { backgroundColor: Colors.brand }]}
          onPress={requestPermission}
          activeOpacity={0.85}
        >
          <Ionicons name="camera" size={18} color="#fff" />
          <Text style={s.permBtnText}>Allow Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const typeInfo = result ? detectType(result.data) : null;
  const isUrl = result && /^https?:\/\//i.test(result.data);

  return (
    <View style={[s.root, { backgroundColor: "#000" }]}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torchOn}
        onBarcodeScanned={scanned ? undefined : handleBarcode}
        barcodeScannerSettings={{ barcodeTypes: ["qr", "pdf417", "ean13", "ean8", "code128", "code39", "aztec", "datamatrix"] }}
      />

      <View style={[s.overlay, { pointerEvents: "box-none" } as any]}>
        <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={s.topBtn} onPress={() => setTorchOn(!torchOn)}>
            <Ionicons name={torchOn ? "flashlight" : "flashlight-outline"} size={22} color="#fff" />
          </TouchableOpacity>
          <View style={s.topTitle}>
            <Text style={s.topTitleText}>QR Scanner</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <View style={[s.scanArea, { pointerEvents: "none" } as any]}>
          <View style={[s.topMask, { backgroundColor: "rgba(0,0,0,0.55)" }]} />
          <View style={s.scanRow}>
            <View style={[s.sideMask, { backgroundColor: "rgba(0,0,0,0.55)" }]} />
            <View style={s.frame}>
              <View style={[s.corner, s.tl, { borderColor: Colors.brand }]} />
              <View style={[s.corner, s.tr, { borderColor: Colors.brand }]} />
              <View style={[s.corner, s.bl, { borderColor: Colors.brand }]} />
              <View style={[s.corner, s.br, { borderColor: Colors.brand }]} />
              {scanned && (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.brand + "28", borderRadius: 4 }]} />
              )}
            </View>
            <View style={[s.sideMask, { backgroundColor: "rgba(0,0,0,0.55)" }]} />
          </View>
          <View style={[s.bottomMask, { backgroundColor: "rgba(0,0,0,0.55)" }]} />
        </View>

        {!result && (
          <View style={[s.hintWrap, { bottom: insets.bottom + 60, pointerEvents: "none" } as any]}>
            <Text style={s.hintText}>Point at any QR code or barcode</Text>
          </View>
        )}

        {result && typeInfo && (
          <View
            style={[s.resultCard, { bottom: insets.bottom + 16, backgroundColor: colors.surface }]}
          >
            <View style={s.resultTop}>
              <View style={[s.resultIconWrap, { backgroundColor: Colors.brand + "18" }]}>
                <Ionicons name={typeInfo.icon} size={20} color={Colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.resultType, { color: colors.textMuted }]}>{typeInfo.label}</Text>
                <Text style={[s.resultData, { color: colors.text }]} numberOfLines={3}>{result.data}</Text>
              </View>
            </View>

            <View style={s.resultActions}>
              {isUrl && (
                <TouchableOpacity style={[s.actionBtn, { backgroundColor: Colors.brand }]} onPress={handleAction}>
                  <Ionicons name="open-outline" size={16} color="#fff" />
                  <Text style={s.actionBtnText}>Open</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[s.actionBtn, { backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border }]} onPress={handleCopy}>
                <Ionicons name="copy-outline" size={16} color={colors.text} />
                <Text style={[s.actionBtnText, { color: colors.text }]}>Copy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.actionBtn, { backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border }]} onPress={reset}>
                <Ionicons name="scan" size={16} color={colors.text} />
                <Text style={[s.actionBtnText, { color: colors.text }]}>Scan Again</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const FRAME = 240;
const s = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  permIconWrap: { width: 88, height: 88, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  permTitle: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 8 },
  permSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21, marginBottom: 16 },
  permBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 13, borderRadius: 14 },
  permBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  overlay: { ...StyleSheet.absoluteFill, flexDirection: "column" },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 10 },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 20 },
  topTitle: { flex: 1, alignItems: "center" },
  topTitleText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  scanArea: { flex: 1 },
  topMask: { flex: 1 },
  scanRow: { flexDirection: "row", height: FRAME },
  sideMask: { flex: 1 },
  frame: { width: FRAME, height: FRAME, position: "relative" },
  corner: { position: "absolute", width: 32, height: 32, borderWidth: 3.5 },
  tl: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 8 },
  tr: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 8 },
  bl: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 8 },
  br: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 8 },
  bottomMask: { flex: 1 },
  hintWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  hintText: { color: "rgba(255,255,255,0.85)", fontFamily: "Inter_500Medium", fontSize: 14, backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 18, paddingVertical: 9, borderRadius: 22 },
  resultCard: { position: "absolute", left: 12, right: 12, borderRadius: 22, padding: 16, gap: 14, ...Platform.select({ web: { boxShadow: "0 6px 16px rgba(0,0,0,0.30)" } as any, default: { shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 16, elevation: 12 } }) },
  resultTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  resultIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  resultType: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, marginBottom: 3 },
  resultData: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  resultActions: { flexDirection: "row", gap: 8 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 10, borderRadius: 12 },
  actionBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 },
});

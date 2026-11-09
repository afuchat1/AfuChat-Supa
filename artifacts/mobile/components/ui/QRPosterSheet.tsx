/**
 * QRPosterSheet — bottom sheet that displays a shareable QR profile poster.
 * Long-press the avatar on the profile tab to trigger this.
 *
 * Captures the poster as a PNG via react-native-view-shot (native)
 * or html2canvas (web), then offers Share / Save to Camera Roll.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Sharing from "expo-sharing";
import { showToast } from "@/lib/toast";
import QRCode from "@/components/ui/QRCode";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import AfuLogo from "@/components/ui/AfuLogo";
import { useTheme } from "@/hooks/useTheme";
import { SmartSheet } from "@/components/ui/SmartSheet";
import Colors from "@/constants/colors";
import { useLanguage } from "@/context/LanguageContext";

const BRAND = Colors.brand;

type Props = {
  visible: boolean;
  onClose: () => void;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  afuId: string;
  isVerified?: boolean;
  isOrgVerified?: boolean;
};

export default function QRPosterSheet({
  visible, onClose,
  displayName, handle, avatarUrl,
  afuId, isVerified, isOrgVerified,
}: Props) {
  const { colors, isDark, accent } = useTheme();
  const { t } = useLanguage();
  const posterRef = useRef<any>(null);
  const captureRefRef = useRef<((ref: any, opts?: any) => Promise<string>) | null>(null);
  const [nativeViewShot, setNativeViewShot] = useState<React.ComponentType<any> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (Platform.OS === "web" || !visible || nativeViewShot) return;
    try {
      const vshot = require("react-native-view-shot");
      captureRefRef.current = vshot.captureRef;
      setNativeViewShot(() => vshot.default);
    } catch {
      captureRefRef.current = null;
    }
  }, [visible, nativeViewShot]);

  const qrUrl = `https://afuchat.com/id/${afuId}`;

  const sheetBg = isDark ? colors.backgroundSecondary : colors.backgroundSecondary;
  const cardBg  = "#0a1628";
  const cardTop = "#0d1e38";

  async function capture(): Promise<string | null> {
    if (!captureRefRef.current || !posterRef.current) return null;
    return captureRefRef.current(posterRef.current, { format: "png", quality: 1, result: "tmpfile" });
  }

  async function handleShare() {
    setSaving(true);
    try {
      const uri = await capture();
       if (!uri) { showToast(t("qr.generate_failed")); return; }
      const ok = await Sharing.isAvailableAsync();
      if (ok) await Sharing.shareAsync(uri, { mimeType: "image/png" });
       else showToast(t("qr.sharing_unavailable"));
    } catch {
       showToast(t("qr.share_failed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      let MediaLibrary: typeof import("expo-media-library") | null = null;
      if (Platform.OS !== "web") {
        try { MediaLibrary = require("expo-media-library"); } catch {}
      }
       if (!MediaLibrary) { showToast(t("qr.media_library_unavailable")); return; }
      const { status } = await MediaLibrary.requestPermissionsAsync();
       if (status !== "granted") { showToast(t("qr.camera_roll_denied")); return; }
      const uri = await capture();
       if (!uri) { showToast(t("qr.generate_failed")); return; }
      await MediaLibrary.saveToLibraryAsync(uri);
       showToast(t("qr.saved") + " 📸");
    } catch {
       showToast(t("qr.save_failed"));
    } finally {
      setSaving(false);
    }
  }

  // The native capture component and the web View have different ref props
  // in React 19's typings. Both are ref-compatible at runtime, so keep the
  // dynamic host component intentionally broad here.
  const PosterCaptureView: any = nativeViewShot ?? View;

  return (
    <SmartSheet visible={visible} onClose={onClose} peekFraction={0.85} backgroundColor={sheetBg}>
      <View style={s.content}>
         <Text style={[s.sheetTitle, { color: colors.text }]}>{t("qr.title")}</Text>
         <Text style={[s.sheetSub, { color: colors.textMuted }]}>{t("qr.subtitle")}</Text>

        {/* Poster card — this gets captured */}
        <View style={s.posterWrap}>
          <PosterCaptureView
            ref={posterRef}
            {...(nativeViewShot ? { options: { format: "png", quality: 1, result: "tmpfile" } } : {})}
            style={s.poster}
          >
            <View style={[s.posterBg, { backgroundColor: cardBg }]}>
              <View style={[s.brandStrip, { backgroundColor: cardTop }]}>
                <AfuLogo size={26} forceTheme="dark" style={{ marginRight: 2 }} />
                <Text style={s.brandName}>AfuChat</Text>
              </View>

              <View style={s.avatarWrap}>
                {avatarUrl ? (
                  <Image
                    source={{ uri: avatarUrl }}
                    style={s.avatar}
                    contentFit="cover"
                    cachePolicy="memory"
                  />
                ) : (
                  <View style={[s.avatar, s.avatarFallback]}>
                    <Text style={s.avatarInitial}>{(displayName || handle || "?")[0].toUpperCase()}</Text>
                  </View>
                )}
                {(isVerified || isOrgVerified) && (
                  <View style={s.badgeWrap}>
                    <VerifiedBadge isVerified={isVerified} isOrganizationVerified={isOrgVerified} size={18} />
                  </View>
                )}
              </View>

              <Text style={s.posterName} numberOfLines={1}>{displayName}</Text>
              <Text style={s.posterHandle}>@{handle}</Text>

              <View style={s.qrWrap}>
                <QRCode value={qrUrl} size={130} color="#0a1628" backgroundColor="#ffffff" />
              </View>

               <Text style={s.posterScan}>{t("qr.scan_to_connect")}</Text>
              <Text style={s.posterUrl}>afuchat.com/id/{afuId}</Text>
            </View>
          </PosterCaptureView>
        </View>

        {/* Action buttons */}
        <View style={[s.sep, { backgroundColor: colors.border }]} />

        <TouchableOpacity
          style={s.actionRow}
          onPress={handleShare}
          disabled={saving}
          activeOpacity={0.65}
        >
          {saving ? (
            <ActivityIndicator color={accent} size="small" style={s.actionIcon} />
          ) : (
            <Ionicons name="share-social" size={24} color={accent} style={s.actionIcon} />
          )}
           <Text style={[s.actionLabel, { color: accent }]}>{t("qr.share")}</Text>
        </TouchableOpacity>

        <View style={[s.sep, { backgroundColor: colors.border }]} />

        <TouchableOpacity
          style={s.actionRow}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.65}
        >
          <Ionicons name="download" size={24} color={colors.text} style={s.actionIcon} />
           <Text style={[s.actionLabel, { color: colors.text }]}>{t("qr.save_image")}</Text>
        </TouchableOpacity>

        <View style={[s.sep, { backgroundColor: colors.border }]} />
      </View>
    </SmartSheet>
  );
}

const s = StyleSheet.create({
  content: {
    paddingHorizontal: 0,
  },

  sheetTitle: { fontSize: 17, fontFamily: "Inter_700Bold", textAlign: "center", marginTop: 4, paddingHorizontal: 20 },
  sheetSub:   { fontSize: 13, textAlign: "center", marginTop: 4, marginBottom: 20, lineHeight: 19, paddingHorizontal: 20 },

  posterWrap: { alignItems: "center", marginBottom: 20 },
  poster:     { borderRadius: 20, overflow: "hidden" },
  posterBg: {
    width: 280,
    borderRadius: 20,
    alignItems: "center",
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(31,149,255,0.2)",
  },

  brandStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 14,
    paddingBottom: 14,
    width: "100%",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(31,149,255,0.12)",
    marginBottom: 20,
  },
  brandName: { color: "#fff", fontSize: 15, fontWeight: "700", letterSpacing: 0.5 },

  avatarWrap: { position: "relative", marginBottom: 12 },
  avatar:     { width: 80, height: 80, borderRadius: 40, borderWidth: 2.5, borderColor: BRAND + "60" },
  avatarFallback: { backgroundColor: BRAND + "22", alignItems: "center", justifyContent: "center" },
  avatarInitial:  { fontSize: 32, fontWeight: "700", color: BRAND },
  badgeWrap:      { position: "absolute", bottom: 0, right: -2 },

  posterName:   { fontSize: 18, fontWeight: "700", color: "#fff", textAlign: "center", paddingHorizontal: 16 },
  posterHandle: { fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 3, marginBottom: 16 },

  qrWrap: {
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 14,
    marginBottom: 14,
    ...Platform.select({
      web: { boxShadow: "0 2px 8px rgba(0,0,0,0.3)" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
    }),
  },
  posterScan: { fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: 0.4, marginBottom: 4 },
  posterUrl:  { fontSize: 10, color: BRAND + "88", letterSpacing: 0.3, fontFamily: "monospace" as any },

  sep:        { height: 0.5, marginVertical: 2 },
  actionRow:  { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 16, minHeight: 56 },
  actionIcon: { marginRight: 18, width: 24, textAlign: "center" },
  actionLabel:{ flex: 1, fontSize: 16, fontFamily: "Inter_700Bold" },
});

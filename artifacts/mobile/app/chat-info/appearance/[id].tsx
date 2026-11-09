import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { GlassHeader } from "@/components/ui/GlassHeader";
import {
  clearChatAppearance,
  getChatAppearance,
  saveChatAppearance,
  type ChatAppearance,
} from "@/lib/chatAppearance";

const FONT_SIZES = [
  { label: "S",  value: 13, name: "Small"   },
  { label: "M",  value: 15, name: "Normal"  },
  { label: "L",  value: 17, name: "Large"   },
  { label: "XL", value: 19, name: "X-Large" },
] as const;

const WALLPAPERS = [
  { key: "none",     label: "None",     value: undefined    as string | undefined },
  { key: "dots",     label: "Dots",     value: "dots"     },
  { key: "lines",    label: "Lines",    value: "lines"    },
  { key: "grid",     label: "Grid",     value: "grid"     },
  { key: "diamonds", label: "Diamonds", value: "diamonds" },
];

// ── Mini wallpaper preview ─────────────────────────────────────────────────────

function WallpaperMini({ type, bg }: { type?: string; bg: string }) {
  const ink = "rgba(100,100,100,0.25)";
  if (!type || type === "none") {
    return (
      <View style={[wm.box, { backgroundColor: bg, alignItems: "center", justifyContent: "center" }]}>
        <Ionicons name="ban" size={18} color="#ccc" />
      </View>
    );
  }
  return (
    <View style={[wm.box, { backgroundColor: bg, overflow: "hidden" }]}>
      {type === "dots" && Array.from({ length: 9 }).map((_, i) => (
        <View key={i} style={{ position: "absolute", width: 3, height: 3, borderRadius: 1.5, backgroundColor: ink, top: Math.floor(i / 3) * 15 + 8, left: (i % 3) * 15 + 8 }} />
      ))}
      {type === "lines" && [0, 12, 24, 36].map((top) => (
        <View key={top} style={{ position: "absolute", left: 0, right: 0, height: 1, backgroundColor: ink, top }} />
      ))}
      {type === "grid" && (
        <>
          {[0, 16, 32].map((top) => <View key={`h${top}`} style={{ position: "absolute", left: 0, right: 0, height: 1, backgroundColor: ink, top }} />)}
          {[0, 16, 32].map((left) => <View key={`v${left}`} style={{ position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: ink, left }} />)}
        </>
      )}
      {type === "diamonds" && [
        { top: 8,  left: 8  },
        { top: 8,  left: 32 },
        { top: 28, left: 20 },
      ].map(({ top, left }, i) => (
        <View key={i} style={{ position: "absolute", width: 10, height: 10, borderWidth: 1, borderColor: ink, backgroundColor: "transparent", transform: [{ rotate: "45deg" }], top, left }} />
      ))}
    </View>
  );
}
const wm = StyleSheet.create({
  box: { width: 48, height: 48, borderRadius: 10 },
});

// ── Live preview ───────────────────────────────────────────────────────────────

function LivePreview({
  fontSize,
  wallpaper,
  defaultBubble,
  defaultBg,
  isDark,
}: {
  fontSize:    number;
  wallpaper:   string | undefined;
  defaultBubble: string;
  defaultBg:     string;
  isDark: boolean;
}) {
  const bg       = defaultBg;
  const outgoing = defaultBubble;
  const incoming = isDark ? "#3A3A3C" : "#E8E8ED";
  const ink      = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";

  return (
    <View style={[lp.wrap, { backgroundColor: bg }]}>
      {/* Wallpaper overlay (inline mini render) */}
      {wallpaper && wallpaper !== "none" && (
        <View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
          {wallpaper === "dots" && Array.from({ length: 35 }).map((_, i) => (
            <View key={i} style={{ position: "absolute", width: 3, height: 3, borderRadius: 1.5, backgroundColor: ink, top: Math.floor(i / 7) * 22 + 6, left: (i % 7) * 42 + 6 + (Math.floor(i / 7) % 2 === 0 ? 0 : 21) }} />
          ))}
          {wallpaper === "lines" && Array.from({ length: 10 }).map((_, i) => (
            <View key={i} style={{ position: "absolute", left: 0, right: 0, height: 1, backgroundColor: ink, top: i * 20 }} />
          ))}
          {wallpaper === "grid" && (
            <>
              {Array.from({ length: 10 }).map((_, i) => <View key={`h${i}`} style={{ position: "absolute", left: 0, right: 0, height: 1, backgroundColor: ink, top: i * 20 }} />)}
              {Array.from({ length: 8 }).map((_, i) =>  <View key={`v${i}`} style={{ position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: ink, left: i * 36 }} />)}
            </>
          )}
          {wallpaper === "diamonds" && Array.from({ length: 15 }).map((_, i) => (
            <View key={i} style={{ position: "absolute", width: 8, height: 8, borderWidth: 1, borderColor: ink, backgroundColor: "transparent", transform: [{ rotate: "45deg" }], top: Math.floor(i / 5) * 36 + 12, left: (i % 5) * 52 + (Math.floor(i / 5) % 2 === 0 ? 0 : 26) }} />
          ))}
        </View>
      )}

      {/* Incoming */}
      <View style={lp.rowIn}>
        <View style={[lp.bubble, { backgroundColor: incoming }]}>
          <Text style={[lp.text, { color: isDark ? "#fff" : "#333", fontSize }]}>Hey, how's it going? 👋</Text>
        </View>
      </View>

      {/* Outgoing */}
      <View style={lp.rowOut}>
        <View style={[lp.bubble, { backgroundColor: outgoing }]}>
          <Text style={[lp.text, { color: "#fff", fontSize }]}>Doing great, thanks! 😄</Text>
        </View>
      </View>

      {/* Incoming 2 */}
      <View style={lp.rowIn}>
        <View style={[lp.bubble, { backgroundColor: incoming }]}>
          <Text style={[lp.text, { color: isDark ? "#fff" : "#333", fontSize }]}>Want to catch up later? ☕</Text>
        </View>
      </View>

      {/* Outgoing 2 */}
      <View style={lp.rowOut}>
        <View style={[lp.bubble, { backgroundColor: outgoing }]}>
          <Text style={[lp.text, { color: "#fff", fontSize }]}>Sure, sounds good! 🎉</Text>
        </View>
      </View>
    </View>
  );
}

const lp = StyleSheet.create({
  wrap:   { borderRadius: 16, padding: 14, gap: 8, overflow: "hidden", minHeight: 180 },
  rowIn:  { flexDirection: "row", alignSelf: "flex-start", maxWidth: "75%" },
  rowOut: { flexDirection: "row", alignSelf: "flex-end",   maxWidth: "75%" },
  bubble: { borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  text:   { fontFamily: "Inter_400Regular", lineHeight: 20 },
});

// ── Main screen ────────────────────────────────────────────────────────────────

export default function ChatAppearanceScreen() {
  const { id, displayName } = useLocalSearchParams<{ id: string; displayName?: string }>();
  const { colors, accent, isDark } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [routeAllowed, setRouteAllowed] = useState<boolean | null>(null);
  const [appearance, setAppearance] = useState<ChatAppearance>({});
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!id || !user) return;

    setRouteAllowed(null);
    (async () => {
      const { data: chat, error: chatError } = await supabase
        .from("chats")
        .select("is_channel")
        .eq("id", id)
        .maybeSingle();

      if (cancelled) return;
      if (chatError || !chat) {
        setRouteAllowed(false);
        return;
      }
      if (!chat.is_channel) {
        setRouteAllowed(true);
        return;
      }

      const { data: access, error: accessError } = await supabase
        .rpc("get_channel_access_context", { p_channel_id: id });
      if (!cancelled) {
        setRouteAllowed(!accessError && access?.[0]?.is_owner === true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, user?.id]);

  useEffect(() => {
    if (!id) return;
    getChatAppearance(id).then((saved) => {
      if (saved) setAppearance(saved);
    });
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, [id]);

  async function applyChange(patch: Partial<ChatAppearance>) {
    if (!id) return;
    const next = { ...appearance, ...patch };
    // Remove undefined values
    (Object.keys(next) as (keyof ChatAppearance)[]).forEach((k) => {
      if (next[k] === undefined) delete next[k];
    });
    setAppearance(next);
    // Debounced save
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(async () => {
      if (Object.keys(next).length === 0) {
        await clearChatAppearance(id);
      } else {
        await saveChatAppearance(id, next);
      }
      setSaving(false);
    }, 300);
  }

  async function resetAll() {
    if (!id) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    setAppearance({});
    await clearChatAppearance(id);
  }

  const hasCustom = Object.keys(appearance).length > 0;
  const effectiveFontSize = appearance.fontSize ?? 15;

  if (!user) return <Redirect href="/welcome" />;
  if (routeAllowed === false) return <Redirect href="/(tabs)/chats" />;
  if (routeAllowed === null) {
    return (
      <View style={[s.root, { backgroundColor: colors.backgroundSecondary, alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={accent} />
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title={`Appearance: ${displayName ?? "Chat"}`} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}
      >
        {/* ── Auto-save indicator ── */}
        {saving && (
          <View style={[s.savingBanner, { backgroundColor: colors.accent + "15" }]}>
            <Ionicons name="checkmark-circle" size={14} color={colors.accent} />
            <Text style={[s.savingText, { color: colors.accent }]}>Saving…</Text>
          </View>
        )}

        {/* ── Live Preview ── */}
        <View style={[s.previewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <LivePreview
            fontSize={effectiveFontSize}
            wallpaper={appearance.wallpaper}
            defaultBubble={accent}
            defaultBg={colors.background}
            isDark={isDark}
          />
        </View>

        {/* ── Text Size ── */}
        <SectionTitle label="TEXT SIZE" colors={colors} />
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border, padding: 16 }]}>
          <View style={s.fontRow}>
            {FONT_SIZES.map((f) => {
              const active = (appearance.fontSize ?? 15) === f.value;
              return (
                <TouchableOpacity
                  key={f.value}
                  style={[s.fontPill, { borderColor: active ? accent : colors.border, backgroundColor: active ? accent + "18" : "transparent" }]}
                  onPress={() => applyChange({ fontSize: f.value })}
                  activeOpacity={0.7}
                >
                  <Text style={[s.fontPillLabel, { color: active ? accent : colors.text, fontSize: f.value - 2 }]}>
                    {f.label}
                  </Text>
                  <Text style={[s.fontPillName, { color: active ? accent : colors.textMuted }]}>
                    {f.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Wallpaper Pattern ── */}
        <SectionTitle label="WALLPAPER PATTERN" colors={colors} />
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={s.wallpaperRow}>
            {WALLPAPERS.map((w) => {
              const active = (appearance.wallpaper ?? undefined) === w.value;
              return (
                <TouchableOpacity
                  key={w.key}
                  style={[s.wallpaperItem, active && { borderColor: accent, borderWidth: 2.5 }]}
                  onPress={() => applyChange({ wallpaper: w.value })}
                  activeOpacity={0.75}
                >
                  <View style={[s.wallpaperBox, active && { borderColor: accent, borderWidth: 2.5 }]}>
                    <WallpaperMini type={w.value} bg={isDark ? "#2C2C2E" : "#F0F0F5"} />
                    {active && (
                      <View style={[s.wallpaperCheck, { backgroundColor: accent }]}>
                        <Ionicons name="checkmark" size={9} color="#fff" />
                      </View>
                    )}
                  </View>
                  <Text style={[s.wallpaperLabel, { color: active ? accent : colors.textMuted }]} numberOfLines={1}>
                    {w.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Reset ── */}
        {hasCustom && (
          <>
            <SectionTitle label="" colors={colors} />
            <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TouchableOpacity
                style={s.resetRow}
                onPress={resetAll}
                activeOpacity={0.65}
              >
                <View style={[s.iconBadge, { backgroundColor: "#FF3B3018" }]}>
                  <Ionicons name="refresh" size={17} color="#FF3B30" />
                </View>
                <Text style={[s.resetLabel, { color: "#FF3B30" }]}>Reset to Default</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function SectionTitle({ label, colors }: { label: string; colors: any }) {
  return <Text style={[s.sectionTitle, { color: colors.textMuted }]}>{label}</Text>;
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  savingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  savingText: { fontSize: 12, fontFamily: "Inter_500Medium" },

  previewCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    padding: 4,
  },

  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.9,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },

  card: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },

  swatchGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },

  fontRow: {
    flexDirection: "row",
    gap: 10,
  },
  fontPill: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 3,
  },
  fontPillLabel: {
    fontFamily: "Inter_700Bold",
  },
  fontPillName: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },

  wallpaperRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
    flexWrap: "wrap",
  },
  wallpaperItem: {
    alignItems: "center",
    gap: 6,
  },
  wallpaperBox: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 0,
    position: "relative",
  },
  wallpaperCheck: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  wallpaperLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },

  resetRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    minHeight: 52,
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  resetLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
});

/**
 * AfuChat — TikTok/Snapchat-style video creator
 *
 * Phase 1 (camera): Full-screen immersive camera with live filters, zoom,
 *   flash, flip, countdown timer, speed control, duration selector,
 *   progress ring, and real recording via expo-camera.
 *
 * Phase 2 (edit): Video preview + Filters | Text | Stickers | Trim | Adjust
 *   tabs. Draggable text & sticker overlays, trim timeline, thumbnail scrubber,
 *   caption, audience, and post. Filter/overlay metadata is saved to the DB
 *   and applied at playback time — exactly how TikTok/Instagram handle it.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { Video, ResizeMode } from "expo-av";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { useTheme } from "@/hooks/useTheme";
import * as Haptics from "@/lib/haptics";
import { showAlert } from "@/lib/alert";
import { uploadToStorage } from "@/lib/mediaUpload";
import { registerVideoAsset } from "@/lib/videoApi";
import {
  startPostUpload,
  updatePostProgress,
  finishPostUpload,
  failPostUpload,
} from "@/lib/postUploadStore";

// ─── Constants ───────────────────────────────────────────────────────────────

const IS_NATIVE = Platform.OS !== "web";
const MAX_DURATION = 90;
const WARN_SIZE_MB = 80;

const SPEED_OPTIONS = [
  { label: "0.3×", value: 0.3 },
  { label: "0.5×", value: 0.5 },
  { label: "1×",   value: 1.0 },
  { label: "2×",   value: 2.0 },
  { label: "3×",   value: 3.0 },
];

const DURATION_OPTIONS = [15, 30, 60, 90];

const FILTERS = [
  { id: "normal",   label: "Original", tint: null,                overlayOp: 0 },
  { id: "vivid",    label: "Vivid",    tint: "#FF5028",            overlayOp: 0.18 },
  { id: "vintage",  label: "Vintage",  tint: "#C88C3C",            overlayOp: 0.26 },
  { id: "cool",     label: "Cool",     tint: "#2864FF",            overlayOp: 0.18 },
  { id: "drama",    label: "Drama",    tint: "#000000",            overlayOp: 0.34 },
  { id: "glow",     label: "Glow",     tint: "#FFDC50",            overlayOp: 0.22 },
  { id: "rose",     label: "Rose",     tint: "#FF3C78",            overlayOp: 0.18 },
  { id: "teal",     label: "Teal",     tint: "#00C8B4",            overlayOp: 0.18 },
  { id: "golden",   label: "Golden",   tint: "#FFB020",            overlayOp: 0.20 },
  { id: "noir",     label: "Noir",     tint: "#000000",            overlayOp: 0.55 },
  { id: "spring",   label: "Spring",   tint: "#90EE90",            overlayOp: 0.16 },
  { id: "sunset",   label: "Sunset",   tint: "#FF7043",            overlayOp: 0.24 },
];

const FRAMES = [
  { id: "none",     label: "None",      emoji: null,  bg: null },
  { id: "fox",      label: "Fox",       emoji: "🦊",  bg: "#FF6B35" },
  { id: "panda",    label: "Panda",     emoji: "🐼",  bg: "#222" },
  { id: "cat",      label: "Cat",       emoji: "🐱",  bg: "#9B59B6" },
  { id: "frog",     label: "Frog",      emoji: "🐸",  bg: "#27AE60" },
  { id: "lion",     label: "Lion",      emoji: "🦁",  bg: "#E67E22" },
  { id: "wolf",     label: "Wolf",      emoji: "🐺",  bg: "#7F8C8D" },
  { id: "bear",     label: "Bear",      emoji: "🐻",  bg: "#8B4513" },
  { id: "butterfly",label: "Butterfly", emoji: "🦋",  bg: "#3498DB" },
  { id: "dragon",   label: "Dragon",    emoji: "🐉",  bg: "#C0392B" },
  { id: "unicorn",  label: "Unicorn",   emoji: "🦄",  bg: "#FF69B4" },
  { id: "alien",    label: "Alien",     emoji: "👽",  bg: "#2ECC71" },
];

const STICKER_EMOJIS = [
  "🔥","❤️","✨","💯","😍","🎉","👏","🤩","💪","🙌","😂","🥳",
  "🌟","🎯","🚀","💎","👑","🎵","🌈","⚡","🦋","🌺","🍕","🎮",
  "😎","🤔","💀","🥺","😤","🤯","🥰","🤣","😭","🙏","👀","💬",
];

const TEXT_COLORS = [
  "#FFFFFF","#000000","#FF3B30","#FF9500","#FFCC00",
  "#34C759","#007AFF","#AF52DE","#FF2D55","#5AC8FA",
];

const AUDIO_BG_COLORS: Record<string, string> = {
  "#FFFFFF": "rgba(0,0,0,0.8)",
  "#000000": "rgba(255,255,255,0.9)",
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = "camera" | "edit";
type EditTab = "filters" | "text" | "stickers" | "trim" | "adjust";

type TextOverlay = {
  id: string;
  text: string;
  x: number; // 0–1
  y: number; // 0–1
  color: string;
  fontSize: number;
  bold: boolean;
  hasBg: boolean;
};

type StickerOverlay = {
  id: string;
  emoji: string;
  x: number; y: number;
  scale: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(s: number): string {
  const ss = Math.floor(s);
  const m = Math.floor(ss / 60);
  return m > 0 ? `${m}:${String(ss % 60).padStart(2, "0")}` : `${ss}s`;
}

function fmtBytes(b: number): string {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

async function genWebThumb(url: string, at: number): Promise<string | null> {
  if (typeof document === "undefined") return null;
  try {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous"; v.muted = true; v.preload = "metadata"; v.src = url;
    await new Promise<void>((res, rej) => {
      v.addEventListener("loadedmetadata", () => { v.currentTime = Math.min(at, v.duration - 0.01 || at); });
      v.addEventListener("seeked", () => res());
      v.addEventListener("error", () => rej(new Error("seek failed")));
      v.load();
    });
    const w = v.videoWidth || 640; const h = v.videoHeight || 360;
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d"); if (!ctx) return null;
    ctx.drawImage(v, 0, 0, w, h);
    return await new Promise<string | null>((res) => c.toBlob((b) => res(b ? URL.createObjectURL(b) : null), "image/jpeg", 0.8));
  } catch { return null; }
}

async function genNativeThumb(uri: string, ms: number): Promise<string | null> {
  try {
    const m = await import("expo-video-thumbnails");
    const fn = m.getThumbnailAsync ?? (m as any).default?.getThumbnailAsync;
    if (!fn) return null;
    const r = await fn(uri, { time: Math.max(0, ms), quality: 0.7 });
    return r?.uri ?? null;
  } catch { return null; }
}

// ─── DraggableOverlay ─────────────────────────────────────────────────────────

function DraggableItem({
  x, y, containerW, containerH, onMove, onTap, children,
}: {
  x: number; y: number; containerW: number; containerH: number;
  onMove: (nx: number, ny: number) => void;
  onTap?: () => void;
  children: React.ReactNode;
}) {
  const pan = useRef(new Animated.ValueXY({ x: x * containerW, y: y * containerH })).current;
  const panRef = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      pan.setOffset({ x: (pan.x as any)._value, y: (pan.y as any)._value });
      pan.setValue({ x: 0, y: 0 });
    },
    onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_, g) => {
      pan.flattenOffset();
      const nx = Math.max(0, Math.min(1, ((pan.x as any)._value) / containerW));
      const ny = Math.max(0, Math.min(1, ((pan.y as any)._value) / containerH));
      onMove(nx, ny);
    },
  })).current;

  return (
    <Animated.View
      {...panRef.panHandlers}
      style={[
        { position: "absolute", transform: pan.getTranslateTransform() },
      ]}
    >
      <TouchableOpacity onPress={onTap} activeOpacity={0.9}>
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── FilterRing ───────────────────────────────────────────────────────────────

function FilterDot({ filter, selected, onPress, previewColor }: {
  filter: typeof FILTERS[number];
  selected: boolean;
  onPress: () => void;
  previewColor?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  function press() {
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.86, tension: 300, friction: 8, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, tension: 200, friction: 8, useNativeDriver: true }),
    ]).start();
    void Haptics.selectionAsync();
    onPress();
  }
  return (
    <TouchableOpacity onPress={press} style={cs.filterItem} activeOpacity={0.8}>
      <Animated.View style={[
        cs.filterSwatch,
        selected && cs.filterSwatchSelected,
        { transform: [{ scale }] },
      ]}>
        <View style={[
          StyleSheet.absoluteFill, { borderRadius: 26 },
          filter.tint ? { backgroundColor: previewColor ?? filter.tint, opacity: 0.7 } : { backgroundColor: "#555" },
        ]} />
        {filter.id === "normal" && (
          <Ionicons name="sunny" size={14} color="#fff" />
        )}
      </Animated.View>
      <Text style={[cs.filterLabel, selected && { color: "#fff" }]}>{filter.label}</Text>
    </TouchableOpacity>
  );
}

// ─── RecordButton ─────────────────────────────────────────────────────────────

function RecordButton({
  isRecording, maxDuration, elapsed, onPress, accent,
}: {
  isRecording: boolean; maxDuration: number; elapsed: number;
  onPress: () => void; accent: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const innerScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isRecording) {
      Animated.spring(scale, { toValue: 1.14, tension: 160, friction: 8, useNativeDriver: true }).start();
      Animated.spring(innerScale, { toValue: 0.52, tension: 160, friction: 8, useNativeDriver: true }).start();
    } else {
      Animated.spring(scale, { toValue: 1, tension: 160, friction: 8, useNativeDriver: true }).start();
      Animated.spring(innerScale, { toValue: 1, tension: 160, friction: 8, useNativeDriver: true }).start();
    }
  }, [isRecording]);

  const pct = maxDuration > 0 ? Math.min(elapsed / maxDuration, 1) : 0;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.9} style={cs.recordWrap}>
      {/* Progress ring via border arc trick */}
      <View style={cs.progressRingOuter}>
        <View style={[cs.progressRingFill, {
          borderRightColor: pct > 0.25 ? "#FF3B30" : "transparent",
          borderBottomColor: pct > 0.5 ? "#FF3B30" : "transparent",
          borderLeftColor: pct > 0.75 ? "#FF3B30" : "transparent",
          borderTopColor: pct > 0 ? "#FF3B30" : "transparent",
          transform: [{ rotate: `${pct * 360}deg` }],
        }]} />
      </View>
      <Animated.View style={[cs.recordOuter, { transform: [{ scale }] }]}>
        <Animated.View style={[
          cs.recordInner,
          isRecording && cs.recordInnerActive,
          { transform: [{ scale: innerScale }] },
        ]} />
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── CameraPhase ─────────────────────────────────────────────────────────────

function CameraPhase({
  onCapture,
  onPickFromGallery,
  onClose,
  soundName,
}: {
  onCapture: (uri: string, duration: number) => void;
  onPickFromGallery: () => void;
  onClose: () => void;
  soundName?: string;
}) {
  const { accent } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();

  const [CameraView, setCameraView] = useState<any>(null);
  const [camAvailable, setCamAvailable] = useState(true);
  const [facing, setFacing] = useState<"front" | "back">("back");
  const [flash, setFlash] = useState<"off" | "on" | "torch">("off");
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [maxDur, setMaxDur] = useState(60);
  const [speed, setSpeed] = useState(1.0);
  const [showFilters, setShowFilters] = useState(false);
  const [showFrames, setShowFrames] = useState(false);
  const [activeFilter, setActiveFilter] = useState(FILTERS[0]);
  const [activeFrame, setActiveFrame] = useState(FRAMES[0]);
  const [zoom, setZoom] = useState(0);
  const [showSpeedPicker, setShowSpeedPicker] = useState(false);

  const cameraRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    import("expo-camera").then((m) => {
      setCameraView(() => m.CameraView ?? (m as any).Camera ?? null);
    }).catch(() => setCamAvailable(false));
    return () => {
      mounted.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  function startCountdown(cb: () => void) {
    setCountdown(3);
    let c = 3;
    void Haptics.impactAsync("medium");
    countdownRef.current = setInterval(() => {
      c -= 1;
      if (c <= 0) {
        clearInterval(countdownRef.current!);
        setCountdown(null);
        cb();
      } else {
        setCountdown(c);
        void Haptics.impactAsync("light");
      }
    }, 1000);
  }

  async function doRecord() {
    if (!cameraRef.current || isRecording) return;
    try {
      const { Camera } = await import("expo-camera");
      const cp = await Camera.requestCameraPermissionsAsync();
      if (!cp.granted) { showAlert("Camera", "Allow camera access to record."); return; }
      const mp = await Camera.requestMicrophonePermissionsAsync();
      if (!mp.granted) { showAlert("Microphone", "Allow mic access to record audio."); return; }
    } catch {}

    setIsRecording(true);
    setElapsed(0);
    elapsedRef.current = 0;
    void Haptics.impactAsync("medium");
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      if (mounted.current) setElapsed(elapsedRef.current);
      if (elapsedRef.current >= maxDur) stopRecord();
    }, 1000);

    try {
      const result = await cameraRef.current.recordAsync({
        maxDuration: maxDur,
        quality: "720p",
      });
      if (result?.uri && mounted.current) {
        onCapture(result.uri, elapsedRef.current || 10);
      }
    } catch {}

    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (mounted.current) setIsRecording(false);
  }

  function stopRecord() {
    cameraRef.current?.stopRecording?.();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (mounted.current) setIsRecording(false);
  }

  function handleRecordPress() {
    if (isRecording) { stopRecord(); return; }
    if (countdown !== null) return;
    startCountdown(() => doRecord());
  }

  const filterOverlay = activeFilter.tint
    ? { backgroundColor: activeFilter.tint, opacity: activeFilter.overlayOp }
    : null;

  return (
    <View style={[cs.root, { width: W, height: H }]}>
      <StatusBar hidden />

      {/* ── Camera view ── */}
      {!camAvailable || !CameraView ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000", alignItems: "center", justifyContent: "center" }]}>
          <Ionicons name="videocam-off-outline" size={48} color="#555" />
          <Text style={{ color: "#555", marginTop: 12, fontFamily: "Inter_400Regular" }}>Camera unavailable</Text>
          <TouchableOpacity
            onPress={onPickFromGallery}
            style={[cs.galleryFallbackBtn, { backgroundColor: accent }]}
          >
            <Ionicons name="images-outline" size={18} color="#fff" />
            <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", marginLeft: 8 }}>Pick from Gallery</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          mode="video"
          flash={flash}
          zoom={zoom}
        >
          {/* Filter overlay */}
          {filterOverlay && (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: filterOverlay.backgroundColor, opacity: filterOverlay.opacity }]} pointerEvents="none" />
          )}

          {/* Frame / avatar overlay */}
          {activeFrame.emoji && (
            <View style={cs.frameWrap} pointerEvents="none">
              <View style={[cs.frameBubble, { backgroundColor: activeFrame.bg! }]}>
                <Text style={{ fontSize: 30 }}>{activeFrame.emoji}</Text>
              </View>
            </View>
          )}

          {/* Recording indicator */}
          {isRecording && (
            <View style={[cs.recBadge, { top: insets.top + 56 }]}>
              <View style={cs.recDot} />
              <Text style={cs.recTime}>{fmtTime(elapsed)}</Text>
            </View>
          )}

          {/* Countdown overlay */}
          {countdown !== null && (
            <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]} pointerEvents="none">
              <CountdownNumber n={countdown} />
            </View>
          )}

          {/* Zoom slider (left side) */}
          <View style={[cs.zoomSlider, { top: H * 0.3, left: insets.left + 12 }]}>
            {[0.8, 0.6, 0.4, 0.2, 0].map((v) => (
              <TouchableOpacity key={v} onPress={() => setZoom(v)} style={[cs.zoomDot, Math.abs(zoom - v) < 0.1 && { backgroundColor: "#fff" }]} />
            ))}
            <Text style={cs.zoomLabel}>{zoom === 0 ? "1×" : zoom === 0.2 ? "2×" : zoom === 0.4 ? "4×" : zoom === 0.6 ? "6×" : zoom === 0.8 ? "8×" : "1×"}</Text>
          </View>
        </CameraView>
      )}

      {/* ── Top bar ── */}
      <View style={[cs.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onClose} style={cs.iconBtn} hitSlop={10}>
          <Ionicons name="close" size={26} color="#fff" />
        </TouchableOpacity>

        {/* Speed pill */}
        <TouchableOpacity
          onPress={() => setShowSpeedPicker((v) => !v)}
          style={[cs.speedPill, showSpeedPicker && { backgroundColor: "rgba(255,255,255,0.25)" }]}
        >
          <Text style={cs.speedText}>{speed === 1 ? "Speed" : `${speed}×`}</Text>
        </TouchableOpacity>

        {soundName ? (
          <View style={cs.soundBadge}>
            <Ionicons name="musical-notes" size={12} color="#fff" />
            <Text style={cs.soundBadgeText} numberOfLines={1}>{soundName}</Text>
          </View>
        ) : <View style={{ flex: 1 }} />}
      </View>

      {/* Speed picker dropdown */}
      {showSpeedPicker && (
        <View style={[cs.speedDropdown, { top: insets.top + 56 }]}>
          {SPEED_OPTIONS.map((s) => (
            <TouchableOpacity
              key={s.value}
              onPress={() => { setSpeed(s.value); setShowSpeedPicker(false); void Haptics.selectionAsync(); }}
              style={[cs.speedOption, s.value === speed && { backgroundColor: accent + "33" }]}
            >
              <Text style={[cs.speedOptionText, s.value === speed && { color: accent }]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Right sidebar ── */}
      <View style={[cs.sidebar, { top: insets.top + 56, right: insets.right + 14 }]}>
        <SideBtn
          icon={flash === "torch" ? "flashlight" : flash === "on" ? "flash" : "flash-off"}
          label={flash === "torch" ? "Torch" : flash === "on" ? "Flash" : "Flash"}
          onPress={() => setFlash((f) => f === "off" ? "on" : f === "on" ? "torch" : "off")}
          active={flash !== "off"}
          accent={accent}
        />
        <SideBtn
          icon="camera-reverse-outline"
          label="Flip"
          onPress={() => { setFacing((f) => f === "back" ? "front" : "back"); void Haptics.impactAsync("light"); }}
          accent={accent}
        />
        <SideBtn
          icon="color-filter-outline"
          label="Filter"
          onPress={() => { setShowFilters((v) => !v); setShowFrames(false); }}
          active={showFilters || activeFilter.id !== "normal"}
          accent={accent}
        />
        <SideBtn
          icon="happy-outline"
          label="Frame"
          onPress={() => { setShowFrames((v) => !v); setShowFilters(false); }}
          active={showFrames || activeFrame.id !== "none"}
          accent={accent}
        />
        <SideBtn
          icon="timer-outline"
          label={`${maxDur}s`}
          onPress={() => {
            const i = DURATION_OPTIONS.indexOf(maxDur);
            setMaxDur(DURATION_OPTIONS[(i + 1) % DURATION_OPTIONS.length]);
            void Haptics.selectionAsync();
          }}
          accent={accent}
        />
      </View>

      {/* ── Bottom controls ── */}
      <View style={[cs.bottomArea, { paddingBottom: insets.bottom + 12 }]}>
        {/* Filter carousel */}
        {showFilters && (
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            style={cs.filterBar}
            contentContainerStyle={{ paddingHorizontal: 14, gap: 16, alignItems: "center" }}
            keyboardShouldPersistTaps="always"
          >
            {FILTERS.map((f) => (
              <FilterDot
                key={f.id} filter={f}
                selected={activeFilter.id === f.id}
                onPress={() => setActiveFilter(f)}
              />
            ))}
          </ScrollView>
        )}

        {/* Frame / avatar carousel */}
        {showFrames && (
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            style={cs.filterBar}
            contentContainerStyle={{ paddingHorizontal: 14, gap: 14, alignItems: "center" }}
            keyboardShouldPersistTaps="always"
          >
            {FRAMES.map((fr) => (
              <TouchableOpacity
                key={fr.id}
                onPress={() => { setActiveFrame(fr); void Haptics.selectionAsync(); }}
                style={cs.frameItem}
                activeOpacity={0.8}
              >
                <View style={[
                  cs.frameCircle,
                  fr.bg ? { backgroundColor: fr.bg } : { backgroundColor: "#333", borderWidth: 1.5, borderColor: "#555" },
                  activeFrame.id === fr.id && { borderWidth: 2.5, borderColor: "#fff" },
                ]}>
                  {fr.emoji ? (
                    <Text style={{ fontSize: 22 }}>{fr.emoji}</Text>
                  ) : (
                    <Ionicons name="close" size={16} color="#888" />
                  )}
                </View>
                <Text style={cs.frameLabel}>{fr.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Duration tabs */}
        <View style={cs.durationRow}>
          {DURATION_OPTIONS.map((d) => (
            <TouchableOpacity
              key={d}
              onPress={() => { setMaxDur(d); void Haptics.selectionAsync(); }}
              style={[cs.durTab, maxDur === d && { backgroundColor: "rgba(255,255,255,0.22)", borderColor: "rgba(255,255,255,0.5)" }]}
            >
              <Text style={[cs.durText, maxDur === d && { color: "#fff", fontFamily: "Inter_700Bold" }]}>{d}s</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Record row */}
        <View style={cs.recordRow}>
          {/* Gallery picker */}
          <TouchableOpacity onPress={onPickFromGallery} style={cs.galleryBtn} activeOpacity={0.8}>
            <Ionicons name="images-outline" size={26} color="#fff" />
            <Text style={cs.galleryLabel}>Gallery</Text>
          </TouchableOpacity>

          {/* Record button */}
          <RecordButton
            isRecording={isRecording}
            maxDuration={maxDur}
            elapsed={elapsed}
            onPress={handleRecordPress}
            accent={accent}
          />

          {/* Effects (placeholder for future expansion) */}
          <TouchableOpacity
            style={cs.galleryBtn}
            onPress={() => { setShowFilters((v) => !v); }}
            activeOpacity={0.8}
          >
            <Ionicons name="sparkles-outline" size={26} color="#fff" />
            <Text style={cs.galleryLabel}>Effects</Text>
          </TouchableOpacity>
        </View>

        {/* Progress bar */}
        {isRecording && maxDur > 0 && (
          <View style={cs.progressBar}>
            <Animated.View style={[
              cs.progressFill,
              { width: `${Math.min((elapsed / maxDur) * 100, 100)}%` },
            ]} />
          </View>
        )}
      </View>
    </View>
  );
}

function CountdownNumber({ n }: { n: number }) {
  const scale = useRef(new Animated.Value(2)).current;
  const op = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    scale.setValue(2); op.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, tension: 120, friction: 8, useNativeDriver: true }),
      Animated.timing(op, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [n]);
  return (
    <Animated.Text style={[cs.countdown, { opacity: op, transform: [{ scale }] }]}>
      {n}
    </Animated.Text>
  );
}

function SideBtn({ icon, label, onPress, active, accent }: {
  icon: string; label: string; onPress: () => void; active?: boolean; accent: string;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={cs.sideBtn} activeOpacity={0.8}>
      <View style={[cs.sideBtnCircle, active && { backgroundColor: accent + "55", borderColor: accent }]}>
        <Ionicons name={icon as any} size={22} color="#fff" />
      </View>
      <Text style={cs.sideBtnLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── EditPhase ────────────────────────────────────────────────────────────────

function EditPhase({
  videoUri, duration, fileSize, videoWidth, videoHeight, videoMime,
  onBack, onPost,
  soundName, soundAlbumArt,
}: {
  videoUri: string; duration: number; fileSize: number;
  videoWidth: number | null; videoHeight: number | null;
  videoMime?: string;
  onBack: () => void;
  onPost: (payload: PostPayload) => void;
  soundName?: string; soundAlbumArt?: string;
}) {
  const { colors, accent } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();

  const previewH = Math.min(W * (16 / 9), 520);
  const [tab, setTab] = useState<EditTab>("filters");
  const [filter, setFilter] = useState(FILTERS[0]);
  const [frame, setFrame] = useState(FRAMES[0]);
  const [texts, setTexts] = useState<TextOverlay[]>([]);
  const [stickers, setStickers] = useState<StickerOverlay[]>([]);
  const [thumbTime, setThumbTime] = useState(1);
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [thumbGen, setThumbGen] = useState(false);
  const [caption, setCaption] = useState("");
  const [soundDismissed, setSoundDismissed] = useState(false);
  const [editingText, setEditingText] = useState<TextOverlay | null>(null);
  const [editTextValue, setEditTextValue] = useState("");
  const [editTextColor, setEditTextColor] = useState("#FFFFFF");
  const [editTextBold, setEditTextBold] = useState(false);
  const [editTextBg, setEditTextBg] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(duration);
  const [brightness, setBrightness] = useState(0);
  const [audience, setAudience] = useState<"public" | "followers" | "private">("public");
  const [step, setStep] = useState<1 | 2>(1);

  // Thumbnail generation
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    setThumbGen(true);
    debounce.current = setTimeout(async () => {
      try {
        let uri: string | null = null;
        if (Platform.OS === "web") uri = await genWebThumb(videoUri, thumbTime);
        else if (!videoUri.startsWith("blob:")) uri = await genNativeThumb(videoUri, thumbTime * 1000);
        if (uri) setThumbnailUri(uri);
      } catch {} finally { setThumbGen(false); }
    }, 280);
  }, [thumbTime, videoUri]);

  function addText() {
    const t: TextOverlay = {
      id: uid(), text: "Tap to edit", x: 0.2, y: 0.35,
      color: "#FFFFFF", fontSize: 22, bold: false, hasBg: false,
    };
    setTexts((prev) => [...prev, t]);
    setEditingText(t); setEditTextValue(t.text);
    setEditTextColor(t.color); setEditTextBold(t.bold); setEditTextBg(t.hasBg);
  }

  function saveEditText() {
    if (!editingText) return;
    setTexts((prev) => prev.map((t) =>
      t.id === editingText.id
        ? { ...t, text: editTextValue, color: editTextColor, bold: editTextBold, hasBg: editTextBg }
        : t
    ));
    setEditingText(null);
  }

  function removeText(id: string) { setTexts((prev) => prev.filter((t) => t.id !== id)); }
  function removeSticker(id: string) { setStickers((prev) => prev.filter((s) => s.id !== id)); }

  function addSticker(emoji: string) {
    setStickers((prev) => [...prev, {
      id: uid(), emoji, x: 0.3 + Math.random() * 0.3, y: 0.25 + Math.random() * 0.3, scale: 1,
    }]);
    void Haptics.impactAsync("light");
  }

  const trimTrackW = useRef(W - 48);

  const trimStartPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_, g) => {
      const pct = Math.max(0, Math.min(g.moveX / trimTrackW.current, 0.95));
      const t = pct * duration;
      setTrimStart(Math.min(t, trimEnd - 1));
    },
  })).current;

  const trimEndPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_, g) => {
      const pct = Math.max(0.05, Math.min(g.moveX / trimTrackW.current, 1));
      const t = pct * duration;
      setTrimEnd(Math.max(t, trimStart + 1));
    },
  })).current;

  function handlePost() {
    if (!caption.trim()) { showAlert("Caption required", "Add a caption before posting."); return; }
    onPost({
      videoUri, videoMime, duration: trimEnd - trimStart,
      fileSize, videoWidth, videoHeight,
      thumbnailUri, thumbTime,
      caption,
      filter: filter.id !== "normal" ? filter.id : null,
      frame: frame.id !== "none" ? frame.id : null,
      textOverlays: texts,
      stickerOverlays: stickers,
      trimStart, trimEnd,
      soundName: soundDismissed ? null : soundName,
      audience,
    });
  }

  const filterOverlay = filter.tint
    ? { bg: filter.tint, op: filter.overlayOp }
    : null;

  const TABS: { id: EditTab; icon: string; label: string }[] = [
    { id: "filters",  icon: "color-filter-outline", label: "Filters"  },
    { id: "text",     icon: "text-outline",          label: "Text"    },
    { id: "stickers", icon: "happy-outline",          label: "Stickers"},
    { id: "trim",     icon: "cut-outline",            label: "Trim"    },
    { id: "adjust",   icon: "options-outline",        label: "Adjust"  },
  ];

  return (
    <KeyboardAvoidingView style={[es.root, { backgroundColor: "#000" }]} behavior="padding">
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* ── Top bar ── */}
      <View style={[es.topBar, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity onPress={step === 1 ? onBack : () => setStep(1)} style={es.backBtn} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={es.topTitle}>{step === 1 ? "Enhance" : "Details"}</Text>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 3 }}>
            <View style={{ width: 20, height: 3, borderRadius: 2, backgroundColor: accent }} />
            <View style={{ width: 20, height: 3, borderRadius: 2, backgroundColor: step === 2 ? accent : "#3a3a3a" }} />
          </View>
        </View>
        {step === 1 ? (
          <TouchableOpacity onPress={() => setStep(2)} style={[es.postBtn, { backgroundColor: accent }]}>
            <Text style={es.postBtnText}>Next</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handlePost}
            disabled={!caption.trim()}
            style={[es.postBtn, { backgroundColor: caption.trim() ? accent : "#333" }]}
          >
            <Text style={es.postBtnText}>Post</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Step 1: Enhance ─── */}
        {step === 1 && (
        <>
        {/* ── Video preview ── */}
        <View style={[es.previewWrap, { height: previewH, width: W }]}>
          <Video
            source={{ uri: videoUri }}
            style={StyleSheet.absoluteFill}
            resizeMode={ResizeMode.COVER}
            shouldPlay isLooping isMuted={false}
          />
          {filterOverlay && (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: filterOverlay.bg, opacity: filterOverlay.op }]} pointerEvents="none" />
          )}

          {/* Frame overlay */}
          {frame.emoji && (
            <View style={[es.frameTopRight]} pointerEvents="none">
              <View style={[es.frameBubble, { backgroundColor: frame.bg! }]}>
                <Text style={{ fontSize: 28 }}>{frame.emoji}</Text>
              </View>
            </View>
          )}

          {/* Text overlays */}
          {texts.map((t) => (
            <DraggableItem
              key={t.id}
              x={t.x} y={t.y}
              containerW={W} containerH={previewH}
              onMove={(nx, ny) => setTexts((prev) => prev.map((x) => x.id === t.id ? { ...x, x: nx, y: ny } : x))}
              onTap={() => { setEditingText(t); setEditTextValue(t.text); setEditTextColor(t.color); setEditTextBold(t.bold); setEditTextBg(t.hasBg); }}
            >
              <View style={[
                es.textOverlay,
                t.hasBg && { backgroundColor: AUDIO_BG_COLORS[t.color] || "rgba(0,0,0,0.6)" },
              ]}>
                <Text style={{ color: t.color, fontSize: t.fontSize, fontFamily: t.bold ? "Inter_700Bold" : "Inter_400Regular" }}>
                  {t.text}
                </Text>
              </View>
            </DraggableItem>
          ))}

          {/* Sticker overlays */}
          {stickers.map((s) => (
            <DraggableItem
              key={s.id}
              x={s.x} y={s.y}
              containerW={W} containerH={previewH}
              onMove={(nx, ny) => setStickers((prev) => prev.map((x) => x.id === s.id ? { ...x, x: nx, y: ny } : x))}
            >
              <Text style={{ fontSize: 40 * s.scale }}>{s.emoji}</Text>
            </DraggableItem>
          ))}

          {/* Badges */}
          <View style={es.videoBadges}>
            {duration > 0 && (
              <View style={es.badge}>
                <Ionicons name="time-outline" size={11} color="#fff" />
                <Text style={es.badgeText}>{fmtTime(duration)}</Text>
              </View>
            )}
            {fileSize > 0 && (
              <View style={[es.badge, fileSize > WARN_SIZE_MB * 1024 * 1024 && { backgroundColor: "rgba(255,60,0,0.75)" }]}>
                <Ionicons name="cloud-upload-outline" size={11} color="#fff" />
                <Text style={es.badgeText}>{fmtBytes(fileSize)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Edit tabs ── */}
        <View style={[es.tabBar, { backgroundColor: "#111", borderBottomColor: "#222" }]}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.id}
              onPress={() => setTab(t.id)}
              style={[es.tab, tab === t.id && { borderBottomColor: accent, borderBottomWidth: 2 }]}
              activeOpacity={0.8}
            >
              <Ionicons name={t.icon as any} size={18} color={tab === t.id ? accent : "#666"} />
              <Text style={[es.tabText, { color: tab === t.id ? accent : "#666" }]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Tab panels ── */}
        <View style={[es.panel, { backgroundColor: "#111" }]}>

          {/* FILTERS */}
          {tab === "filters" && (
            <View style={{ gap: 16 }}>
              <Text style={es.panelTitle}>Color Filter</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingHorizontal: 2 }}>
                {FILTERS.map((f) => (
                  <TouchableOpacity
                    key={f.id}
                    onPress={() => { setFilter(f); void Haptics.selectionAsync(); }}
                    style={{ alignItems: "center", gap: 6 }}
                    activeOpacity={0.8}
                  >
                    <View style={[
                      es.filterThumb,
                      f.tint && { backgroundColor: f.tint + "BB" },
                      !f.tint && { backgroundColor: "#444" },
                      filter.id === f.id && { borderWidth: 2.5, borderColor: accent },
                    ]}>
                      {!f.tint && <Ionicons name="sunny" size={16} color="#fff" />}
                    </View>
                    <Text style={[es.filterThumbLabel, filter.id === f.id && { color: accent }]}>{f.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[es.panelTitle, { marginTop: 8 }]}>Frame / Avatar</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingHorizontal: 2 }}>
                {FRAMES.map((fr) => (
                  <TouchableOpacity
                    key={fr.id}
                    onPress={() => { setFrame(fr); void Haptics.selectionAsync(); }}
                    style={{ alignItems: "center", gap: 6 }}
                    activeOpacity={0.8}
                  >
                    <View style={[
                      es.frameThumb,
                      fr.bg ? { backgroundColor: fr.bg } : { backgroundColor: "#333" },
                      frame.id === fr.id && { borderWidth: 2.5, borderColor: accent },
                    ]}>
                      {fr.emoji
                        ? <Text style={{ fontSize: 22 }}>{fr.emoji}</Text>
                        : <Ionicons name="close" size={18} color="#888" />}
                    </View>
                    <Text style={[es.filterThumbLabel, frame.id === fr.id && { color: accent }]}>{fr.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* TEXT */}
          {tab === "text" && (
            <View style={{ gap: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={es.panelTitle}>Text Overlays</Text>
                <TouchableOpacity onPress={addText} style={[es.addBtn, { backgroundColor: accent }]}>
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={es.addBtnText}>Add Text</Text>
                </TouchableOpacity>
              </View>

              {texts.length === 0 && (
                <View style={es.emptyHint}>
                  <Ionicons name="text-outline" size={28} color="#444" />
                  <Text style={es.emptyHintText}>Tap "Add Text" to place text on your video</Text>
                </View>
              )}

              {texts.map((t) => (
                <View key={t.id} style={es.textItem}>
                  <TouchableOpacity
                    style={[es.textItemPreview, t.hasBg && { backgroundColor: "#333" }]}
                    onPress={() => { setEditingText(t); setEditTextValue(t.text); setEditTextColor(t.color); setEditTextBold(t.bold); setEditTextBg(t.hasBg); }}
                  >
                    <Text style={{ color: t.color, fontSize: 14, fontFamily: t.bold ? "Inter_700Bold" : "Inter_400Regular" }} numberOfLines={1}>{t.text}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removeText(t.id)} hitSlop={10} style={{ padding: 8 }}>
                    <Ionicons name="trash-outline" size={17} color="#666" />
                  </TouchableOpacity>
                </View>
              ))}

              {/* Inline text editor */}
              {editingText && (
                <View style={[es.textEditor, { borderColor: "#333" }]}>
                  <TextInput
                    style={[es.textEditorInput, { color: editTextColor, fontFamily: editTextBold ? "Inter_700Bold" : "Inter_400Regular" }]}
                    value={editTextValue}
                    onChangeText={setEditTextValue}
                    placeholder="Type something..."
                    placeholderTextColor="#555"
                    multiline maxLength={80}
                    autoFocus
                  />
                  <View style={es.textColorRow}>
                    {TEXT_COLORS.map((c) => (
                      <TouchableOpacity
                        key={c}
                        onPress={() => { setEditTextColor(c); void Haptics.selectionAsync(); }}
                        style={[es.colorDot, { backgroundColor: c }, editTextColor === c && { borderWidth: 3, borderColor: accent }]}
                      />
                    ))}
                  </View>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <TouchableOpacity
                      onPress={() => setEditTextBold((v) => !v)}
                      style={[es.textToggle, editTextBold && { backgroundColor: accent + "22", borderColor: accent }]}
                    >
                      <Text style={{ color: editTextBold ? accent : "#888", fontFamily: "Inter_700Bold", fontSize: 14 }}>B</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setEditTextBg((v) => !v)}
                      style={[es.textToggle, editTextBg && { backgroundColor: accent + "22", borderColor: accent }]}
                    >
                      <Ionicons name="square-outline" size={14} color={editTextBg ? accent : "#888"} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={saveEditText} style={[es.textSave, { backgroundColor: accent }]}>
                      <Text style={es.textSaveText}>Done</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* STICKERS */}
          {tab === "stickers" && (
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={es.panelTitle}>Stickers ({stickers.length})</Text>
                {stickers.length > 0 && (
                  <TouchableOpacity onPress={() => setStickers([])} hitSlop={10}>
                    <Text style={{ color: "#FF3B30", fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Clear all</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={es.stickerGrid}>
                {STICKER_EMOJIS.map((e) => (
                  <TouchableOpacity key={e} onPress={() => addSticker(e)} style={es.stickerItem} activeOpacity={0.7}>
                    <Text style={es.stickerEmoji}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {stickers.length > 0 && (
                <View style={{ gap: 6, marginTop: 4 }}>
                  <Text style={[es.panelTitle, { fontSize: 12 }]}>Placed stickers (drag on preview to reposition)</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {stickers.map((s) => (
                      <TouchableOpacity key={s.id} onPress={() => removeSticker(s.id)} style={es.placedSticker}>
                        <Text style={{ fontSize: 22 }}>{s.emoji}</Text>
                        <View style={es.stickerRemove}>
                          <Ionicons name="close" size={9} color="#fff" />
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}

          {/* TRIM */}
          {tab === "trim" && (
            <View style={{ gap: 14 }}>
              <Text style={es.panelTitle}>Trim Video</Text>

              {/* Thumbnail scrubber */}
              <View style={[es.trimThumbRow]}>
                <View style={[es.trimThumbBox, { backgroundColor: "#222" }]}>
                  {thumbnailUri && !thumbGen ? (
                    <ExpoImage source={{ uri: thumbnailUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : (
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                      {thumbGen ? <ActivityIndicator size="small" color="#666" /> : <Ionicons name="image-outline" size={22} color="#444" />}
                    </View>
                  )}
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={{ color: "#888", fontFamily: "Inter_400Regular", fontSize: 12 }}>Cover frame</Text>
                  <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 }}>{fmtTime(thumbTime)} / {fmtTime(duration)}</Text>
                  <TrimScrubber
                    value={thumbTime} max={duration}
                    accent={accent}
                    onChange={(t) => setThumbTime(t)}
                  />
                  <Text style={{ color: "#555", fontFamily: "Inter_400Regular", fontSize: 11 }}>Drag to set thumbnail frame</Text>
                </View>
              </View>

              {/* Trim bar */}
              <View>
                <View style={es.trimRangeRow}>
                  <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13 }}>Start: {fmtTime(trimStart)}</Text>
                  <Text style={{ color: accent, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Duration: {fmtTime(trimEnd - trimStart)}</Text>
                  <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13 }}>End: {fmtTime(trimEnd)}</Text>
                </View>

                <View
                  style={[es.trimTrack, { backgroundColor: "#333" }]}
                  onLayout={(e) => { trimTrackW.current = e.nativeEvent.layout.width; }}
                >
                  {/* Selected range */}
                  <View style={[
                    es.trimRange,
                    {
                      left: `${(trimStart / duration) * 100}%`,
                      width: `${((trimEnd - trimStart) / duration) * 100}%`,
                      backgroundColor: accent + "44",
                      borderColor: accent,
                    },
                  ]} />
                  {/* Start handle */}
                  <View
                    {...trimStartPan.panHandlers}
                    style={[es.trimHandle, { left: `${(trimStart / duration) * 100}%`, backgroundColor: accent }]}
                  >
                    <Ionicons name="chevron-back" size={12} color="#fff" />
                  </View>
                  {/* End handle */}
                  <View
                    {...trimEndPan.panHandlers}
                    style={[es.trimHandle, es.trimHandleRight, { left: `${(trimEnd / duration) * 100}%`, backgroundColor: accent }]}
                  >
                    <Ionicons name="chevron-forward" size={12} color="#fff" />
                  </View>
                </View>

                <Text style={{ color: "#555", fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 8 }}>
                  Drag the handles to set start and end points
                </Text>
              </View>
            </View>
          )}

          {/* ADJUST */}
          {tab === "adjust" && (
            <View style={{ gap: 16 }}>
              <Text style={es.panelTitle}>Adjustments</Text>
              <AdjustSlider label="Brightness" value={brightness} min={-1} max={1} accent={accent} onChange={setBrightness} />
              <Text style={{ color: "#555", fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 4 }}>
                Set audience and caption on the next screen.
              </Text>
            </View>
          )}
        </View>
        </>
        )}

        {/* ─── Step 2: Details ─── */}
        {step === 2 && (
        <View style={{ gap: 0, paddingTop: 8 }}>

          {/* Cover thumbnail */}
          <View style={{ marginHorizontal: 16, marginBottom: 16, gap: 10 }}>
            <Text style={[es.panelTitle, { color: "#ccc" }]}>Cover</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              {thumbnailUri ? (
                <ExpoImage
                  source={{ uri: thumbnailUri }}
                  style={{ width: 88, height: 62, borderRadius: 8, backgroundColor: "#222" }}
                  contentFit="cover"
                />
              ) : (
                <View style={{ width: 88, height: 62, borderRadius: 8, backgroundColor: "#222", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="image-outline" size={22} color="#444" />
                </View>
              )}
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: "#ccc", fontSize: 13, fontFamily: "Inter_500Medium" }}>
                  Frame at {fmtTime(thumbTime)}
                </Text>
                <TouchableOpacity
                  onPress={() => setStep(1)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                >
                  <Ionicons name="cut-outline" size={13} color={accent} />
                  <Text style={{ color: accent, fontSize: 12, fontFamily: "Inter_500Medium" }}>
                    Go back to Trim to adjust
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Audience */}
          <View style={{ marginHorizontal: 16, marginBottom: 16, gap: 8 }}>
            <Text style={[es.panelTitle, { color: "#ccc" }]}>Audience</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["public", "followers", "private"] as const).map((a) => (
                <TouchableOpacity
                  key={a}
                  onPress={() => { setAudience(a); void Haptics.selectionAsync(); }}
                  style={[es.audienceBtn, audience === a && { backgroundColor: accent + "22", borderColor: accent }]}
                >
                  <Ionicons
                    name={a === "public" ? "globe-outline" : a === "followers" ? "people-outline" : "lock-closed-outline"}
                    size={14} color={audience === a ? accent : "#666"}
                  />
                  <Text style={[es.audienceBtnText, { color: audience === a ? accent : "#666" }]}>
                    {a === "public" ? "Everyone" : a === "followers" ? "Followers" : "Only Me"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Sound banner ── */}
          {soundName && !soundDismissed && (
            <View style={[es.soundBanner, { backgroundColor: "#1A1A1A", borderColor: "#333" }]}>
              {soundAlbumArt
                ? <ExpoImage source={{ uri: soundAlbumArt }} style={es.soundArt} contentFit="cover" />
                : <View style={[es.soundArt, { backgroundColor: accent + "22", alignItems: "center", justifyContent: "center" }]}>
                    <Ionicons name="musical-notes" size={16} color={accent} />
                  </View>
              }
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#888", fontSize: 11, fontFamily: "Inter_500Medium" }}>Sound</Text>
                <Text style={{ color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" }} numberOfLines={1}>{soundName}</Text>
              </View>
              <TouchableOpacity onPress={() => setSoundDismissed(true)} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color="#555" />
              </TouchableOpacity>
            </View>
          )}

          {/* ── Caption ── */}
          <View style={[es.captionWrap, { backgroundColor: "#1A1A1A", borderColor: "#333" }]}>
            <Ionicons name="pencil-outline" size={17} color="#666" style={{ marginTop: 3 }} />
            <TextInput
              style={[es.captionInput, { color: "#fff" }]}
              placeholder="Add a caption… #hashtags @mentions"
              placeholderTextColor="#444"
              value={caption}
              onChangeText={setCaption}
              multiline maxLength={500}
            />
          </View>

          {/* ── Post button ── */}
          <TouchableOpacity
            onPress={handlePost}
            disabled={!caption.trim()}
            style={[es.bigPostBtn, { backgroundColor: caption.trim() ? accent : "#222", marginHorizontal: 16 }]}
            activeOpacity={0.85}
          >
            <Ionicons name="send" size={18} color="#fff" />
            <Text style={es.bigPostBtnText}>Post Video</Text>
          </TouchableOpacity>

        </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function TrimScrubber({ value, max, accent, onChange }: { value: number; max: number; accent: string; onChange: (t: number) => void }) {
  const trackW = useRef(1);
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => onChange(Math.max(0, Math.min(max, (e.nativeEvent.locationX / trackW.current) * max))),
    onPanResponderMove: (e) => onChange(Math.max(0, Math.min(max, (e.nativeEvent.locationX / trackW.current) * max))),
  })).current;
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <View style={ss.outer} onLayout={(e) => { trackW.current = e.nativeEvent.layout.width || 1; }} {...pan.panHandlers}>
      <View style={[ss.track, { backgroundColor: "#333" }]}>
        <View style={[ss.fill, { width: `${pct * 100}%` as any, backgroundColor: accent }]} />
      </View>
      <View style={[ss.thumb, { left: `${pct * 100}%` as any, backgroundColor: accent }]} />
    </View>
  );
}

const ss = StyleSheet.create({
  outer: { height: 32, justifyContent: "center", position: "relative" },
  track: { height: 3, borderRadius: 2, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 2 },
  thumb: { position: "absolute", width: 18, height: 18, borderRadius: 9, top: "50%", marginTop: -9, marginLeft: -9 },
});

function AdjustSlider({ label, value, min, max, accent, onChange }: {
  label: string; value: number; min: number; max: number; accent: string; onChange: (v: number) => void;
}) {
  const trackW = useRef(1);
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const pct = e.nativeEvent.locationX / trackW.current;
      onChange(min + pct * (max - min));
    },
    onPanResponderMove: (e) => {
      const pct = Math.max(0, Math.min(1, e.nativeEvent.locationX / trackW.current));
      onChange(min + pct * (max - min));
    },
  })).current;
  const pct = (value - min) / (max - min);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: "#aaa", fontFamily: "Inter_500Medium", fontSize: 13 }}>{label}</Text>
        <Text style={{ color: accent, fontFamily: "Inter_700Bold", fontSize: 13 }}>{value > 0 ? "+" : ""}{(value * 100).toFixed(0)}</Text>
      </View>
      <View
        style={[ss.outer]}
        onLayout={(e) => { trackW.current = e.nativeEvent.layout.width || 1; }}
        {...pan.panHandlers}
      >
        <View style={[ss.track, { backgroundColor: "#333" }]}>
          <View style={[ss.fill, { width: `${pct * 100}%` as any, backgroundColor: accent }]} />
        </View>
        <View style={[ss.thumb, { left: `${pct * 100}%` as any, backgroundColor: accent }]} />
      </View>
    </View>
  );
}

// ─── Post Payload ─────────────────────────────────────────────────────────────

type PostPayload = {
  videoUri: string; videoMime?: string;
  duration: number; fileSize: number;
  videoWidth: number | null; videoHeight: number | null;
  thumbnailUri: string | null; thumbTime: number;
  caption: string;
  filter: string | null; frame: string | null;
  textOverlays: TextOverlay[]; stickerOverlays: StickerOverlay[];
  trimStart: number; trimEnd: number;
  soundName?: string | null;
  audience: "public" | "followers" | "private";
};

// ─── Root screen ──────────────────────────────────────────────────────────────

export default function CreateVideoScreen() {
  const { user } = useAuth();
  const { soundName, soundAlbumArt } = useLocalSearchParams<{ soundName?: string; soundAlbumArt?: string }>();

  const [phase, setPhase] = useState<Phase>(Platform.OS === "web" ? "edit" : "camera");

  // Video state (set when captured or picked)
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoMime, setVideoMime] = useState<string | undefined>();
  const [duration, setDuration] = useState(0);
  const [fileSize, setFileSize] = useState(0);
  const [videoWidth, setVideoWidth] = useState<number | null>(null);
  const [videoHeight, setVideoHeight] = useState<number | null>(null);

  // Web file input
  const webInputRef = useRef<HTMLInputElement | null>(null);

  function handleCapture(uri: string, dur: number) {
    setVideoUri(uri); setVideoMime("video/mp4");
    setDuration(dur); setFileSize(0);
    setVideoWidth(null); setVideoHeight(null);
    setPhase("edit");
  }

  async function handlePickFromGallery() {
    if (Platform.OS === "web") { webInputRef.current?.click(); return; }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { showAlert("Permission required", "Allow access to your media library."); return; }
    const { getVideoPickerQuality } = await import("@/lib/networkQuality");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "videos", allowsEditing: false,
      quality: getVideoPickerQuality(), videoMaxDuration: MAX_DURATION,
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      const dur = (a.duration || 0) / 1000;
      if (dur > MAX_DURATION) { showAlert("Too long", `Max ${MAX_DURATION} seconds.`); return; }
      setVideoUri(a.uri); setVideoMime(a.mimeType || undefined);
      setDuration(dur); setFileSize(0);
      setVideoWidth((a as any).width ?? null); setVideoHeight((a as any).height ?? null);
      try {
        const info = await FileSystem.getInfoAsync(a.uri);
        if (info.exists) setFileSize((info as any).size ?? 0);
      } catch {}
      setPhase("edit");
    }
  }

  async function handleWebFile(file: File | null) {
    if (!file) return;
    if (file.size > 200 * 1024 * 1024) { showAlert("Too large", "Max 200 MB."); return; }
    const url = URL.createObjectURL(file);
    setVideoUri(url); setVideoMime(file.type || undefined); setFileSize(file.size);
    try {
      const v = document.createElement("video"); v.preload = "metadata"; v.src = url;
      await new Promise<void>((res, rej) => { v.onloadedmetadata = () => res(); v.onerror = () => rej(); });
      if (v.duration > MAX_DURATION) { URL.revokeObjectURL(url); setVideoUri(null); showAlert("Too long", `Max ${MAX_DURATION}s.`); return; }
      setDuration(v.duration); setVideoWidth(v.videoWidth || null); setVideoHeight(v.videoHeight || null);
    } catch {}
    setPhase("edit");
  }

  function handlePost(payload: PostPayload) {
    if (!user) { router.push("/(auth)/login"); return; }

    const {
      videoUri: _uri, videoMime: _mime, duration: _dur, fileSize: _size,
      videoWidth: _w, videoHeight: _h, thumbnailUri: _thumb, thumbTime: _ttime,
      caption: _cap, filter: _filter, frame: _frame,
      textOverlays: _texts, stickerOverlays: _stickers,
      trimStart: _ts, trimEnd: _te,
      soundName: _sound, audience: _aud,
    } = payload;

    if (router.canDismiss()) router.dismissAll();
    else router.replace("/(tabs)");

    startPostUpload("video", _cap.slice(0, 80));

    (async () => {
      try {
        updatePostProgress(0.05);
        const rawExt = _uri.split(".").pop()?.split("?")[0]?.toLowerCase() || "";
        const ext = ["mp4", "mov", "avi", "webm", "mkv", "m4v"].includes(rawExt) ? rawExt : "mp4";
        const filePath = `${user.id}/${Date.now()}.${ext}`;
        const resolvedMime = _mime || (ext === "mov" ? "video/quicktime" : `video/${ext}`);

        updatePostProgress(0.2);
        const { publicUrl, error: upErr } = await uploadToStorage("videos", filePath, _uri, resolvedMime);
        if (upErr || !publicUrl) throw new Error(upErr || "Upload failed");

        updatePostProgress(0.65);
        let thumbUrl: string | null = null;
        try {
          let localThumb = _thumb;
          if (!localThumb) {
            if (Platform.OS === "web") localThumb = await genWebThumb(_uri, _ttime);
            else if (!_uri.startsWith("blob:")) localThumb = await genNativeThumb(_uri, _ttime * 1000);
          }
          if (localThumb) {
            const tp = `${user.id}/${Date.now()}_thumb.jpg`;
            const tu = await uploadToStorage("videos", tp, localThumb, "image/jpeg");
            if (tu.publicUrl) thumbUrl = tu.publicUrl;
          }
        } catch {}

        updatePostProgress(0.85);
        const overlayMeta = JSON.stringify({
          texts: _texts.length > 0 ? _texts : undefined,
          stickers: _stickers.length > 0 ? _stickers : undefined,
          trimStart: _ts > 0 ? _ts : undefined,
          trimEnd: _te < _dur + (_ts || 0) ? _te : undefined,
        });

        const { data: post, error } = await supabase.from("posts").insert({
          author_id: user.id,
          content: _cap,
          video_url: publicUrl,
          image_url: thumbUrl,
          post_type: "video",
          visibility: _aud,
          view_count: 0,
          ...(_sound ? { audio_name: _sound } : {}),
          ...(_filter ? { filter: _filter } : {}),
          ...(_frame ? { avatar_overlay: _frame } : {}),
          overlay_metadata: overlayMeta,
        }).select("id").single();

        if (error) throw error;

        const newPostId = (post as any)?.id ?? null;
        registerVideoAsset({
          source_path: filePath, post_id: newPostId,
          duration: _dur > 0 ? _dur : null,
          width: _w, height: _h,
          source_size_bytes: _size > 0 ? _size : null,
          source_mime: resolvedMime,
        }).catch((e) => console.warn("registerVideoAsset:", e));

        try { const { rewardXp } = await import("../../lib/rewardXp"); rewardXp("post_created"); } catch {}
        finishPostUpload();
      } catch (err: any) {
        failPostUpload(err?.message || "Failed to post video.");
      }
    })();
  }

  // Web-only: show picker if we're in edit phase but no video yet
  const needsVideoPicker = phase === "edit" && !videoUri;

  return (
    <>
      {Platform.OS === "web" && (
        // @ts-ignore
        <input
          ref={webInputRef as any}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,video/*"
          style={{ display: "none" }}
          onChange={(e: any) => { const f = e.target?.files?.[0] ?? null; handleWebFile(f); if (e.target) e.target.value = ""; }}
        />
      )}

      {phase === "camera" && Platform.OS !== "web" ? (
        <CameraPhase
          onCapture={handleCapture}
          onPickFromGallery={handlePickFromGallery}
          onClose={() => router.back()}
          soundName={soundName}
        />
      ) : videoUri ? (
        <EditPhase
          videoUri={videoUri} duration={duration} fileSize={fileSize}
          videoWidth={videoWidth} videoHeight={videoHeight} videoMime={videoMime}
          onBack={() => setPhase(Platform.OS === "web" ? "edit" : "camera")}
          onPost={handlePost}
          soundName={soundName} soundAlbumArt={soundAlbumArt}
        />
      ) : (
        // Web / no video yet: big pick button
        <WebPickerScreen onPick={handlePickFromGallery} />
      )}
    </>
  );
}

function WebPickerScreen({ onPick }: { onPick: () => void }) {
  const { colors, accent } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[{ flex: 1, backgroundColor: colors.background }]}>
      <GlassHeader title="New Video" />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 32 }}>
        <View style={[{ width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", backgroundColor: accent + "20" }]}>
          <Ionicons name="videocam" size={40} color={accent} />
        </View>
        <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: colors.text }}>Create a Video</Text>
        <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.textMuted, textAlign: "center", lineHeight: 20 }}>
          Select a video from your library to get started. Add filters, text, stickers, and more.
        </Text>
        <TouchableOpacity onPress={onPick} style={[{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 28, backgroundColor: accent }]} activeOpacity={0.85}>
          <Ionicons name="images-outline" size={20} color="#fff" />
          <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 16 }}>Choose from Library</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const cs = StyleSheet.create({
  root: { backgroundColor: "#000" },
  topBar: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 10, gap: 12,
  },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center",
  },
  speedPill: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
  },
  speedText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  speedDropdown: {
    position: "absolute", left: 60, zIndex: 20,
    backgroundColor: "rgba(20,20,20,0.96)", borderRadius: 14,
    borderWidth: 1, borderColor: "#333", overflow: "hidden",
  },
  speedOption: { paddingHorizontal: 22, paddingVertical: 12 },
  speedOptionText: { color: "#ccc", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  soundBadge: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 16, maxWidth: 160,
  },
  soundBadgeText: { color: "#fff", fontFamily: "Inter_500Medium", fontSize: 12, flex: 1 },
  sidebar: {
    position: "absolute", zIndex: 10,
    gap: 14, alignItems: "center",
  },
  sideBtn: { alignItems: "center", gap: 4 },
  sideBtnCircle: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: "rgba(0,0,0,0.45)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  sideBtnLabel: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 10 },
  bottomArea: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    zIndex: 10, gap: 12,
  },
  filterBar: {
    maxHeight: 88,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingVertical: 12,
  },
  filterItem: { alignItems: "center", gap: 5 },
  filterSwatch: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.2)", overflow: "hidden",
  },
  filterSwatchSelected: { borderWidth: 3, borderColor: "#fff" },
  filterLabel: { color: "rgba(255,255,255,0.7)", fontFamily: "Inter_600SemiBold", fontSize: 10 },
  frameItem: { alignItems: "center", gap: 5 },
  frameCircle: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: "center", justifyContent: "center",
  },
  frameLabel: { color: "rgba(255,255,255,0.7)", fontFamily: "Inter_600SemiBold", fontSize: 10 },
  durationRow: {
    flexDirection: "row", justifyContent: "center", gap: 10,
    paddingHorizontal: 20,
  },
  durTab: {
    paddingHorizontal: 18, paddingVertical: 7, borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
  },
  durText: { color: "rgba(255,255,255,0.6)", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  recordRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 32, paddingHorizontal: 20,
  },
  recordWrap: { alignItems: "center", justifyContent: "center", width: 90, height: 90 },
  progressRingOuter: {
    position: "absolute", width: 90, height: 90, borderRadius: 45,
    borderWidth: 3, borderColor: "rgba(255,255,255,0.2)",
  },
  progressRingFill: {
    position: "absolute", width: 90, height: 90, borderRadius: 45,
    borderWidth: 3, borderTopColor: "#FF3B30",
  },
  recordOuter: {
    width: 78, height: 78, borderRadius: 39,
    borderWidth: 4, borderColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },
  recordInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#FF3B30" },
  recordInnerActive: { borderRadius: 10, width: 32, height: 32 },
  galleryBtn: { alignItems: "center", gap: 5 },
  galleryLabel: { color: "rgba(255,255,255,0.7)", fontFamily: "Inter_600SemiBold", fontSize: 11 },
  galleryFallbackBtn: {
    flexDirection: "row", alignItems: "center", marginTop: 24,
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24,
  },
  progressBar: {
    height: 3, backgroundColor: "rgba(255,255,255,0.2)",
    marginHorizontal: 0,
  },
  progressFill: { height: "100%", backgroundColor: "#FF3B30" },
  recBadge: {
    position: "absolute", left: 16,
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#FF3B30" },
  recTime: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  frameWrap: { position: "absolute", top: 20, right: 20 },
  frameBubble: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  zoomSlider: {
    position: "absolute", zIndex: 10,
    alignItems: "center", gap: 8,
  },
  zoomDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.35)" },
  zoomLabel: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 11 },
  countdown: {
    fontSize: 120, fontFamily: "Inter_700Bold",
    color: "#fff",
    ...Platform.select({
      web: { textShadow: "0 2px 12px rgba(0,0,0,0.6)" } as any,
      default: { textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 12 },
    }),
  },
});

const es = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 12, gap: 12,
    backgroundColor: "#0A0A0A",
  },
  backBtn: { padding: 4 },
  topTitle: { flex: 1, fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff", textAlign: "center" },
  postBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  postBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  previewWrap: { backgroundColor: "#000", overflow: "hidden" },
  videoBadges: { position: "absolute", top: 12, right: 12, gap: 6 },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(0,0,0,0.65)", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 11,
  },
  badgeText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 11 },
  frameTopRight: { position: "absolute", top: 16, right: 16 },
  frameBubble: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },
  textOverlay: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
  },
  tabBar: {
    flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1, flexDirection: "column", alignItems: "center",
    paddingVertical: 10, gap: 3, borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  tabText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  panel: { padding: 16, gap: 0 },
  panelTitle: { color: "#888", fontFamily: "Inter_600SemiBold", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  filterThumb: {
    width: 56, height: 56, borderRadius: 10,
    alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "transparent",
  },
  filterThumbLabel: { color: "#666", fontFamily: "Inter_600SemiBold", fontSize: 10 },
  frameThumb: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "transparent",
  },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18 },
  addBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  emptyHint: { alignItems: "center", gap: 8, paddingVertical: 24 },
  emptyHintText: { color: "#555", fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center" },
  textItem: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#1A1A1A", borderRadius: 10, overflow: "hidden",
  },
  textItemPreview: { flex: 1, paddingHorizontal: 14, paddingVertical: 10 },
  textEditor: {
    backgroundColor: "#1A1A1A", borderRadius: 12, borderWidth: 1,
    padding: 14, gap: 12,
  },
  textEditorInput: {
    fontSize: 16, lineHeight: 24, minHeight: 48,
  },
  textColorRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  colorDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: "transparent" },
  textToggle: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    borderWidth: 1, borderColor: "#333", alignItems: "center", justifyContent: "center",
  },
  textSave: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  textSaveText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 14 },
  stickerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  stickerItem: {
    width: "12.5%" as any, aspectRatio: 1,
    alignItems: "center", justifyContent: "center", borderRadius: 8,
  },
  stickerEmoji: { fontSize: 30 },
  placedSticker: { position: "relative" },
  stickerRemove: {
    position: "absolute", top: -4, right: -4,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: "#FF3B30", alignItems: "center", justifyContent: "center",
  },
  trimThumbRow: { flexDirection: "row", gap: 14, alignItems: "center" },
  trimThumbBox: { width: 64, height: 96, borderRadius: 8, overflow: "hidden", flexShrink: 0 },
  trimTrack: { height: 44, borderRadius: 8, marginTop: 8, position: "relative", overflow: "visible" },
  trimRange: { position: "absolute", top: 0, bottom: 0, borderWidth: 2, borderRadius: 8 },
  trimHandle: {
    position: "absolute", top: 8, width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center", marginLeft: -14,
    ...Platform.select({
      web: { boxShadow: "0 2px 4px rgba(0,0,0,0.4)" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4, elevation: 6 },
    }),
  },
  trimHandleRight: {},
  trimRangeRow: { flexDirection: "row", justifyContent: "space-between" },
  audienceBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: "#333",
  },
  audienceBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  soundBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginHorizontal: 16, marginTop: 12, padding: 12,
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
  },
  soundArt: { width: 44, height: 44, borderRadius: 8 },
  captionWrap: {
    flexDirection: "row", gap: 10,
    marginHorizontal: 16, marginTop: 12, padding: 14,
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: "flex-start",
  },
  captionInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22, minHeight: 56 },
  bigPostBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 16, borderRadius: 28, marginTop: 16,
  },
  bigPostBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 17 },
});

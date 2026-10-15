import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { showAlert } from "@/lib/alert";
import { useGlobalMusicPlayer } from "@/components/GlobalMusicPlayer";
import { useTheme } from "@/hooks/useTheme";

type MusicSection = "discover" | "library" | "offline" | "studio";

export type AfuMusicTrack = {
  id: string;
  title: string;
  artist: string;
  handle?: string;
  coverColor?: string;
  accentColor?: string;
  genre: string;
  duration?: string;
  plays?: number;
  price: number;
  isOwned?: boolean;
  isCached?: boolean;
  isFeatured?: boolean;
  audioUrl?: string | null;
  creatorId?: string;
  storagePath?: string;
  mimeType?: string;
  fileSize?: number;
  createdAt?: string;
};

export type AfuMusicCallbacks = {
  onBrowse?: () => Promise<AfuMusicTrack[]>;
  onSearch?: (query: string) => Promise<AfuMusicTrack[]>;
  onPurchase?: (track: AfuMusicTrack) => Promise<void | { alreadyOwned?: boolean }>;
  onCache?: (track: AfuMusicTrack) => Promise<void>;
  onRemoveCache?: (track: AfuMusicTrack) => Promise<void>;
  onListOffline?: () => Promise<AfuMusicTrack[]>;
  onResolveAudio?: (track: AfuMusicTrack) => Promise<string | null>;
  onPlay?: (track: AfuMusicTrack) => void | Promise<void>;
  onUpload?: (input: {
    title: string;
    genre: string;
    price: number;
    fileUri: string;
    fileName: string;
    mimeType?: string;
    fileSize?: number;
  }) => Promise<AfuMusicTrack | void>;
  onDeleteUpload?: (track: AfuMusicTrack) => Promise<void>;
  onOpenWallet?: () => void;
  onOpenPlans?: () => void;
};

type Props = AfuMusicCallbacks & {
  initialSection?: MusicSection;
  canMonetize?: boolean;
};

const INK = "#000000";
const CORAL = "#1018D8";
const COBALT = "#1018D8";
const GOLD = "#D4A853";
const CANVAS = "#F5F0E8";
const PAPER = "#FFFFFF";
const MUTED = "#8C7F6A";

const GENRES = ["All", "Ambient", "Electronic", "R&B", "Acoustic", "Lo-fi"];

function formatPlays(value?: number) {
  if (!value) return "New";
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k plays`;
  return `${value} plays`;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function TrackArt({
  track,
  size = 72,
  radius = 18,
}: {
  track: AfuMusicTrack;
  size?: number;
  radius?: number;
}) {
  const { accent } = useTheme();
  return (
    <View
      style={[
        styles.trackArt,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: track.coverColor || accent,
        },
      ]}
    >
      <Text style={[styles.artInitials, { fontSize: Math.max(11, size * 0.2) }]}>
        {initials(track.artist)}
      </Text>
    </View>
  );
}

function TrackRow({
  track,
  owned,
  cached,
  managed = false,
  onOpen,
  onPlay,
  onCache,
  onDelete,
  canCache = true,
}: {
  track: AfuMusicTrack;
  owned: boolean;
  cached: boolean;
  managed?: boolean;
  onOpen: () => void;
  onPlay: () => void;
  onCache: () => void;
  onDelete?: () => void;
  canCache?: boolean;
}) {
  const { colors, accent } = useTheme();
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [styles.trackRow, { borderBottomColor: colors.border }, pressed && styles.trackRowPressed]}>
      <TrackArt track={track} size={64} radius={6} />
      <View style={styles.trackCopy}>
        <Text style={[styles.trackTitle, { color: colors.text }]} numberOfLines={1}>{track.title}</Text>
        <Text style={[styles.trackArtist, { color: colors.textSecondary }]} numberOfLines={1}>{track.artist} · {track.genre}</Text>
        <Text style={[styles.trackMeta, { color: colors.textMuted }]}>{formatPlays(track.plays)}{track.duration ? ` · ${track.duration}` : ""}</Text>
      </View>
      <View style={styles.rowActions}>
        {managed ? (
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              onDelete?.();
            }}
            hitSlop={8}
            accessibilityLabel={`Remove ${track.title}`}
          >
            <Ionicons name="trash-outline" size={19} color={CORAL} />
          </Pressable>
        ) : owned ? (
          <Pressable
            accessibilityLabel={`Play ${track.title}`}
            onPress={(event) => {
              event.stopPropagation();
              onPlay();
            }}
            hitSlop={8}
            style={({ pressed }) => [styles.miniPlay, { backgroundColor: accent }, pressed && styles.miniPlayPressed]}
          >
            <Ionicons name="play" size={13} color={PAPER} />
          </Pressable>
        ) : (
          <Text style={[styles.priceText, { color: accent }]}>{track.price === 0 ? "Free" : `${track.price} AC`}</Text>
        )}
        {owned && canCache ? (
          <Pressable onPress={onCache} hitSlop={8} accessibilityLabel={cached ? "Available offline" : "Save offline"}>
            <Ionicons name={cached ? "arrow-down-circle" : "arrow-down-circle-outline"} size={21} color={cached ? COBALT : MUTED} />
          </Pressable>
        ) : null}
        <Ionicons name="chevron-forward" size={17} color="#B2A79B" />
      </View>
    </Pressable>
  );
}

function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  action?: { label: string; onPress: () => void };
}) {
  const { colors, accent } = useTheme();
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.inputBg }]}><Ionicons name={icon} size={25} color={accent} /></View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.emptyMessage, { color: colors.textMuted }]}>{message}</Text>
      {action ? (
        <Pressable onPress={action.onPress} style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}>
          <Text style={styles.outlineButtonText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function AfuMusicApp({
  initialSection = "discover",
  onBrowse,
  onSearch,
  onPurchase,
  onCache,
  onRemoveCache,
  onListOffline,
  onResolveAudio,
  onPlay,
  onUpload,
  onDeleteUpload,
  onOpenWallet,
  onOpenPlans,
  acoinBalance,
  canMonetize = false,
}: Props & { acoinBalance?: number }) {
  const insets = useSafeAreaInsets();
  const { colors, accent, isDark } = useTheme();
  const { playMusic } = useGlobalMusicPlayer();
  const [section, setSection] = useState<MusicSection>(Platform.OS === "web" && initialSection === "offline" ? "discover" : initialSection);
  const [tracks, setTracks] = useState<AfuMusicTrack[]>([]);
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("All");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [cachedIds, setCachedIds] = useState<string[]>([]);
  const [offlineTracks, setOfflineTracks] = useState<AfuMusicTrack[]>([]);
  const [ownedIds, setOwnedIds] = useState<string[]>([]);
  const [purchaseTrack, setPurchaseTrack] = useState<AfuMusicTrack | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadGenre, setUploadGenre] = useState("Ambient");
  const [uploadPrice, setUploadPrice] = useState("20");
  const [uploadFile, setUploadFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);

  const loadTracks = useCallback(async () => {
    setLoadError(false);
    setLoading(true);
    try {
      if (!onBrowse) throw new Error("AfuMusic is not connected to the catalog.");
      const result = await onBrowse();
      setTracks(result);
      setOwnedIds(result.filter((track) => track.isOwned || track.price === 0).map((track) => track.id));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [onBrowse]);

  const syncOffline = useCallback(async () => {
    if (!onListOffline) return;
    try {
      const result = await onListOffline();
      setOfflineTracks(result);
      setCachedIds(result.map((track) => track.id));
      setOwnedIds((ids) => Array.from(new Set([...ids, ...result.map((track) => track.id)])));
    } catch {
      setOfflineTracks([]);
      setCachedIds([]);
    }
  }, [onListOffline]);

  useEffect(() => {
    loadTracks();
    void syncOffline();
  }, [loadTracks, syncOffline]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadTracks();
    setRefreshing(false);
  }, [loadTracks]);

  const filteredTracks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const source = section === "offline" && onListOffline ? offlineTracks : tracks;
    return source.filter((track) => {
      const matchesGenre = genre === "All" || track.genre === genre;
      const matchesQuery = !normalized ||
        `${track.title} ${track.artist} ${track.genre}`.toLowerCase().includes(normalized);
      const matchesSection =
        section === "library" ? ownedIds.includes(track.id) || track.isOwned :
        section === "offline" ? cachedIds.includes(track.id) :
        section === "studio" ? track.handle === "@you" || track.artist === "You" || track.id.startsWith("local-") :
        true;
      return matchesGenre && matchesQuery && matchesSection;
    });
  }, [cachedIds, genre, offlineTracks, onListOffline, ownedIds, query, section, tracks]);

  const featuredTracks = useMemo(() => (
    tracks
      .filter((track) => track.isFeatured || (track.plays ?? 0) > 0)
      .sort((left, right) => (right.plays ?? 0) - (left.plays ?? 0))
      .slice(0, 4)
  ), [tracks]);

  const handleSearch = useCallback(async (value: string) => {
    setQuery(value);
    if (!onSearch || !value.trim()) return;
    try {
      const result = await onSearch(value.trim());
      setTracks(result);
        setOwnedIds(result.filter((track) => track.isOwned || track.price === 0).map((track) => track.id));
    } catch {
      setLoadError(true);
    }
  }, [onSearch]);

  const openTrack = useCallback(async (track: AfuMusicTrack) => {
    const owned = ownedIds.includes(track.id) || track.isOwned || track.price === 0;
    if (!owned) {
      setPurchaseTrack(track);
      return;
    }
    try {
      const audioUrl = onResolveAudio ? await onResolveAudio(track) : track.audioUrl ?? null;
      if (!audioUrl) {
        showAlert("Playback unavailable", "Audio is not available for this track yet.");
        return;
      }
      playMusic(track, audioUrl);
    } catch (error) {
      showAlert("Playback unavailable", error);
    }
  }, [onResolveAudio, ownedIds, playMusic]);

  const playTrack = useCallback(async (track: AfuMusicTrack) => {
    try {
      await onPlay?.(track);
      const audioUrl = onResolveAudio ? await onResolveAudio(track) : track.audioUrl ?? null;
      if (!audioUrl) {
        showAlert("Playback unavailable", "Audio is not available for this track yet.");
        return;
      }
      playMusic(track, audioUrl);
    } catch (error) {
      showAlert("Playback unavailable", error);
    }
  }, [onPlay, onResolveAudio, playMusic]);

  const handleCache = useCallback(async (track: AfuMusicTrack) => {
    try {
      if (cachedIds.includes(track.id)) {
        if (!onRemoveCache) throw new Error("Offline removal is unavailable.");
        await onRemoveCache(track);
        setCachedIds((ids) => ids.filter((id) => id !== track.id));
        setOfflineTracks((current) => current.filter((item) => item.id !== track.id));
        return;
      }
      if (!onCache) throw new Error("Offline saving is unavailable.");
      await onCache(track);
      setCachedIds((ids) => ids.includes(track.id) ? ids : [...ids, track.id]);
      setOfflineTracks((current) => [{ ...track, isCached: true }, ...current.filter((item) => item.id !== track.id)]);
    } catch (error) {
      if (error instanceof Error && error.message === "Offline removal is unavailable.") {
        showAlert("Could not remove offline copy", "Try again in a moment.");
        return;
      }
      showAlert("Could not save offline", "Try again when you have a stronger connection.");
    }
  }, [cachedIds, onCache, onRemoveCache]);

  const handleDeleteUpload = useCallback((track: AfuMusicTrack) => {
    showAlert("Remove this track?", "Listeners will no longer see it in AfuMusic.", [
      { text: "Keep track", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await onDeleteUpload?.(track);
            setTracks((current) => current.filter((item) => item.id !== track.id));
          } catch {
            showAlert("Could not remove track", "Try again in a moment.");
          }
        },
      },
    ]);
  }, [onDeleteUpload]);

  const confirmPurchase = useCallback(async () => {
    if (!purchaseTrack) return;
    if (purchasing) return;
    const price = Math.max(0, purchaseTrack.price);
    if (price > 0 && typeof acoinBalance === "number" && acoinBalance < price) {
      showAlert(
        "Not enough ACoin",
        `You need ${price} ACoin, but your balance is ${Math.floor(acoinBalance)} ACoin.`,
        [
          { text: "Not now", style: "cancel" },
          ...(onOpenWallet ? [{ text: "Open AfuPay", onPress: onOpenWallet }] : []),
        ],
      );
      return;
    }
    setPurchasing(true);
    try {
      if (!onPurchase) throw new Error("AfuPay purchase is unavailable.");
      const result = await onPurchase(purchaseTrack);
      setOwnedIds((ids) => [...ids, purchaseTrack.id]);
      setTracks((current) => current.map((track) => (
        track.id === purchaseTrack.id ? { ...track, isOwned: true } : track
      )));
      setPurchaseTrack(null);
      showAlert(
        result?.alreadyOwned ? "Already in your library" : "Purchase complete",
        result?.alreadyOwned
          ? `${purchaseTrack.title} was already owned, so no ACoin was charged.`
          : Platform.OS === "web"
            ? `${purchaseTrack.title} is now in your library and ready to play on the web.`
            : `${purchaseTrack.title} is now in your library and available offline.`,
      );
    } catch {
      showAlert("Purchase could not be completed", "Your ACoin balance was not changed. Try again.");
    } finally {
      setPurchasing(false);
    }
  }, [acoinBalance, onOpenWallet, onPurchase, purchaseTrack, purchasing]);

  const pickAudio = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "audio/*",
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (!result.canceled) setUploadFile(result.assets[0]);
  }, []);

  const submitUpload = useCallback(async () => {
    if (!canMonetize) {
      showAlert("Verified creator access required", "An active Standard or Pro plan, or an existing verified badge, is required to sell music.", [
        { text: "Not now", style: "cancel" },
        ...(onOpenPlans ? [{ text: "View plans", onPress: onOpenPlans }] : []),
      ]);
      return;
    }
    if (uploading) return;
    if (!uploadTitle.trim() || !uploadFile) {
      showAlert("Add a title and audio", "Choose the track you want to publish before continuing.");
      return;
    }
    setUploading(true);
    try {
      const payload = {
        title: uploadTitle.trim(),
        genre: uploadGenre,
        price: Math.max(0, Number(uploadPrice) || 0),
        fileUri: uploadFile.uri,
        fileName: uploadFile.name,
        mimeType: uploadFile.mimeType,
        fileSize: uploadFile.size,
      };
      if (!onUpload) throw new Error("AfuMusic publishing is unavailable.");
      const result = await onUpload(payload);
      if (result) {
        setTracks((current) => [{
          ...result,
          artist: result.artist || "You",
          handle: result.handle || "@you",
        }, ...current]);
      }
      setUploadOpen(false);
      setUploadTitle("");
      setUploadFile(null);
      showAlert("Published to AfuMusic", "Your track is ready for listeners.");
    } catch {
      showAlert("Upload failed", "Your track was not published. Try again.");
    } finally {
      setUploading(false);
    }
  }, [canMonetize, onOpenPlans, onUpload, uploadFile, uploadGenre, uploadPrice, uploadTitle, uploading]);

  const renderTrack = useCallback(({ item }: { item: AfuMusicTrack }) => (
    <TrackRow
      track={item}
      owned={ownedIds.includes(item.id) || item.isOwned || item.price === 0}
      cached={cachedIds.includes(item.id)}
      managed={section === "studio"}
      onOpen={() => { void openTrack(item); }}
      onPlay={() => { void playTrack(item); }}
      onCache={() => handleCache(item)}
      canCache={Platform.OS !== "web"}
      onDelete={() => handleDeleteUpload(item)}
    />
  ), [cachedIds, handleCache, handleDeleteUpload, openTrack, ownedIds, playTrack, section]);

  const sectionTitle = section === "discover" ? "Find your next repeat" :
    section === "library" ? "Your listening library" :
    section === "offline" ? "Ready without signal" : "Your studio";

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScrollView
        style={styles.pageScroll}
        contentContainerStyle={styles.pageContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={accent} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
      <View style={styles.topBar}>
        <View>
          <Text style={[styles.wordmark, { color: colors.text }]}>Afu<Text style={[styles.wordmarkAccent, { color: accent }]}>Music</Text></Text>
        </View>
        <View style={[styles.coinBadge, { backgroundColor: colors.inputBg }]}>
          <Ionicons name="flash" size={13} color={GOLD} />
          <Text style={[styles.coinText, { color: colors.text }]}>
            {typeof acoinBalance === "number" ? `${Math.floor(acoinBalance)} AC` : "ACoin"}
          </Text>
        </View>
      </View>

      <View style={[styles.searchWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={handleSearch}
          placeholder="Search tracks, artists, sounds"
          placeholderTextColor={colors.textMuted}
          style={[styles.searchInput, { color: colors.text }]}
          returnKeyType="search"
          accessibilityLabel="Search AfuMusic"
        />
        {query ? <Pressable onPress={() => handleSearch("")} hitSlop={8}><Ionicons name="close-circle" size={18} color={colors.textMuted} /></Pressable> : null}
      </View>

      {section === "discover" && !query ? (
        <View style={[styles.heroSection, { borderBottomColor: colors.border }]}>
          <Text style={[styles.heroTitle, { color: colors.text }]}>Your next favourite starts here.</Text>
          <Text style={[styles.heroBody, { color: colors.textSecondary }]}>Discover independent artists, collect the tracks you love, and play them across AfuChat.</Text>
        </View>
      ) : null}

      {section === "discover" && !query && featuredTracks.length > 0 ? (
        <View style={styles.featuredBlock}>
          <View style={styles.featuredHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>EDITOR'S PICKS</Text>
              <Text style={[styles.featuredTitle, { color: colors.text }]}>Featured this week</Text>
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredRail}>
            {featuredTracks.map((track) => (
              <Pressable key={track.id} onPress={() => { void openTrack(track); }} style={({ pressed }) => [styles.featuredCard, pressed && styles.pressed]}>
                <TrackArt track={track} size={78} radius={6} />
                <Text style={[styles.featuredCardTitle, { color: colors.text }]} numberOfLines={1}>{track.title}</Text>
                <Text style={[styles.featuredCardArtist, { color: colors.textMuted }]} numberOfLines={1}>{track.artist}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.contentHeader}>
        <View>
          <Text style={styles.sectionEyebrow}>{section === "studio" ? "PUBLISH & MANAGE" : "YOUR NEXT LISTEN"}</Text>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{sectionTitle}</Text>
        </View>
        {section === "studio" ? (
          <Pressable
            onPress={() => {
              if (canMonetize) setUploadOpen(true);
              else void submitUpload();
            }}
            style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
          >
            <Ionicons name="add" size={19} color={PAPER} />
            <Text style={styles.addButtonText}>Publish</Text>
          </Pressable>
        ) : null}
      </View>

      {section === "discover" && !query ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.genreRail}>
          {GENRES.map((item) => (
            <Pressable key={item} onPress={() => setGenre(item)} style={[styles.genreChip, { backgroundColor: genre === item ? accent : colors.inputBg, borderColor: genre === item ? accent : colors.border }]}>
              <Text style={[styles.genreText, { color: genre === item ? "#FFFFFF" : colors.text }]}>{item}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}


      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="small" color={accent} />
          <Text style={[styles.loadingLabel, { color: colors.textMuted }]}>Loading your music</Text>
        </View>
      ) : loadError ? (
        <EmptyState icon="cloud-offline-outline" title="The signal slipped" message="We couldn't load your listening space." action={{ label: "Try again", onPress: loadTracks }} />
      ) : filteredTracks.length === 0 ? (
        <EmptyState
          icon={section === "offline" ? "cloud-download-outline" : section === "studio" ? "mic-outline" : "albums-outline"}
          title={section === "offline" ? "Nothing saved offline" : section === "library" ? "Your library is waiting" : section === "studio" ? "No published tracks" : "No tracks found"}
          message={section === "offline" ? "Save purchased tracks here for flights, commutes, and quiet corners." : section === "library" ? "Unlock a track to make it part of your private collection." : "Try another search or publish your first track."}
          action={section === "studio" ? { label: "Publish a track", onPress: () => setUploadOpen(true) } : undefined}
        />
      ) : (
        <View style={styles.trackList}>
          {filteredTracks.map((track) => (
            <React.Fragment key={track.id}>{renderTrack({ item: track })}</React.Fragment>
          ))}
        </View>
      )}
      </ScrollView>

      <Modal visible={!!purchaseTrack} animationType="slide" transparent onRequestClose={() => setPurchaseTrack(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.purchaseSheet, { backgroundColor: colors.background }]}>
            {purchaseTrack ? <TrackArt track={purchaseTrack} size={78} radius={6} /> : null}
            <Text style={styles.purchaseKicker}>UNLOCK THIS TRACK</Text>
            <Text style={[styles.purchaseTitle, { color: colors.text }]}>{purchaseTrack?.title}</Text>
            <Text style={[styles.purchaseArtist, { color: colors.textMuted }]}>{purchaseTrack?.artist} · {purchaseTrack?.genre}</Text>
            <View style={styles.purchaseRule} />
            <View style={styles.purchaseRow}><Text style={[styles.purchaseLabel, { color: colors.textMuted }]}>One-time access</Text><Text style={[styles.purchaseValue, { color: colors.text }]}>{purchaseTrack?.price} ACoin</Text></View>
            <View style={styles.purchaseRow}><Text style={[styles.purchaseLabel, { color: colors.textMuted }]}>Offline listening</Text><Ionicons name="checkmark-circle" size={19} color={COBALT} /></View>
            {typeof acoinBalance === "number" ? (
              <View style={styles.balanceRow}>
                <Text style={[styles.purchaseLabel, { color: colors.textMuted }]}>Your balance</Text>
                <Text style={[styles.purchaseValue, { color: colors.text }, acoinBalance < (purchaseTrack?.price ?? 0) && styles.insufficientValue]}>{Math.floor(acoinBalance)} ACoin</Text>
              </View>
            ) : null}
            {typeof acoinBalance === "number" && acoinBalance < (purchaseTrack?.price ?? 0) ? (
              <Text style={styles.insufficientText}>Top up in AfuPay to unlock this track.</Text>
            ) : null}
            <Pressable
              onPress={confirmPurchase}
              disabled={purchasing || (typeof acoinBalance === "number" && acoinBalance < (purchaseTrack?.price ?? 0))}
              style={({ pressed }) => [
                styles.purchaseButton,
                (purchasing || (typeof acoinBalance === "number" && acoinBalance < (purchaseTrack?.price ?? 0))) && styles.purchaseButtonDisabled,
                pressed && styles.purchaseButtonPressed,
              ]}
            >
              {purchasing ? <ActivityIndicator color={PAPER} /> : <><Ionicons name="flash" size={16} color={PAPER} /><Text style={styles.purchaseButtonText}>Unlock for {purchaseTrack?.price} AC</Text></>}
            </Pressable>
            <Pressable onPress={() => setPurchaseTrack(null)} style={styles.cancelButton}><Text style={[styles.cancelText, { color: colors.text }]}>Not now</Text></Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={uploadOpen} animationType="slide" transparent onRequestClose={() => setUploadOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalBackdrop}>
          <View style={[styles.uploadSheet, { backgroundColor: colors.background }]}>
            <View style={styles.uploadHeader}><View><Text style={styles.purchaseKicker}>CREATOR STUDIO</Text><Text style={[styles.purchaseTitle, { color: colors.text }]}>Publish a track</Text></View><Pressable onPress={() => setUploadOpen(false)} hitSlop={10}><Ionicons name="close" size={23} color={colors.text} /></Pressable></View>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Track title</Text>
            <TextInput value={uploadTitle} onChangeText={setUploadTitle} placeholder="Give it a name" placeholderTextColor={colors.textMuted} style={[styles.formInput, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]} />
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Genre</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.formGenreRail}>
              {GENRES.slice(1).map((item) => <Pressable key={item} onPress={() => setUploadGenre(item)} style={[styles.formGenreChip, uploadGenre === item && styles.formGenreChipActive]}><Text style={[styles.formGenreText, uploadGenre === item && styles.formGenreTextActive]}>{item}</Text></Pressable>)}
            </ScrollView>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Unlock price</Text>
            <View style={[styles.priceInput, { backgroundColor: colors.inputBg, borderColor: colors.border }]}><Ionicons name="flash" size={15} color={GOLD} /><TextInput value={uploadPrice} onChangeText={setUploadPrice} keyboardType="number-pad" keyboardAppearance={isDark ? "dark" : "light"} style={[styles.priceTextInput, { color: colors.text }]} /><Text style={styles.acoinSuffix}>ACoin</Text></View>
            <Pressable onPress={pickAudio} style={({ pressed }) => [styles.filePicker, { backgroundColor: colors.inputBg, borderColor: colors.border }, pressed && styles.pressed]}>
              <Ionicons name={uploadFile ? "checkmark-circle" : "cloud-upload-outline"} size={22} color={uploadFile ? COBALT : CORAL} />
              <View style={styles.filePickerCopy}><Text style={[styles.filePickerTitle, { color: colors.text }]}>{uploadFile ? uploadFile.name : "Choose an audio file"}</Text><Text style={[styles.filePickerSub, { color: colors.textMuted }]}>{uploadFile ? "Ready to publish" : "MP3, M4A, or WAV"}</Text></View>
              <Ionicons name="chevron-forward" size={17} color={MUTED} />
            </Pressable>
            <Pressable onPress={() => void submitUpload()} disabled={uploading || !canMonetize} style={({ pressed }) => [styles.publishButton, (pressed || !canMonetize) && styles.purchaseButtonPressed]}>{uploading ? <ActivityIndicator color={PAPER} /> : <><Ionicons name="arrow-up-circle-outline" size={18} color={PAPER} /><Text style={styles.purchaseButtonText}>Publish to AfuMusic</Text></>}</Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, width: "100%" },
  pageScroll: { flex: 1, width: "100%" },
  pageContent: { paddingBottom: 24, width: "100%", maxWidth: 1120, alignSelf: "center" },
  topBar: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 15, paddingBottom: 14 },
  wordmark: { color: INK, fontFamily: "Inter_700Bold", fontSize: 29, letterSpacing: -1.3 },
  wordmarkAccent: { color: CORAL },
  privateLabel: { color: MUTED, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 1.4, marginTop: 3 },
  coinBadge: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 4, marginTop: 2 },
  coinText: { color: INK, fontFamily: "Inter_700Bold", fontSize: 12 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 20, height: 46, paddingHorizontal: 12, borderRadius: 4, backgroundColor: PAPER, borderWidth: 1, borderColor: "#E9DED2" },
  searchInput: { flex: 1, color: INK, fontFamily: "Inter_500Medium", fontSize: 13 },
  pressed: { opacity: 0.72 },
  heroSection: { marginHorizontal: 20, marginTop: 26, paddingBottom: 23, borderBottomWidth: 1 },
  heroEyebrow: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1.6, marginBottom: 11 },
  heroTitle: { fontFamily: "Inter_700Bold", fontSize: 34, lineHeight: 37, letterSpacing: -1.25, maxWidth: 560 },
  heroBody: { fontFamily: "Inter_500Medium", fontSize: 14, lineHeight: 21, maxWidth: 520, marginTop: 12 },
  heroButton: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 9, paddingHorizontal: 15, paddingVertical: 12, borderRadius: 10, marginTop: 18 },
  heroButtonText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 12 },
  loadingState: { alignItems: "center", justifyContent: "center", paddingVertical: 42, gap: 12 },
  loadingLabel: { fontFamily: "Inter_500Medium", fontSize: 12 },
  contentHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 20, marginTop: 28, marginBottom: 12 },
  sectionEyebrow: { color: CORAL, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1.25, marginBottom: 4 },
  sectionTitle: { color: INK, fontFamily: "Inter_700Bold", fontSize: 25, letterSpacing: -0.8 },
  featuredBlock: { marginTop: 20 },
  featuredHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingHorizontal: 20, marginBottom: 10 },
  featuredTitle: { color: INK, fontFamily: "Inter_700Bold", fontSize: 18, letterSpacing: -0.4, marginTop: 3 },
  featuredRail: { paddingHorizontal: 20, gap: 12 },
  featuredCard: { width: 124, paddingBottom: 8 },
  featuredCardTitle: { color: INK, fontFamily: "Inter_700Bold", fontSize: 11, marginTop: 8 },
  featuredCardArtist: { color: MUTED, fontFamily: "Inter_500Medium", fontSize: 10, marginTop: 3 },
  addButton: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: CORAL, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12 },
  addButtonPressed: { backgroundColor: INK },
  addButtonText: { color: PAPER, fontFamily: "Inter_700Bold", fontSize: 11 },
  genreRail: { paddingHorizontal: 20, gap: 8, paddingBottom: 6 },
  genreChip: { borderWidth: 1, borderColor: "#E2D8CE", borderRadius: 4, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: PAPER },
  genreChipActive: { borderColor: INK, backgroundColor: INK },
  genreText: { color: MUTED, fontFamily: "Inter_700Bold", fontSize: 10 },
  genreTextActive: { color: PAPER },
  listHint: { color: MUTED, fontFamily: "Inter_600SemiBold", fontSize: 11, marginBottom: 4 },
  trackList: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28 },
  trackRow: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 88, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E8DED4" },
  trackRowPressed: { opacity: 0.7, transform: [{ translateX: 2 }] },
  trackArt: { overflow: "hidden", alignItems: "center", justifyContent: "center" },
  artInitials: { color: "#FFFFFF", fontFamily: "Inter_700Bold", letterSpacing: -0.2 },
  trackCopy: { flex: 1, minWidth: 0, gap: 3 },
  trackTitle: { color: INK, fontFamily: "Inter_700Bold", fontSize: 14 },
  trackArtist: { color: "#645C55", fontFamily: "Inter_500Medium", fontSize: 11 },
  trackMeta: { color: MUTED, fontFamily: "Inter_500Medium", fontSize: 10 },
  rowActions: { flexDirection: "row", alignItems: "center", gap: 9 },
  miniPlay: { width: 27, height: 27, borderRadius: 14, backgroundColor: CORAL, alignItems: "center", justifyContent: "center" },
  miniPlayPressed: { backgroundColor: INK, transform: [{ scale: 0.9 }] },
  priceText: { color: CORAL, fontFamily: "Inter_700Bold", fontSize: 10 },

  emptyState: { alignItems: "center", paddingHorizontal: 45, paddingTop: 55 },
  emptyIcon: { width: 55, height: 55, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: "#F5D8D0", marginBottom: 15 },
  emptyTitle: { color: INK, fontFamily: "Inter_700Bold", fontSize: 18, textAlign: "center" },
  emptyMessage: { color: MUTED, fontFamily: "Inter_500Medium", fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 7, maxWidth: 280 },
  outlineButton: { borderWidth: 1, borderColor: CORAL, borderRadius: 4, paddingHorizontal: 14, paddingVertical: 10, marginTop: 18 },
  outlineButtonText: { color: CORAL, fontFamily: "Inter_700Bold", fontSize: 11 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(25,23,47,0.42)" },
  purchaseSheet: { alignItems: "center", backgroundColor: CANVAS, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 23, paddingTop: 24, paddingBottom: 30 },
  purchaseKicker: { color: CORAL, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1.45, marginTop: 15 },
  purchaseTitle: { color: INK, fontFamily: "Inter_700Bold", fontSize: 24, textAlign: "center", marginTop: 5, letterSpacing: -0.5 },
  purchaseArtist: { color: MUTED, fontFamily: "Inter_500Medium", fontSize: 12, marginTop: 4 },
  purchaseRule: { alignSelf: "stretch", height: 1, backgroundColor: "#E4D9CF", marginVertical: 19 },
  purchaseRow: { alignSelf: "stretch", flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  purchaseLabel: { color: "#645C55", fontFamily: "Inter_600SemiBold", fontSize: 12 },
  purchaseValue: { color: INK, fontFamily: "Inter_700Bold", fontSize: 13 },
  balanceRow: { alignSelf: "stretch", flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  insufficientValue: { color: CORAL },
  insufficientText: { alignSelf: "stretch", color: CORAL, fontFamily: "Inter_600SemiBold", fontSize: 11, marginBottom: 8 },
  purchaseButton: { height: 49, alignSelf: "stretch", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COBALT, borderRadius: 15, marginTop: 7 },
  purchaseButtonDisabled: { backgroundColor: "#B9B2AA" },
  purchaseButtonPressed: { backgroundColor: INK, transform: [{ scale: 0.985 }] },
  purchaseButtonText: { color: PAPER, fontFamily: "Inter_700Bold", fontSize: 13 },
  cancelButton: { padding: 14 },
  cancelText: { color: MUTED, fontFamily: "Inter_600SemiBold", fontSize: 12 },
  playerSheet: { flex: 1, alignItems: "center", backgroundColor: CANVAS, paddingHorizontal: 22, paddingTop: 10 },
  sheetHeader: { width: "100%", flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 30 },
  sheetEyebrow: { color: CORAL, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1.5 },
  playerTitle: { color: INK, fontFamily: "Inter_700Bold", fontSize: 24, marginTop: 24, textAlign: "center" },
  playerArtist: { color: MUTED, fontFamily: "Inter_500Medium", fontSize: 12, marginTop: 5, marginBottom: 24 },
  playerUnavailable: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: INK, borderRadius: 22, paddingVertical: 14, paddingHorizontal: 18 },
  playerUnavailableText: { color: "#D0CADC", fontFamily: "Inter_500Medium", fontSize: 11, textAlign: "center", flex: 1 },
  playerNote: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 21 },
  playerNoteText: { color: MUTED, fontFamily: "Inter_600SemiBold", fontSize: 10 },
  uploadSheet: { backgroundColor: CANVAS, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 21, paddingTop: 24, paddingBottom: 27 },
  uploadHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  fieldLabel: { color: INK, fontFamily: "Inter_700Bold", fontSize: 11, marginBottom: 7, marginTop: 10 },
  formInput: { height: 44, borderRadius: 13, borderWidth: 1, borderColor: "#E2D8CE", backgroundColor: PAPER, paddingHorizontal: 13, color: INK, fontFamily: "Inter_500Medium", fontSize: 13 },
  formGenreRail: { gap: 7, paddingBottom: 3 },
  formGenreChip: { borderWidth: 1, borderColor: "#E2D8CE", backgroundColor: PAPER, borderRadius: 13, paddingHorizontal: 11, paddingVertical: 8 },
  formGenreChipActive: { borderColor: INK, backgroundColor: INK },
  formGenreText: { color: MUTED, fontFamily: "Inter_600SemiBold", fontSize: 10 },
  formGenreTextActive: { color: PAPER },
  priceInput: { flexDirection: "row", alignItems: "center", height: 44, borderRadius: 13, borderWidth: 1, borderColor: "#E2D8CE", backgroundColor: PAPER, paddingHorizontal: 13 },
  priceTextInput: { flex: 1, color: INK, fontFamily: "Inter_700Bold", fontSize: 13, marginLeft: 7 },
  acoinSuffix: { color: MUTED, fontFamily: "Inter_600SemiBold", fontSize: 11 },
  filePicker: { flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1, borderStyle: "dashed", borderColor: "#D6C7B9", borderRadius: 15, backgroundColor: PAPER, padding: 13, marginTop: 17 },
  filePickerCopy: { flex: 1 },
  filePickerTitle: { color: INK, fontFamily: "Inter_700Bold", fontSize: 12 },
  filePickerSub: { color: MUTED, fontFamily: "Inter_500Medium", fontSize: 10, marginTop: 3 },
  publishButton: { height: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: CORAL, borderRadius: 15, marginTop: 17 },
});
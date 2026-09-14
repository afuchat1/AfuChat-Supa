import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AudioPlayer from "@/components/AudioPlayer";
import { showAlert } from "@/lib/alert";

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
  onPurchase?: (track: AfuMusicTrack) => Promise<void>;
  onCache?: (track: AfuMusicTrack) => Promise<void>;
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
};

type Props = AfuMusicCallbacks & {
  initialSection?: MusicSection;
};

const STORAGE_KEY = "afumusic:cached-track-ids";
const INK = "#19172F";
const CORAL = "#F06451";
const COBALT = "#1018D8";
const GOLD = "#D8A746";
const CANVAS = "#F7F1E9";
const PAPER = "#FFF9F1";
const MUTED = "#8D847B";

const SEED_TRACKS: AfuMusicTrack[] = [
  {
    id: "seed-quiet-morning",
    title: "Quiet Morning",
    artist: "Mara Sol",
    handle: "@marasol",
    genre: "Ambient",
    duration: "4:18",
    plays: 18200,
    price: 0,
    coverColor: "#252143",
    accentColor: "#F7BB75",
    isFeatured: true,
    createdAt: "Today",
  },
  {
    id: "seed-afterimage",
    title: "Afterimage",
    artist: "Kofi North",
    handle: "@kofinorth",
    genre: "Electronic",
    duration: "3:42",
    plays: 9400,
    price: 28,
    coverColor: "#E85949",
    accentColor: "#19172F",
    isFeatured: true,
    createdAt: "Yesterday",
  },
  {
    id: "seed-blue-hour",
    title: "Blue Hour, Side A",
    artist: "June Ayo",
    handle: "@juneayo",
    genre: "R&B",
    duration: "5:06",
    plays: 12100,
    price: 42,
    coverColor: "#25356D",
    accentColor: "#E9C35B",
    createdAt: "May 18",
  },
  {
    id: "seed-unfolding",
    title: "Unfolding",
    artist: "Nia Vale",
    handle: "@niavale",
    genre: "Acoustic",
    duration: "2:57",
    plays: 6300,
    price: 16,
    coverColor: "#E6B75E",
    accentColor: "#F06451",
    createdAt: "May 12",
  },
  {
    id: "seed-small-hours",
    title: "Small Hours",
    artist: "Owen Sunday",
    handle: "@owensunday",
    genre: "Lo-fi",
    duration: "3:31",
    plays: 4600,
    price: 24,
    coverColor: "#6D7B77",
    accentColor: "#F7E6C1",
    createdAt: "May 09",
  },
];

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
  return (
    <View
      style={[
        styles.trackArt,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: track.coverColor || INK,
        },
      ]}
    >
      <View
        style={[
          styles.artOrb,
          {
            backgroundColor: track.accentColor || CORAL,
            width: size * 0.56,
            height: size * 0.56,
            borderRadius: size,
            right: -size * 0.12,
            top: size * 0.1,
          },
        ]}
      />
      <View
        style={[
          styles.artLine,
          {
            backgroundColor: track.accentColor || CORAL,
            width: size * 0.7,
            left: size * 0.12,
            bottom: size * 0.18,
            transform: [{ rotate: "-22deg" }],
          },
        ]}
      />
      <Text style={[styles.artInitials, { fontSize: Math.max(11, size * 0.18) }]}>
        {initials(track.artist)}
      </Text>
    </View>
  );
}

function SkeletonRows() {
  return (
    <View style={styles.skeletonStack}>
      {[1, 2, 3].map((item) => (
        <View key={item} style={styles.skeletonRow}>
          <View style={styles.skeletonArt} />
          <View style={styles.skeletonCopy}>
            <View style={styles.skeletonLong} />
            <View style={styles.skeletonShort} />
          </View>
          <View style={styles.skeletonDot} />
        </View>
      ))}
    </View>
  );
}

function SectionPill({
  label,
  active,
  icon,
  onPress,
}: {
  label: string;
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.sectionPill,
        active && styles.sectionPillActive,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={15} color={active ? PAPER : INK} />
      <Text style={[styles.sectionPillLabel, active && styles.sectionPillLabelActive]}>{label}</Text>
    </Pressable>
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
}: {
  track: AfuMusicTrack;
  owned: boolean;
  cached: boolean;
  managed?: boolean;
  onOpen: () => void;
  onPlay: () => void;
  onCache: () => void;
  onDelete?: () => void;
}) {
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [styles.trackRow, pressed && styles.trackRowPressed]}>
      <TrackArt track={track} size={64} radius={16} />
      <View style={styles.trackCopy}>
        <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
        <Text style={styles.trackArtist} numberOfLines={1}>{track.artist} · {track.genre}</Text>
        <Text style={styles.trackMeta}>{formatPlays(track.plays)}{track.duration ? ` · ${track.duration}` : ""}</Text>
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
            style={({ pressed }) => [styles.miniPlay, pressed && styles.miniPlayPressed]}
          >
            <Ionicons name="play" size={13} color={PAPER} />
          </Pressable>
        ) : (
          <Text style={styles.priceText}>{track.price === 0 ? "Free" : `${track.price} AC`}</Text>
        )}
        {owned ? (
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
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}><Ionicons name={icon} size={25} color={CORAL} /></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {action ? (
        <Pressable onPress={action.onPress} style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}>
          <Text style={styles.outlineButtonText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function PlayerSheet({
  track,
  onClose,
}: {
  track: AfuMusicTrack;
  onClose: () => void;
}) {
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.playerSheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetEyebrow}>NOW LISTENING</Text>
          <Pressable onPress={onClose} hitSlop={10}><Ionicons name="close" size={23} color={INK} /></Pressable>
        </View>
        <TrackArt track={track} size={250} radius={34} />
        <Text style={styles.playerTitle}>{track.title}</Text>
        <Text style={styles.playerArtist}>{track.artist} · {track.genre}</Text>
        {track.audioUrl ? (
          <AudioPlayer
            uri={track.audioUrl}
            tintColor={PAPER}
            waveColor={CORAL}
            backgroundColor={INK}
          />
        ) : (
          <View style={styles.playerUnavailable}>
            <Ionicons name="musical-notes-outline" size={18} color={CORAL} />
            <Text style={styles.playerUnavailableText}>Audio preview is not available for this track yet.</Text>
          </View>
        )}
        <View style={styles.playerNote}>
          <Ionicons name="lock-closed-outline" size={15} color={COBALT} />
          <Text style={styles.playerNoteText}>Private listening inside AfuChat</Text>
        </View>
      </View>
    </Modal>
  );
}

export default function AfuMusicApp({
  initialSection = "discover",
  onBrowse,
  onSearch,
  onPurchase,
  onCache,
  onResolveAudio,
  onPlay,
  onUpload,
  onDeleteUpload,
  acoinBalance,
}: Props & { acoinBalance?: number }) {
  const insets = useSafeAreaInsets();
  const [section, setSection] = useState<MusicSection>(initialSection);
  const [tracks, setTracks] = useState<AfuMusicTrack[]>([]);
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("All");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [cachedIds, setCachedIds] = useState<string[]>([]);
  const [ownedIds, setOwnedIds] = useState<string[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<AfuMusicTrack | null>(null);
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
      const result = onBrowse ? await onBrowse() : SEED_TRACKS;
      setTracks(result);
      setOwnedIds(result.filter((track) => track.isOwned || track.price === 0).map((track) => track.id));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [onBrowse]);

  useEffect(() => {
    loadTracks();
    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (value) {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) setCachedIds(parsed);
      }
    }).catch(() => {});
  }, [loadTracks]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadTracks();
    setRefreshing(false);
  }, [loadTracks]);

  const filteredTracks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return tracks.filter((track) => {
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
  }, [cachedIds, genre, ownedIds, query, section, tracks]);

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
      setSelectedTrack({ ...track, audioUrl });
    } catch (error) {
      showAlert("Playback unavailable", error);
    }
  }, [onResolveAudio, ownedIds]);

  const playTrack = useCallback(async (track: AfuMusicTrack) => {
    try {
      await onPlay?.(track);
      const audioUrl = onResolveAudio ? await onResolveAudio(track) : track.audioUrl ?? null;
      setSelectedTrack({ ...track, audioUrl });
    } catch (error) {
      showAlert("Playback unavailable", error);
    }
  }, [onPlay, onResolveAudio]);

  const handleCache = useCallback(async (track: AfuMusicTrack) => {
    if (cachedIds.includes(track.id)) return;
    try {
      if (onCache) {
        await onCache(track);
      } else if (track.audioUrl && track.audioUrl.startsWith("http") && FileSystem.documentDirectory) {
        await FileSystem.downloadAsync(track.audioUrl, `${FileSystem.documentDirectory}afumusic-${track.id}.mp3`);
      }
      const next = [...cachedIds, track.id];
      setCachedIds(next);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      showAlert("Could not save offline", "Try again when you have a stronger connection.");
    }
  }, [cachedIds, onCache]);

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
    setPurchasing(true);
    try {
      if (onPurchase) await onPurchase(purchaseTrack);
      setOwnedIds((ids) => [...ids, purchaseTrack.id]);
      setTracks((current) => current.map((track) => (
        track.id === purchaseTrack.id ? { ...track, isOwned: true } : track
      )));
      setPurchaseTrack(null);
      if (onCache) {
        try {
          await onCache(purchaseTrack);
          setCachedIds((ids) => ids.includes(purchaseTrack.id) ? ids : [...ids, purchaseTrack.id]);
        } catch {
          showAlert("Unlocked, but not saved offline", "You can save this track from your library when you are back online.");
        }
      }
    } catch {
      showAlert("Purchase could not be completed", "Your ACoin balance was not changed. Try again.");
    } finally {
      setPurchasing(false);
    }
  }, [onPurchase, purchaseTrack]);

  const pickAudio = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "audio/*",
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (!result.canceled) setUploadFile(result.assets[0]);
  }, []);

  const submitUpload = useCallback(async () => {
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
      const result = onUpload ? await onUpload(payload) : {
        id: `local-${Date.now()}`,
        title: payload.title,
        artist: "You",
        handle: "@you",
        genre: payload.genre,
        price: payload.price,
        duration: "—",
        coverColor: INK,
        accentColor: CORAL,
        audioUrl: payload.fileUri,
        createdAt: "Just now",
      };
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
  }, [onUpload, uploadFile, uploadGenre, uploadPrice, uploadTitle]);

  const renderTrack = useCallback(({ item }: { item: AfuMusicTrack }) => (
    <TrackRow
      track={item}
      owned={ownedIds.includes(item.id) || item.isOwned || item.price === 0}
      cached={cachedIds.includes(item.id)}
      managed={section === "studio"}
      onOpen={() => { void openTrack(item); }}
      onPlay={() => { void playTrack(item); }}
      onCache={() => handleCache(item)}
      onDelete={() => handleDeleteUpload(item)}
    />
  ), [cachedIds, handleCache, handleDeleteUpload, openTrack, ownedIds, playTrack, section]);

  const sectionTitle = section === "discover" ? "Find your next repeat" :
    section === "library" ? "Your listening library" :
    section === "offline" ? "Ready without signal" : "Your studio";

  return (
    <View style={[styles.root, { backgroundColor: CANVAS, paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.wordmark}>Afu<Text style={styles.wordmarkAccent}>Music</Text></Text>
          <Text style={styles.privateLabel}>A PRIVATE LISTENING SPACE</Text>
        </View>
        <View style={styles.coinBadge}>
          <Ionicons name="flash" size={13} color={GOLD} />
          <Text style={styles.coinText}>
            {typeof acoinBalance === "number" ? `${Math.floor(acoinBalance)} AC` : "ACoin"}
          </Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={MUTED} />
        <TextInput
          value={query}
          onChangeText={handleSearch}
          placeholder="Search tracks, artists, sounds"
          placeholderTextColor={MUTED}
          style={styles.searchInput}
          returnKeyType="search"
          accessibilityLabel="Search AfuMusic"
        />
        {query ? <Pressable onPress={() => handleSearch("")} hitSlop={8}><Ionicons name="close-circle" size={18} color={MUTED} /></Pressable> : null}
      </View>

      <View style={styles.sectionRail}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectionRailContent}>
          <SectionPill label="Discover" icon="sparkles-outline" active={section === "discover"} onPress={() => setSection("discover")} />
          <SectionPill label="Library" icon="albums-outline" active={section === "library"} onPress={() => setSection("library")} />
          <SectionPill label="Offline" icon="arrow-down-circle-outline" active={section === "offline"} onPress={() => setSection("offline")} />
          <SectionPill label="Studio" icon="mic-outline" active={section === "studio"} onPress={() => setSection("studio")} />
        </ScrollView>
      </View>

      {section === "discover" && !query ? (
        <View style={styles.heroCard}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>AfuMusic / 001</Text>
            <Text style={styles.heroTitle}>Songs worth{`\n`}keeping close.</Text>
            <Text style={styles.heroBody}>Independent sounds, shared privately. Unlock a track once and keep it with you offline.</Text>
            <Pressable onPress={() => setSection("library")} style={({ pressed }) => [styles.heroButton, pressed && styles.heroButtonPressed]}>
              <Text style={styles.heroButtonText}>Open my library</Text>
              <Ionicons name="arrow-forward" size={16} color={INK} />
            </Pressable>
          </View>
          <View style={styles.heroDisc}>
            <View style={styles.discOuter}><View style={styles.discInner}><View style={styles.discLabel}><Ionicons name="musical-notes" size={22} color={CORAL} /></View></View></View>
            <View style={styles.discNeedle} />
          </View>
        </View>
      ) : null}

      <View style={styles.contentHeader}>
        <View>
          <Text style={styles.sectionEyebrow}>{section === "studio" ? "PUBLISH & MANAGE" : "YOUR NEXT LISTEN"}</Text>
          <Text style={styles.sectionTitle}>{sectionTitle}</Text>
        </View>
        {section === "studio" ? (
          <Pressable onPress={() => setUploadOpen(true)} style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}>
            <Ionicons name="add" size={19} color={PAPER} />
            <Text style={styles.addButtonText}>Publish</Text>
          </Pressable>
        ) : null}
      </View>

      {section === "discover" && !query ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.genreRail}>
          {GENRES.map((item) => (
            <Pressable key={item} onPress={() => setGenre(item)} style={[styles.genreChip, genre === item && styles.genreChipActive]}>
              <Text style={[styles.genreText, genre === item && styles.genreTextActive]}>{item}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {loading ? (
        <SkeletonRows />
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
        <FlatList
          data={filteredTracks}
          renderItem={renderTrack}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.trackList}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={CORAL} />}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={section === "discover" && !query ? <Text style={styles.listHint}>Fresh from independent creators</Text> : null}
        />
      )}

      {selectedTrack ? <PlayerSheet track={selectedTrack} onClose={() => setSelectedTrack(null)} /> : null}

      <Modal visible={!!purchaseTrack} animationType="slide" transparent onRequestClose={() => setPurchaseTrack(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.purchaseSheet}>
            <View style={styles.sheetHandle} />
            {purchaseTrack ? <TrackArt track={purchaseTrack} size={78} radius={20} /> : null}
            <Text style={styles.purchaseKicker}>UNLOCK THIS TRACK</Text>
            <Text style={styles.purchaseTitle}>{purchaseTrack?.title}</Text>
            <Text style={styles.purchaseArtist}>{purchaseTrack?.artist} · {purchaseTrack?.genre}</Text>
            <View style={styles.purchaseRule} />
            <View style={styles.purchaseRow}><Text style={styles.purchaseLabel}>One-time access</Text><Text style={styles.purchaseValue}>{purchaseTrack?.price} ACoin</Text></View>
            <View style={styles.purchaseRow}><Text style={styles.purchaseLabel}>Offline listening</Text><Ionicons name="checkmark-circle" size={19} color={COBALT} /></View>
            <Pressable onPress={confirmPurchase} disabled={purchasing} style={({ pressed }) => [styles.purchaseButton, pressed && styles.purchaseButtonPressed]}>
              {purchasing ? <ActivityIndicator color={PAPER} /> : <><Ionicons name="flash" size={16} color={PAPER} /><Text style={styles.purchaseButtonText}>Unlock for {purchaseTrack?.price} AC</Text></>}
            </Pressable>
            <Pressable onPress={() => setPurchaseTrack(null)} style={styles.cancelButton}><Text style={styles.cancelText}>Not now</Text></Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={uploadOpen} animationType="slide" transparent onRequestClose={() => setUploadOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalBackdrop}>
          <View style={styles.uploadSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.uploadHeader}><View><Text style={styles.purchaseKicker}>CREATOR STUDIO</Text><Text style={styles.purchaseTitle}>Publish a track</Text></View><Pressable onPress={() => setUploadOpen(false)} hitSlop={10}><Ionicons name="close" size={23} color={INK} /></Pressable></View>
            <Text style={styles.fieldLabel}>Track title</Text>
            <TextInput value={uploadTitle} onChangeText={setUploadTitle} placeholder="Give it a name" placeholderTextColor={MUTED} style={styles.formInput} />
            <Text style={styles.fieldLabel}>Genre</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.formGenreRail}>
              {GENRES.slice(1).map((item) => <Pressable key={item} onPress={() => setUploadGenre(item)} style={[styles.formGenreChip, uploadGenre === item && styles.formGenreChipActive]}><Text style={[styles.formGenreText, uploadGenre === item && styles.formGenreTextActive]}>{item}</Text></Pressable>)}
            </ScrollView>
            <Text style={styles.fieldLabel}>Unlock price</Text>
            <View style={styles.priceInput}><Ionicons name="flash" size={15} color={GOLD} /><TextInput value={uploadPrice} onChangeText={setUploadPrice} keyboardType="number-pad" style={styles.priceTextInput} /><Text style={styles.acoinSuffix}>ACoin</Text></View>
            <Pressable onPress={pickAudio} style={({ pressed }) => [styles.filePicker, pressed && styles.pressed]}>
              <Ionicons name={uploadFile ? "checkmark-circle" : "cloud-upload-outline"} size={22} color={uploadFile ? COBALT : CORAL} />
              <View style={styles.filePickerCopy}><Text style={styles.filePickerTitle}>{uploadFile ? uploadFile.name : "Choose an audio file"}</Text><Text style={styles.filePickerSub}>{uploadFile ? "Ready to publish" : "MP3, M4A, or WAV"}</Text></View>
              <Ionicons name="chevron-forward" size={17} color={MUTED} />
            </Pressable>
            <Pressable onPress={submitUpload} disabled={uploading} style={({ pressed }) => [styles.publishButton, pressed && styles.purchaseButtonPressed]}>{uploading ? <ActivityIndicator color={PAPER} /> : <><Ionicons name="arrow-up-circle-outline" size={18} color={PAPER} /><Text style={styles.purchaseButtonText}>Publish to AfuMusic</Text></>}</Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 15, paddingBottom: 14 },
  wordmark: { color: INK, fontFamily: "Inter_700Bold", fontSize: 29, letterSpacing: -1.3 },
  wordmarkAccent: { color: CORAL },
  privateLabel: { color: MUTED, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 1.4, marginTop: 3 },
  coinBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#F0E3C6", paddingHorizontal: 11, paddingVertical: 8, borderRadius: 16, marginTop: 2 },
  coinText: { color: INK, fontFamily: "Inter_700Bold", fontSize: 12 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 9, marginHorizontal: 20, height: 45, paddingHorizontal: 13, borderRadius: 14, backgroundColor: PAPER, borderWidth: 1, borderColor: "#E9DED2" },
  searchInput: { flex: 1, color: INK, fontFamily: "Inter_500Medium", fontSize: 13 },
  sectionRail: { marginTop: 15 },
  sectionRailContent: { paddingHorizontal: 20, gap: 8 },
  sectionPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 13, height: 35, borderRadius: 18, backgroundColor: "#EFE7DE" },
  sectionPillActive: { backgroundColor: INK },
  sectionPillLabel: { color: INK, fontFamily: "Inter_700Bold", fontSize: 11 },
  sectionPillLabelActive: { color: PAPER },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  heroCard: { overflow: "hidden", flexDirection: "row", minHeight: 205, marginHorizontal: 20, marginTop: 17, borderRadius: 25, backgroundColor: INK, padding: 19 },
  heroCopy: { flex: 1, zIndex: 2 },
  heroEyebrow: { color: "#AFA9C9", fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1.5, marginBottom: 10 },
  heroTitle: { color: PAPER, fontFamily: "Inter_700Bold", fontSize: 27, lineHeight: 29, letterSpacing: -0.8 },
  heroBody: { color: "#B8B2C4", fontFamily: "Inter_500Medium", fontSize: 11, lineHeight: 16, maxWidth: 205, marginTop: 10 },
  heroButton: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 8, backgroundColor: "#F4C469", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 13, marginTop: 14 },
  heroButtonPressed: { backgroundColor: CORAL },
  heroButtonText: { color: INK, fontFamily: "Inter_700Bold", fontSize: 11 },
  heroDisc: { width: 120, justifyContent: "center", alignItems: "center", marginRight: -5 },
  discOuter: { width: 126, height: 126, borderRadius: 70, backgroundColor: "#2C294B", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#514D70" },
  discInner: { width: 97, height: 97, borderRadius: 55, backgroundColor: "#211E3B", alignItems: "center", justifyContent: "center", borderWidth: 7, borderColor: "#373359" },
  discLabel: { width: 38, height: 38, borderRadius: 23, backgroundColor: "#F1BE68", alignItems: "center", justifyContent: "center" },
  discNeedle: { position: "absolute", width: 5, height: 62, backgroundColor: CORAL, right: 7, top: 23, borderRadius: 5, transform: [{ rotate: "31deg" }] },
  contentHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 20, marginTop: 22, marginBottom: 10 },
  sectionEyebrow: { color: CORAL, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1.25, marginBottom: 4 },
  sectionTitle: { color: INK, fontFamily: "Inter_700Bold", fontSize: 22, letterSpacing: -0.65 },
  addButton: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: CORAL, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12 },
  addButtonPressed: { backgroundColor: INK },
  addButtonText: { color: PAPER, fontFamily: "Inter_700Bold", fontSize: 11 },
  genreRail: { paddingHorizontal: 20, gap: 8, paddingBottom: 6 },
  genreChip: { borderWidth: 1, borderColor: "#E2D8CE", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: PAPER },
  genreChipActive: { borderColor: INK, backgroundColor: INK },
  genreText: { color: MUTED, fontFamily: "Inter_700Bold", fontSize: 10 },
  genreTextActive: { color: PAPER },
  listHint: { color: MUTED, fontFamily: "Inter_600SemiBold", fontSize: 11, marginBottom: 4 },
  trackList: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28 },
  trackRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 82, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#E8DED4" },
  trackRowPressed: { opacity: 0.7, transform: [{ translateX: 2 }] },
  trackArt: { overflow: "hidden", alignItems: "center", justifyContent: "center" },
  artOrb: { position: "absolute", opacity: 0.92 },
  artLine: { height: 3, position: "absolute", borderRadius: 4, opacity: 0.9 },
  artInitials: { color: PAPER, fontFamily: "Inter_700Bold", letterSpacing: 0.5, zIndex: 1 },
  trackCopy: { flex: 1, minWidth: 0, gap: 3 },
  trackTitle: { color: INK, fontFamily: "Inter_700Bold", fontSize: 14 },
  trackArtist: { color: "#645C55", fontFamily: "Inter_500Medium", fontSize: 11 },
  trackMeta: { color: MUTED, fontFamily: "Inter_500Medium", fontSize: 10 },
  rowActions: { flexDirection: "row", alignItems: "center", gap: 9 },
  miniPlay: { width: 27, height: 27, borderRadius: 14, backgroundColor: CORAL, alignItems: "center", justifyContent: "center" },
  miniPlayPressed: { backgroundColor: INK, transform: [{ scale: 0.9 }] },
  priceText: { color: CORAL, fontFamily: "Inter_700Bold", fontSize: 10 },
  skeletonStack: { paddingHorizontal: 20, paddingTop: 14, gap: 14 },
  skeletonRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  skeletonArt: { width: 64, height: 64, borderRadius: 16, backgroundColor: "#E9DED2" },
  skeletonCopy: { flex: 1, gap: 9 },
  skeletonLong: { height: 12, width: "58%", borderRadius: 6, backgroundColor: "#E9DED2" },
  skeletonShort: { height: 9, width: "37%", borderRadius: 5, backgroundColor: "#EDE3D9" },
  skeletonDot: { width: 25, height: 25, borderRadius: 13, backgroundColor: "#EDE3D9" },
  emptyState: { alignItems: "center", paddingHorizontal: 45, paddingTop: 55 },
  emptyIcon: { width: 55, height: 55, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "#F5D8D0", marginBottom: 15 },
  emptyTitle: { color: INK, fontFamily: "Inter_700Bold", fontSize: 18, textAlign: "center" },
  emptyMessage: { color: MUTED, fontFamily: "Inter_500Medium", fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 7, maxWidth: 280 },
  outlineButton: { borderWidth: 1, borderColor: CORAL, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 10, marginTop: 18 },
  outlineButtonText: { color: CORAL, fontFamily: "Inter_700Bold", fontSize: 11 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(25,23,47,0.42)" },
  purchaseSheet: { alignItems: "center", backgroundColor: CANVAS, borderTopLeftRadius: 29, borderTopRightRadius: 29, paddingHorizontal: 23, paddingTop: 10, paddingBottom: 30 },
  sheetHandle: { width: 38, height: 4, borderRadius: 3, backgroundColor: "#D4C7BC", marginBottom: 21 },
  purchaseKicker: { color: CORAL, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1.45, marginTop: 15 },
  purchaseTitle: { color: INK, fontFamily: "Inter_700Bold", fontSize: 24, textAlign: "center", marginTop: 5, letterSpacing: -0.5 },
  purchaseArtist: { color: MUTED, fontFamily: "Inter_500Medium", fontSize: 12, marginTop: 4 },
  purchaseRule: { alignSelf: "stretch", height: 1, backgroundColor: "#E4D9CF", marginVertical: 19 },
  purchaseRow: { alignSelf: "stretch", flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  purchaseLabel: { color: "#645C55", fontFamily: "Inter_600SemiBold", fontSize: 12 },
  purchaseValue: { color: INK, fontFamily: "Inter_700Bold", fontSize: 13 },
  purchaseButton: { height: 49, alignSelf: "stretch", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COBALT, borderRadius: 15, marginTop: 7 },
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
  uploadSheet: { backgroundColor: CANVAS, borderTopLeftRadius: 29, borderTopRightRadius: 29, paddingHorizontal: 21, paddingTop: 10, paddingBottom: 27 },
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
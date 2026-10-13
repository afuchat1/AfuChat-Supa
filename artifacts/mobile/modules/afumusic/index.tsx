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
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { showAlert } from "@/lib/alert";
import type { AfuMusicLedgerItem } from "@/lib/afuMusic";
import { useAfuMusicPlayer } from "./MusicPlayerContext";
import {
  loadMusicPlaylists,
  saveMusicPlaylists,
  type AfuMusicPlaylist,
} from "./playlistStore";
import { downloadMusicFile, getMusicDownloadFilename } from "./musicFileDownload";

type MusicSection = "discover" | "library" | "offline" | "playlists" | "studio" | "purchases" | "earnings";

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
  videoUseAllowed?: boolean;
  createdAt?: string;
};

export type AfuMusicCallbacks = {
  onBrowse?: () => Promise<AfuMusicTrack[]>;
  onSearch?: (query: string) => Promise<AfuMusicTrack[]>;
  onPurchase?: (track: AfuMusicTrack) => Promise<void>;
  onCache?: (track: AfuMusicTrack) => Promise<void>;
  onRemoveCache?: (track: AfuMusicTrack) => Promise<void>;
  onListOffline?: () => Promise<AfuMusicTrack[]>;
  onListPurchases?: () => Promise<AfuMusicLedgerItem[]>;
  onListEarnings?: () => Promise<AfuMusicLedgerItem[]>;
  onResolveAudio?: (track: AfuMusicTrack) => Promise<string | null>;
  onResolveDownload?: (track: AfuMusicTrack, filename: string) => Promise<string | null>;
  onPlay?: (track: AfuMusicTrack) => void | Promise<void>;
  onUpload?: (input: {
    title: string;
    genre: string;
    price: number;
    fileUri: string;
    fileName: string;
    mimeType?: string;
    fileSize?: number;
    videoUseAllowed?: boolean;
  }) => Promise<AfuMusicTrack | void>;
  onDeleteUpload?: (track: AfuMusicTrack) => Promise<void>;
  onOpenWallet?: () => void;
  onUpgradePremium?: () => void;
};

type Props = AfuMusicCallbacks & {
  initialSection?: MusicSection;
  playlistOwnerId?: string;
  canPublishPaid?: boolean;
};

const INK = "#19172F";
const CORAL = "#F06451";
const COBALT = "#1018D8";
const GOLD = "#D8A746";
const CANVAS = "#F7F1E9";
const PAPER = "#FFF9F1";
const MUTED = "#8D847B";

const GENRES = ["All", "Ambient", "Electronic", "R&B", "Acoustic", "Lo-fi"];

function formatPlays(value?: number) {
  if (!value) return "New";
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k plays`;
  return `${value} plays`;
}

function TrackArt({
  size = 72,
  radius = 18,
}: {
  track?: AfuMusicTrack;
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
          backgroundColor: "#E8DED2",
        },
      ]}
    >
      <Ionicons name="musical-notes" size={Math.max(18, size * 0.34)} color={INK} />
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
  webDownload,
  downloading,
  managed = false,
  onOpen,
  onPlay,
  onCache,
  onDownload,
  onPlayNext,
  onAddToPlaylist,
  onDelete,
}: {
  track: AfuMusicTrack;
  owned: boolean;
  cached: boolean;
  webDownload?: boolean;
  downloading?: boolean;
  managed?: boolean;
  onOpen: () => void;
  onPlay: () => void;
  onCache: () => void;
  onDownload?: () => void;
  onPlayNext?: () => void;
  onAddToPlaylist?: () => void;
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
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              if (webDownload) onDownload?.();
              else onCache();
            }}
            hitSlop={8}
            accessibilityLabel={webDownload ? `Download ${track.title}` : cached ? "Available offline" : "Save offline"}
          >
            {downloading ? (
              <ActivityIndicator size="small" color={CORAL} />
            ) : (
              <Ionicons
                name={webDownload ? "download-outline" : cached ? "arrow-down-circle" : "arrow-down-circle-outline"}
                size={21}
                color={cached && !webDownload ? COBALT : MUTED}
              />
            )}
          </Pressable>
        ) : null}
        {owned && !managed ? (
          <>
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                onPlayNext?.();
              }}
              hitSlop={8}
              accessibilityLabel={`Play ${track.title} next`}
            >
              <Ionicons name="play-skip-forward-outline" size={19} color={MUTED} />
            </Pressable>
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                onAddToPlaylist?.();
              }}
              hitSlop={8}
              accessibilityLabel={`Add ${track.title} to a playlist`}
            >
              <Ionicons name="add-circle-outline" size={20} color={MUTED} />
            </Pressable>
          </>
        ) : null}
        <Ionicons name="chevron-forward" size={17} color="#B2A79B" />
      </View>
    </Pressable>
  );
}

function PlaylistRow({
  playlist,
  onPlay,
  onDelete,
}: {
  playlist: AfuMusicPlaylist;
  onPlay: () => void;
  onDelete: () => void;
}) {
  const cover = playlist.tracks[0];
  return (
    <View style={styles.playlistCard}>
      <Pressable onPress={onPlay} style={({ pressed }) => [styles.playlistMain, pressed && styles.pressed]}>
        <TrackArt track={cover} size={58} radius={15} />
        <View style={styles.playlistCopy}>
          <Text style={styles.playlistTitle} numberOfLines={1}>{playlist.name}</Text>
          <Text style={styles.playlistMeta}>{playlist.tracks.length} {playlist.tracks.length === 1 ? "track" : "tracks"}</Text>
        </View>
      </Pressable>
      <Pressable onPress={onPlay} hitSlop={8} accessibilityLabel={`Play ${playlist.name}`}>
        <Ionicons name="play-circle" size={28} color={CORAL} />
      </Pressable>
      <Pressable onPress={onDelete} hitSlop={8} accessibilityLabel={`Delete ${playlist.name}`}>
        <Ionicons name="trash-outline" size={19} color={MUTED} />
      </Pressable>
    </View>
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

export default function AfuMusicApp({
  initialSection = "discover",
  onBrowse,
  onSearch,
  onPurchase,
  onCache,
  onRemoveCache,
  onListOffline,
  onListPurchases,
  onListEarnings,
  onResolveAudio,
  onResolveDownload,
  onPlay,
  onUpload,
  onDeleteUpload,
  onOpenWallet,
  onUpgradePremium,
  playlistOwnerId,
  canPublishPaid = false,
  acoinBalance,
}: Props & { acoinBalance?: number }) {
  const insets = useSafeAreaInsets();
  const {
    track: selectedTrack,
    queue: playQueue,
    queueTitle,
    play: playGlobally,
    setQueue,
  } = useAfuMusicPlayer();
  const [section, setSection] = useState<MusicSection>(initialSection);
  const [tracks, setTracks] = useState<AfuMusicTrack[]>([]);
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("All");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [cachedIds, setCachedIds] = useState<string[]>([]);
  const [offlineTracks, setOfflineTracks] = useState<AfuMusicTrack[]>([]);
  const [ownedIds, setOwnedIds] = useState<string[]>([]);
  const [downloadingIds, setDownloadingIds] = useState<string[]>([]);
  const [savingIds, setSavingIds] = useState<string[]>([]);
  const [playlists, setPlaylists] = useState<AfuMusicPlaylist[]>([]);
  const [loadedPlaylistOwner, setLoadedPlaylistOwner] = useState<string | null>(null);
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false);
  const [playlistModalTrack, setPlaylistModalTrack] = useState<AfuMusicTrack | null>(null);
  const [playlistDraft, setPlaylistDraft] = useState("");
  const [purchaseTrack, setPurchaseTrack] = useState<AfuMusicTrack | null>(null);
  const [ledgerRows, setLedgerRows] = useState<AfuMusicLedgerItem[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadGenre, setUploadGenre] = useState("Ambient");
  const [uploadPrice, setUploadPrice] = useState("5");
  const [uploadIsPaid, setUploadIsPaid] = useState(false);
  const [uploadVideoUseAllowed, setUploadVideoUseAllowed] = useState(false);
  const [uploadFile, setUploadFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);

  const loadLedger = useCallback(async () => {
    if (section !== "purchases" && section !== "earnings") return;
    const load = section === "purchases" ? onListPurchases : onListEarnings;
    if (!load) {
      setLedgerRows([]);
      setLedgerError(true);
      return;
    }
    setLedgerLoading(true);
    setLedgerError(false);
    try {
      setLedgerRows(await load());
    } catch {
      setLedgerRows([]);
      setLedgerError(true);
    } finally {
      setLedgerLoading(false);
    }
  }, [onListEarnings, onListPurchases, section]);

  useEffect(() => {
    if (section === "purchases" || section === "earnings") void loadLedger();
  }, [loadLedger, section]);

  const loadTracks = useCallback(async () => {
    setLoadError(false);
    setLoading(true);
    try {
      if (!onBrowse) throw new Error("AfuMusic catalog is unavailable.");
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

  useEffect(() => {
    let active = true;
    setPlaylists([]);
    setLoadedPlaylistOwner(null);
    if (!playlistOwnerId) return () => { active = false; };
    void loadMusicPlaylists(playlistOwnerId)
      .then((result) => {
        if (!active) return;
        setPlaylists(result);
        setLoadedPlaylistOwner(playlistOwnerId);
      })
      .catch(() => {
        if (!active) return;
        setLoadedPlaylistOwner(playlistOwnerId);
        showAlert("Playlists unavailable", "Your saved playlists could not be loaded.");
      });
    return () => { active = false; };
  }, [playlistOwnerId]);

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

  const persistPlaylists = useCallback(async (next: AfuMusicPlaylist[]) => {
    if (playlistOwnerId && loadedPlaylistOwner !== playlistOwnerId) {
      throw new Error("Playlists are still loading. Try again in a moment.");
    }
    if (playlistOwnerId) await saveMusicPlaylists(playlistOwnerId, next);
    setPlaylists(next);
  }, [loadedPlaylistOwner, playlistOwnerId]);

  const openPlaylistModal = useCallback((track: AfuMusicTrack | null = null) => {
    setPlaylistModalTrack(track);
    setPlaylistDraft("");
    setPlaylistModalOpen(true);
  }, []);

  const createPlaylist = useCallback(async () => {
    const name = playlistDraft.trim();
    if (!name) {
      showAlert("Name your playlist", "Enter a name before creating the playlist.");
      return;
    }
    if (playlists.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      showAlert("Playlist already exists", "Choose a different name for this playlist.");
      return;
    }
    const now = new Date().toISOString();
    const playlist: AfuMusicPlaylist = {
      id: `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      tracks: playlistModalTrack ? [playlistModalTrack] : [],
      updatedAt: now,
    };
    try {
      await persistPlaylists([...playlists, playlist]);
      setPlaylistModalOpen(false);
      setPlaylistDraft("");
      setPlaylistModalTrack(null);
    } catch (error) {
      showAlert("Playlist could not be saved", error);
    }
  }, [persistPlaylists, playlistDraft, playlistModalTrack, playlists]);

  const addTrackToPlaylist = useCallback(async (playlistId: string) => {
    if (!playlistModalTrack) return;
    const updated = playlists.map((playlist) => (
      playlist.id !== playlistId || playlist.tracks.some((item) => item.id === playlistModalTrack.id)
        ? playlist
        : { ...playlist, tracks: [...playlist.tracks, playlistModalTrack], updatedAt: new Date().toISOString() }
    ));
    try {
      await persistPlaylists(updated);
      setPlaylistModalOpen(false);
      setPlaylistModalTrack(null);
      setPlaylistDraft("");
    } catch (error) {
      showAlert("Track could not be added", error);
    }
  }, [persistPlaylists, playlistModalTrack, playlists]);

  const deletePlaylist = useCallback((playlist: AfuMusicPlaylist) => {
    showAlert("Delete this playlist?", `"${playlist.name}" and its saved track list will be removed.`, [
      { text: "Keep playlist", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await persistPlaylists(playlists.filter((item) => item.id !== playlist.id));
          } catch (error) {
            showAlert("Playlist could not be deleted", error);
          }
        },
      },
    ]);
  }, [persistPlaylists, playlists]);

  const queueForTrack = useCallback((track: AfuMusicTrack) => {
    const available = filteredTracks.filter((item) =>
      ownedIds.includes(item.id) || item.isOwned || item.price === 0
    );
    return available.some((item) => item.id === track.id) ? available : [track, ...available];
  }, [filteredTracks, ownedIds]);

  const activateTrack = useCallback(async (
    track: AfuMusicTrack,
    queue: AfuMusicTrack[],
    title: string,
    notifyPlay: boolean,
  ) => {
    const uniqueQueue = queue.filter((item, index) => queue.findIndex((other) => other.id === item.id) === index);
    try {
      if (notifyPlay) await onPlay?.(track);
      await playGlobally(track, uniqueQueue, title, { showPlayer: true });
    } catch (error) {
      showAlert("Playback unavailable", error);
    }
  }, [onPlay, playGlobally]);

  const selectQueuedTrack = useCallback(async (track: AfuMusicTrack) => {
    try {
      await onPlay?.(track);
      await playGlobally(track, playQueue, queueTitle, { showPlayer: true });
    } catch (error) {
      showAlert("Playback unavailable", error);
    }
  }, [onPlay, playGlobally, playQueue, queueTitle]);

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
    await activateTrack(track, queueForTrack(track), section === "library" ? "My library" : section === "offline" ? "Offline" : "Discover", false);
  }, [activateTrack, ownedIds, queueForTrack, section]);

  const playTrack = useCallback(async (track: AfuMusicTrack) => {
    await activateTrack(track, queueForTrack(track), section === "library" ? "My library" : section === "offline" ? "Offline" : "Discover", true);
  }, [activateTrack, queueForTrack, section]);

  const handlePlayNext = useCallback((track: AfuMusicTrack) => {
    if (!selectedTrack) {
      void playTrack(track);
      return;
    }
    setQueue((current) => {
      const next = current.length ? current.filter((item) => item.id !== track.id) : [selectedTrack];
      const currentIndex = next.findIndex((item) => item.id === selectedTrack.id);
      next.splice(currentIndex < 0 ? next.length : currentIndex + 1, 0, track);
      return next;
    });
  }, [playTrack, selectedTrack, setQueue]);

  const startPlaylist = useCallback((playlist: AfuMusicPlaylist) => {
    if (!playlist.tracks.length) {
      showAlert("This playlist is empty", "Add tracks from your library to start listening.");
      return;
    }
    void activateTrack(playlist.tracks[0], playlist.tracks, playlist.name, true);
  }, [activateTrack]);

  const handleCache = useCallback(async (track: AfuMusicTrack) => {
    setSavingIds((ids) => ids.includes(track.id) ? ids : [...ids, track.id]);
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
    } finally {
      setSavingIds((ids) => ids.filter((id) => id !== track.id));
    }
  }, [cachedIds, onCache, onRemoveCache]);

  const handleWebDownload = useCallback(async (track: AfuMusicTrack) => {
    setDownloadingIds((ids) => ids.includes(track.id) ? ids : [...ids, track.id]);
    try {
      const filename = getMusicDownloadFilename(track);
      const uri = onResolveDownload
        ? await onResolveDownload(track, filename)
        : onResolveAudio ? await onResolveAudio(track) : track.audioUrl ?? null;
      if (!uri) throw new Error("The audio file is not available for this track.");
      await downloadMusicFile(track, uri, filename);
    } catch (error) {
      showAlert("Download failed", error);
    } finally {
      setDownloadingIds((ids) => ids.filter((id) => id !== track.id));
    }
  }, [onResolveAudio, onResolveDownload]);

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
      if (!onPurchase) throw new Error("Music purchases are unavailable right now.");
      await onPurchase(purchaseTrack);
      setOwnedIds((ids) => [...ids, purchaseTrack.id]);
      setTracks((current) => current.map((track) => (
        track.id === purchaseTrack.id ? { ...track, isOwned: true } : track
      )));
      setPurchaseTrack(null);
    } catch {
      showAlert("Purchase could not be completed", "Your ACoin balance was not changed. Try again.");
    } finally {
      setPurchasing(false);
    }
  }, [acoinBalance, onOpenWallet, onPurchase, purchaseTrack]);

  const pickAudio = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "audio/*",
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (!result.canceled) {
      const file = result.assets[0];
      setUploadFile(file);
      if (!uploadTitle.trim()) {
        setUploadTitle(file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim());
      }
    }
  }, [uploadTitle]);

  const showPremiumRequired = useCallback(() => {
    showAlert(
      "Premium required",
      "Paid music publishing requires AfuChat Premium. Upgrade your subscription to publish music for sale.",
      [
        { text: "Not now", style: "cancel" },
        {
          text: "Upgrade to Premium",
          onPress: () => {
            setUploadOpen(false);
            onUpgradePremium?.();
          },
        },
      ],
    );
  }, [onUpgradePremium]);

  const submitUpload = useCallback(async () => {
    if (!uploadTitle.trim() || !uploadFile) {
      showAlert("Add a title and audio", "Choose the track you want to publish before continuing.");
      return;
    }
    const price = uploadIsPaid ? Number(uploadPrice) : 0;
    if (uploadIsPaid && !canPublishPaid) {
      showPremiumRequired();
      return;
    }
    if (uploadIsPaid && (!Number.isInteger(price) || price < 5 || price > 1000)) {
      showAlert("Check the track price", "Paid music must cost between 5 and 1,000 ACoin.");
      return;
    }
    if (!onUpload) {
      showAlert("Publishing unavailable", "AfuMusic publishing is unavailable right now. Try again later.");
      return;
    }
    setUploading(true);
    try {
      const payload = {
        title: uploadTitle.trim(),
        genre: uploadGenre,
        price,
        fileUri: uploadFile.uri,
        fileName: uploadFile.name,
        mimeType: uploadFile.mimeType,
        fileSize: uploadFile.size,
        videoUseAllowed: uploadVideoUseAllowed,
      };
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
      setUploadIsPaid(false);
      setUploadVideoUseAllowed(false);
      showAlert("Published to AfuMusic", "Your track is ready for listeners.");
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String((error as { message?: unknown } | null)?.message ?? "");
      if (errorMessage.includes("music_paid_publishing_requires_premium")) {
        showPremiumRequired();
        return;
      }
      showAlert("Upload failed", "Your track was not published. Try again.");
    } finally {
      setUploading(false);
    }
  }, [canPublishPaid, onUpload, showPremiumRequired, uploadFile, uploadGenre, uploadIsPaid, uploadPrice, uploadTitle, uploadVideoUseAllowed]);

  const renderTrack = useCallback(({ item }: { item: AfuMusicTrack }) => (
    <TrackRow
      track={item}
      owned={ownedIds.includes(item.id) || item.isOwned || item.price === 0}
      cached={cachedIds.includes(item.id)}
      webDownload={Platform.OS === "web"}
      downloading={Platform.OS === "web" ? downloadingIds.includes(item.id) : savingIds.includes(item.id)}
      managed={section === "studio"}
      onOpen={() => { void openTrack(item); }}
      onPlay={() => { void playTrack(item); }}
      onCache={() => { void handleCache(item); }}
      onDownload={() => { void handleWebDownload(item); }}
      onPlayNext={() => handlePlayNext(item)}
      onAddToPlaylist={() => openPlaylistModal(item)}
      onDelete={() => handleDeleteUpload(item)}
    />
  ), [cachedIds, downloadingIds, handleCache, handleDeleteUpload, handlePlayNext, handleWebDownload, openPlaylistModal, openTrack, ownedIds, playTrack, savingIds, section]);

  const sectionTitle = section === "discover" ? "Find your next repeat" :
    section === "library" ? "Your listening library" :
    section === "offline" ? "Ready without signal" :
    section === "playlists" ? "Your playlists" :
    section === "purchases" ? "Your purchase history" :
    section === "earnings" ? "Your creator earnings" : "Your studio";

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
          <SectionPill label="Playlists" icon="list-outline" active={section === "playlists"} onPress={() => setSection("playlists")} />
          <SectionPill label="Studio" icon="mic-outline" active={section === "studio"} onPress={() => setSection("studio")} />
          <SectionPill label="Purchases" icon="receipt-outline" active={section === "purchases"} onPress={() => setSection("purchases")} />
          <SectionPill label="Earnings" icon="cash-outline" active={section === "earnings"} onPress={() => setSection("earnings")} />
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

      {section === "discover" && !query && featuredTracks.length > 0 ? (
        <View style={styles.featuredBlock}>
          <View style={styles.featuredHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>EDITOR'S PICKS</Text>
              <Text style={styles.featuredTitle}>Featured this week</Text>
            </View>
            <Ionicons name="headset-outline" size={19} color={CORAL} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredRail}>
            {featuredTracks.map((track) => (
              <Pressable key={track.id} onPress={() => { void openTrack(track); }} style={({ pressed }) => [styles.featuredCard, pressed && styles.pressed]}>
                <TrackArt track={track} size={78} radius={18} />
                <Text style={styles.featuredCardTitle} numberOfLines={1}>{track.title}</Text>
                <Text style={styles.featuredCardArtist} numberOfLines={1}>{track.artist}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.contentHeader}>
        <View>
          <Text style={styles.sectionEyebrow}>
            {section === "studio" ? "PUBLISH & MANAGE" : section === "playlists" ? "YOUR COLLECTIONS" : section === "purchases" ? "LISTENING RECEIPTS" : section === "earnings" ? "TRACK SALES" : "YOUR NEXT LISTEN"}
          </Text>
          <Text style={styles.sectionTitle}>{sectionTitle}</Text>
        </View>
        {section === "studio" ? (
          <Pressable onPress={() => setUploadOpen(true)} style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}>
            <Ionicons name="add" size={19} color={PAPER} />
            <Text style={styles.addButtonText}>Publish</Text>
          </Pressable>
        ) : section === "playlists" ? (
          <Pressable onPress={() => openPlaylistModal()} style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}>
            <Ionicons name="add" size={19} color={PAPER} />
            <Text style={styles.addButtonText}>New playlist</Text>
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

      {section === "purchases" || section === "earnings" ? (
        ledgerLoading ? (
          <SkeletonRows />
        ) : ledgerError ? (
          <EmptyState icon="cloud-offline-outline" title="Ledger unavailable" message="We couldn't load your AfuMusic transactions." action={{ label: "Try again", onPress: () => { void loadLedger(); } }} />
        ) : ledgerRows.length === 0 ? (
          <EmptyState
            icon={section === "purchases" ? "receipt-outline" : "cash-outline"}
            title={section === "purchases" ? "No purchases yet" : "No track earnings yet"}
            message={section === "purchases" ? "Tracks you unlock will appear here." : "Your paid track sales will appear here as they happen."}
          />
        ) : (
          <ScrollView contentContainerStyle={styles.ledgerList} showsVerticalScrollIndicator={false}>
            {ledgerRows.map((row) => (
              <View key={row.id} style={styles.ledgerRow}>
                <View style={styles.ledgerIcon}><Ionicons name={section === "purchases" ? "musical-notes" : "cash-outline"} size={18} color={CORAL} /></View>
                <View style={styles.ledgerCopy}>
                  <Text style={styles.ledgerTitle} numberOfLines={1}>{row.title}</Text>
                  <Text style={styles.ledgerMeta} numberOfLines={1}>
                    {section === "purchases" ? `Creator: ${row.counterpartyName}` : `Buyer: ${row.counterpartyName}`} · {new Date(row.happenedAt).toLocaleDateString()}
                  </Text>
                </View>
                <Text style={styles.ledgerAmount}>{section === "purchases" ? "−" : "+"}{row.amount} AC</Text>
              </View>
            ))}
          </ScrollView>
        )
      ) : section === "playlists" ? (
        playlistOwnerId && loadedPlaylistOwner !== playlistOwnerId ? (
          <SkeletonRows />
        ) : playlists.length === 0 ? (
          <EmptyState
            icon="list-outline"
            title="Your playlists start here"
            message="Create a playlist, then add tracks from Discover or your Library."
            action={{ label: "Create a playlist", onPress: () => openPlaylistModal() }}
          />
        ) : (
          <ScrollView contentContainerStyle={styles.playlistList} showsVerticalScrollIndicator={false}>
            {playlists.map((playlist) => (
              <PlaylistRow
                key={playlist.id}
                playlist={playlist}
                onPlay={() => startPlaylist(playlist)}
                onDelete={() => deletePlaylist(playlist)}
              />
            ))}
          </ScrollView>
        )
      ) : loading ? (
        <SkeletonRows />
      ) : loadError ? (
        <EmptyState icon="cloud-offline-outline" title="The signal slipped" message="We couldn't load your listening space." action={{ label: "Try again", onPress: loadTracks }} />
      ) : filteredTracks.length === 0 ? (
        <EmptyState
          icon={section === "offline" ? "cloud-download-outline" : section === "studio" ? "mic-outline" : "albums-outline"}
          title={section === "offline" ? "Nothing saved offline" : section === "library" ? "Your library is waiting" : section === "studio" ? "No published tracks" : "No tracks found"}
          message={section === "offline" ? "Save purchased tracks here for flights, commutes, and quiet corners." : section === "library" ? "Unlock a track to make it part of your private collection." : section === "studio" ? "Try another search or publish your first track." : "Try another search."}
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
            {typeof acoinBalance === "number" ? (
              <View style={styles.balanceRow}>
                <Text style={styles.purchaseLabel}>Your balance</Text>
                <Text style={[styles.purchaseValue, acoinBalance < (purchaseTrack?.price ?? 0) && styles.insufficientValue]}>{Math.floor(acoinBalance)} ACoin</Text>
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
            <Pressable onPress={() => setPurchaseTrack(null)} style={styles.cancelButton}><Text style={styles.cancelText}>Not now</Text></Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={playlistModalOpen} animationType="slide" transparent onRequestClose={() => setPlaylistModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.playlistSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.playlistModalHeader}>
              <View>
                <Text style={styles.purchaseKicker}>{playlistModalTrack ? "SAVE THIS TRACK" : "YOUR MUSIC"}</Text>
                <Text style={styles.playlistModalTitle}>{playlistModalTrack ? "Add to playlist" : "New playlist"}</Text>
              </View>
              <Pressable onPress={() => setPlaylistModalOpen(false)} hitSlop={10} accessibilityLabel="Close playlist dialog">
                <Ionicons name="close" size={23} color={INK} />
              </Pressable>
            </View>
            {playlistModalTrack ? (
              <View style={styles.playlistTrackPreview}>
                <TrackArt track={playlistModalTrack} size={44} radius={12} />
                <View style={styles.playlistCopy}>
                  <Text style={styles.playlistTitle} numberOfLines={1}>{playlistModalTrack.title}</Text>
                  <Text style={styles.playlistMeta} numberOfLines={1}>{playlistModalTrack.artist}</Text>
                </View>
              </View>
            ) : null}
            <TextInput
              value={playlistDraft}
              onChangeText={setPlaylistDraft}
              placeholder="Playlist name"
              placeholderTextColor={MUTED}
              style={styles.formInput}
              maxLength={48}
              returnKeyType="done"
              accessibilityLabel="Playlist name"
            />
            <Pressable onPress={() => { void createPlaylist(); }} style={({ pressed }) => [styles.playlistCreateButton, pressed && styles.purchaseButtonPressed]}>
              <Ionicons name="add-circle-outline" size={18} color={PAPER} />
              <Text style={styles.purchaseButtonText}>{playlistModalTrack ? "Create playlist with track" : "Create playlist"}</Text>
            </Pressable>
            {playlistModalTrack && playlists.length > 0 ? (
              <>
                <Text style={styles.playlistListLabel}>OR ADD TO AN EXISTING PLAYLIST</Text>
                <ScrollView style={styles.playlistChoices} keyboardShouldPersistTaps="handled">
                  {playlists.map((playlist) => (
                    <Pressable
                      key={playlist.id}
                      onPress={() => { void addTrackToPlaylist(playlist.id); }}
                      style={({ pressed }) => [styles.playlistChoice, pressed && styles.pressed]}
                    >
                      <Ionicons name="musical-notes-outline" size={18} color={CORAL} />
                      <View style={styles.playlistCopy}>
                        <Text style={styles.playlistTitle} numberOfLines={1}>{playlist.name}</Text>
                        <Text style={styles.playlistMeta}>{playlist.tracks.length} {playlist.tracks.length === 1 ? "track" : "tracks"}</Text>
                      </View>
                      <Ionicons name={playlist.tracks.some((item) => item.id === playlistModalTrack.id) ? "checkmark-circle" : "add-circle-outline"} size={20} color={playlist.tracks.some((item) => item.id === playlistModalTrack.id) ? COBALT : MUTED} />
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : null}
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
            <Text style={styles.fieldLabel}>Publishing option</Text>
            <View style={styles.publishModes}>
              <Pressable onPress={() => setUploadIsPaid(false)} style={[styles.publishMode, !uploadIsPaid && styles.publishModeActive]}>
                <Ionicons name="gift-outline" size={16} color={!uploadIsPaid ? PAPER : MUTED} />
                <Text style={[styles.publishModeText, !uploadIsPaid && styles.publishModeTextActive]}>Free</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (!canPublishPaid) {
                    showPremiumRequired();
                    return;
                  }
                  setUploadIsPaid(true);
                }}
                style={[styles.publishMode, uploadIsPaid && styles.publishModeActive]}
              >
                <Ionicons name="flash-outline" size={16} color={uploadIsPaid ? PAPER : MUTED} />
                <Text style={[styles.publishModeText, uploadIsPaid && styles.publishModeTextActive]}>Paid</Text>
                {!canPublishPaid ? <Ionicons name="lock-closed" size={12} color={MUTED} /> : null}
              </Pressable>
            </View>
            {uploadIsPaid ? (
              <>
                <Text style={styles.fieldLabel}>Price (5–1,000 ACoin)</Text>
                <View style={styles.priceInput}><Ionicons name="flash" size={15} color={GOLD} /><TextInput value={uploadPrice} onChangeText={setUploadPrice} keyboardType="number-pad" style={styles.priceTextInput} /><Text style={styles.acoinSuffix}>ACoin</Text></View>
              </>
            ) : (
              <Text style={styles.freePublishingNote}>Listeners can play this track without purchasing it.</Text>
            )}
            <Pressable
              onPress={() => setUploadVideoUseAllowed((allowed) => !allowed)}
              style={styles.videoUseToggle}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: uploadVideoUseAllowed }}
            >
              <Ionicons name={uploadVideoUseAllowed ? "checkbox" : "square-outline"} size={19} color={uploadVideoUseAllowed ? COBALT : MUTED} />
              <View style={styles.videoUseCopy}>
                <Text style={styles.videoUseTitle}>Allow use in AfuChat videos</Text>
                <Text style={styles.videoUseNote}>Only tracks with this permission can be added to Shots.</Text>
              </View>
            </Pressable>
            <Pressable onPress={pickAudio} style={({ pressed }) => [styles.filePicker, pressed && styles.pressed]}>
              <Ionicons name={uploadFile ? "checkmark-circle" : "cloud-upload-outline"} size={22} color={uploadFile ? COBALT : CORAL} />
              <View style={styles.filePickerCopy}><Text style={styles.filePickerTitle}>{uploadFile ? uploadFile.name : "Choose an audio file"}</Text><Text style={styles.filePickerSub}>{uploadFile ? "Ready to publish" : "MP3, M4A, WAV, OGG, or AAC"}</Text></View>
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
  featuredBlock: { marginTop: 20 },
  featuredHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingHorizontal: 20, marginBottom: 10 },
  featuredTitle: { color: INK, fontFamily: "Inter_700Bold", fontSize: 18, letterSpacing: -0.4, marginTop: 3 },
  featuredRail: { paddingHorizontal: 20, gap: 12 },
  featuredCard: { width: 112, paddingBottom: 5 },
  featuredCardTitle: { color: INK, fontFamily: "Inter_700Bold", fontSize: 11, marginTop: 8 },
  featuredCardArtist: { color: MUTED, fontFamily: "Inter_500Medium", fontSize: 10, marginTop: 3 },
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
  trackCopy: { flex: 1, minWidth: 0, gap: 3 },
  trackTitle: { color: INK, fontFamily: "Inter_700Bold", fontSize: 14 },
  trackArtist: { color: "#645C55", fontFamily: "Inter_500Medium", fontSize: 11 },
  trackMeta: { color: MUTED, fontFamily: "Inter_500Medium", fontSize: 10 },
  rowActions: { flexDirection: "row", alignItems: "center", gap: 6 },
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
  balanceRow: { alignSelf: "stretch", flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  insufficientValue: { color: CORAL },
  insufficientText: { alignSelf: "stretch", color: CORAL, fontFamily: "Inter_600SemiBold", fontSize: 11, marginBottom: 8 },
  purchaseButton: { height: 49, alignSelf: "stretch", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COBALT, borderRadius: 15, marginTop: 7 },
  purchaseButtonDisabled: { backgroundColor: "#B9B2AA" },
  purchaseButtonPressed: { backgroundColor: INK, transform: [{ scale: 0.985 }] },
  purchaseButtonText: { color: PAPER, fontFamily: "Inter_700Bold", fontSize: 13 },
  cancelButton: { padding: 14 },
  cancelText: { color: MUTED, fontFamily: "Inter_600SemiBold", fontSize: 12 },
  playlistList: { paddingHorizontal: 20, paddingBottom: 28, gap: 9 },
  playlistCard: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 13, padding: 9, borderRadius: 17, backgroundColor: PAPER },
  playlistMain: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 11 },
  playlistCopy: { flex: 1, minWidth: 0 },
  playlistTitle: { color: INK, fontFamily: "Inter_700Bold", fontSize: 12 },
  playlistMeta: { color: MUTED, fontFamily: "Inter_500Medium", fontSize: 10, marginTop: 4 },
  playlistSheet: { maxHeight: "88%", backgroundColor: CANVAS, borderTopLeftRadius: 29, borderTopRightRadius: 29, paddingHorizontal: 21, paddingTop: 10, paddingBottom: 27 },
  playlistModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15 },
  playlistModalTitle: { color: INK, fontFamily: "Inter_700Bold", fontSize: 22, marginTop: 5 },
  playlistTrackPreview: { flexDirection: "row", alignItems: "center", gap: 11, padding: 9, borderRadius: 14, backgroundColor: PAPER, marginBottom: 13 },
  playlistCreateButton: { height: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: CORAL, borderRadius: 14, marginTop: 10 },
  playlistListLabel: { color: MUTED, fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1.1, marginTop: 17, marginBottom: 7 },
  playlistChoices: { maxHeight: 210 },
  playlistChoice: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: "#E8DED4" },
  ledgerList: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28, gap: 8 },
  ledgerRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 11, padding: 10, borderRadius: 15, backgroundColor: PAPER },
  ledgerIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#F064511A" },
  ledgerCopy: { flex: 1, minWidth: 0 },
  ledgerTitle: { color: INK, fontFamily: "Inter_700Bold", fontSize: 11 },
  ledgerMeta: { color: MUTED, fontFamily: "Inter_500Medium", fontSize: 9, marginTop: 4 },
  ledgerAmount: { color: INK, fontFamily: "Inter_700Bold", fontSize: 10 },
  uploadSheet: { backgroundColor: CANVAS, borderTopLeftRadius: 29, borderTopRightRadius: 29, paddingHorizontal: 21, paddingTop: 10, paddingBottom: 27 },
  uploadHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  fieldLabel: { color: INK, fontFamily: "Inter_700Bold", fontSize: 11, marginBottom: 7, marginTop: 10 },
  formInput: { height: 44, borderRadius: 13, borderWidth: 1, borderColor: "#E2D8CE", backgroundColor: PAPER, paddingHorizontal: 13, color: INK, fontFamily: "Inter_500Medium", fontSize: 13 },
  formGenreRail: { gap: 7, paddingBottom: 3 },
  formGenreChip: { borderWidth: 1, borderColor: "#E2D8CE", backgroundColor: PAPER, borderRadius: 13, paddingHorizontal: 11, paddingVertical: 8 },
  formGenreChipActive: { borderColor: INK, backgroundColor: INK },
  formGenreText: { color: MUTED, fontFamily: "Inter_600SemiBold", fontSize: 10 },
  formGenreTextActive: { color: PAPER },
  publishModes: { flexDirection: "row", gap: 8 },
  publishMode: { flex: 1, height: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 13, borderWidth: 1, borderColor: "#E2D8CE", backgroundColor: PAPER },
  publishModeActive: { borderColor: INK, backgroundColor: INK },
  publishModeText: { color: MUTED, fontFamily: "Inter_700Bold", fontSize: 12 },
  publishModeTextActive: { color: PAPER },
  freePublishingNote: { color: MUTED, fontFamily: "Inter_500Medium", fontSize: 10, marginTop: 8 },
  videoUseToggle: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 12, paddingVertical: 7 },
  videoUseCopy: { flex: 1 },
  videoUseTitle: { color: INK, fontFamily: "Inter_600SemiBold", fontSize: 11 },
  videoUseNote: { color: MUTED, fontFamily: "Inter_400Regular", fontSize: 9, marginTop: 3 },
  priceInput: { flexDirection: "row", alignItems: "center", height: 44, borderRadius: 13, borderWidth: 1, borderColor: "#E2D8CE", backgroundColor: PAPER, paddingHorizontal: 13 },
  priceTextInput: { flex: 1, color: INK, fontFamily: "Inter_700Bold", fontSize: 13, marginLeft: 7 },
  acoinSuffix: { color: MUTED, fontFamily: "Inter_600SemiBold", fontSize: 11 },
  filePicker: { flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1, borderStyle: "dashed", borderColor: "#D6C7B9", borderRadius: 15, backgroundColor: PAPER, padding: 13, marginTop: 17 },
  filePickerCopy: { flex: 1 },
  filePickerTitle: { color: INK, fontFamily: "Inter_700Bold", fontSize: 12 },
  filePickerSub: { color: MUTED, fontFamily: "Inter_500Medium", fontSize: 10, marginTop: 3 },
  publishButton: { height: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: CORAL, borderRadius: 15, marginTop: 17 },
});
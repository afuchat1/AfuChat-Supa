import React, { useEffect, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { safeRouter } from "@/lib/navUtils";
import {
  DEFAULT_FOOTBALL_NOTIFICATION_PREFERENCES,
  getFootballData,
  getFootballNotificationPreferences,
  listFootballFollows,
  saveFootballNotificationPreferences,
  toggleFootballFollow,
  type FootballAction,
  type FootballData,
  type FootballFollow,
  type FootballNotificationPreferences,
} from "@/lib/afuFootball";
import { useQueryCache } from "@/lib/hooks/useQueryCache";
import { queryCacheInvalidate } from "@/lib/storage/queryCache";

type FootballRecord = Record<string, any>;
type FootballQueryState<T> = { result: FootballData<T> | null; error: string | null };

const FOLLOW_KEY = "football:follows";

function footballShareLink(path: string) {
  return `afuchat://${path.replace(/^\/+/, "")}`;
}

function useFootballQuery<T>(
  key: string,
  action: FootballAction,
  params: Record<string, string | number | boolean | undefined> = {},
  enabled = true,
) {
  const query = useQueryCache<FootballQueryState<T>>(
    key,
    async () => {
      try {
        return { result: await getFootballData<T>(action, params), error: null };
      } catch (error) {
        return { result: null, error: error instanceof Error ? error.message : "Football data is unavailable." };
      }
    },
    { enabled, ttlMs: 90_000 },
  );
  const refresh = async () => {
    queryCacheInvalidate(key);
    await query.refresh();
  };
  return {
    ...query,
    result: query.data?.result ?? null,
    error: query.data?.error ?? null,
    refresh,
  };
}

function useFollows() {
  const query = useQueryCache<{ items: FootballFollow[]; error: string | null }>(
    FOLLOW_KEY,
    async () => {
      try {
        return { items: await listFootballFollows(), error: null };
      } catch (error) {
        return { items: [], error: error instanceof Error ? error.message : "Could not load followed teams." };
      }
    },
    { ttlMs: 60_000 },
  );
  return {
    ...query,
    data: query.data?.items ?? [],
    error: query.data?.error ?? null,
    refresh: async () => {
      queryCacheInvalidate(FOLLOW_KEY);
      await query.refresh();
    },
  };
}

function usePalette() {
  const { colors: appColors, isDark } = useTheme();
  const colors = {
    background: "#07182E",
    backgroundTertiary: "#E8F1FB",
    surface: "#F8FAFD",
    text: "#10203A",
    textSecondary: "#40516A",
    textMuted: "#748197",
    accent: "#1388F8",
    error: appColors.error,
  };
  return {
    colors,
    backIconColor: isDark ? "#FFFFFF" : "#000000",
    pitch: "#EAF3FD",
    green: "#18C887",
    greenBright: "#2B9CF7",
    amber: "#E8A631",
    navy: "#07182E",
    navyRaised: "#0C2A4E",
    card: colors.surface,
  };
}

function formatKickoff(iso?: string) {
  if (!iso) return "Time TBC";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Time TBC";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateLabel(date: Date) {
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

function fixtureStatus(item: FootballRecord) {
  const status = item.fixture?.status;
  return status?.short === "NS" ? formatKickoff(item.fixture?.date) : status?.elapsed != null
    ? `${status.elapsed}'`
    : status?.long ?? "Scheduled";
}

function isLive(item: FootballRecord) {
  const short = item.fixture?.status?.short;
  return ["1H", "2H", "HT", "ET", "P", "LIVE", "INT"].includes(short);
}

function Logo({ uri, label, size = 38 }: { uri?: string | null; label: string; size?: number }) {
  const { colors } = usePalette();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", backgroundColor: colors.backgroundTertiary, overflow: "hidden" }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size * 0.72, height: size * 0.72 }} resizeMode="contain" />
      ) : (
        <Text style={{ color: colors.textSecondary, fontSize: Math.max(11, size * 0.33), fontFamily: "Inter_700Bold" }}>
          {(label || "F").slice(0, 1).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

function ScreenFrame({
  title,
  eyebrow,
  children,
  action,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const { colors, backIconColor } = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: Math.max(insets.top, Platform.OS === "web" ? 67 : 10) + 6,
          paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 8) + 104,
        }}
      >
        <View style={styles.topRow}>
          <Pressable onPress={() => safeRouter.back("/app/afufootball")} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={20} color={backIconColor} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.eyebrow, { color: "#8EA5C1" }]}>{eyebrow ?? "AFUCHAT FOOTBALL"}</Text>
            <Text numberOfLines={1} style={[styles.screenTitle, { color: "#FFFFFF" }]}>{title}</Text>
          </View>
          {action}
        </View>
        {children}
      </ScrollView>
    </View>
  );
}

function SectionTitle({ title, note, right, tone = "page" }: { title: string; note?: string; right?: React.ReactNode; tone?: "page" | "card" }) {
  const { colors } = usePalette();
  const titleColor = tone === "card" ? colors.text : "#F5F8FC";
  const noteColor = tone === "card" ? colors.textMuted : "#A6B5C9";
  return (
    <View style={styles.sectionHeading}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.sectionTitle, { color: titleColor }]}>{title}</Text>
        {note ? <Text style={[styles.muted, { color: noteColor, marginTop: 3 }]}>{note}</Text> : null}
      </View>
      {right}
    </View>
  );
}

function DataNotice({
  error,
  warning,
  loading,
  stale,
  onRetry,
  emptyText,
}: {
  error?: string | null;
  warning?: string;
  loading?: boolean;
  stale?: boolean;
  onRetry?: () => void;
  emptyText?: string;
}) {
  const { colors, pitch, amber } = usePalette();
  if (loading) {
    return (
      <View style={[styles.notice, { backgroundColor: colors.surface }]}>
        <View style={[styles.skeleton, { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.backgroundTertiary }]} />
        <View style={{ flex: 1, gap: 8 }}>
          <View style={[styles.skeleton, { width: "62%", height: 12, backgroundColor: colors.backgroundTertiary }]} />
          <View style={[styles.skeleton, { width: "42%", height: 10, backgroundColor: colors.backgroundTertiary }]} />
        </View>
      </View>
    );
  }
  if (error) {
    const expired = /expired|401|unauthorized|sign in/i.test(error);
    const unconfigured = /key|configur|provider/i.test(error) && !expired;
    return (
      <View style={[styles.connectionCard, { backgroundColor: colors.surface }]}>
        <View style={[styles.connectionIcon, { backgroundColor: expired ? "#EAF3FD" : unconfigured ? `${amber}20` : `${colors.error}18` }]}>
          <Ionicons name={expired ? "person-outline" : unconfigured ? "cloud-offline-outline" : "alert-circle-outline"} size={20} color={expired ? colors.accent : unconfigured ? amber : colors.error} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{expired ? "Sign in to load live football" : unconfigured ? "Football data is being connected" : "Football data is unavailable"}</Text>
          <Text style={[styles.muted, { color: colors.textMuted, marginTop: 4 }]}>{expired ? "Your AfuChat session has expired. Sign in and refresh." : unconfigured ? "Live fixtures will appear when the provider connection is ready." : error}</Text>
          {onRetry ? <Pressable onPress={onRetry} accessibilityRole="button" style={[styles.retryButton, { backgroundColor: pitch }]}><Ionicons name="refresh" size={14} color={colors.accent} /><Text style={[styles.retryText, { color: colors.accent }]}>Refresh</Text></Pressable> : null}
        </View>
      </View>
    );
  }
  if (warning && /not configured|not set|api key|unconfigured/i.test(warning)) {
    return (
      <View style={[styles.connectionCard, { backgroundColor: colors.surface }]}>
        <View style={[styles.connectionIcon, { backgroundColor: `${amber}20` }]}>
          <Ionicons name="cloud-offline-outline" size={20} color={amber} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Football data is being connected</Text>
          <Text style={[styles.muted, { color: colors.textMuted, marginTop: 5 }]}>{warning}</Text>
          {onRetry ? <Pressable onPress={onRetry} accessibilityRole="button" style={[styles.retryButton, { backgroundColor: pitch }]}><Ionicons name="refresh" size={14} color={colors.accent} /><Text style={[styles.retryText, { color: colors.accent }]}>Refresh</Text></Pressable> : null}
        </View>
      </View>
    );
  }
  return (
    <View>
      {warning ? (
        <View style={[styles.warningStrip, { backgroundColor: `${amber}20` }]}>
          <Ionicons name="information-circle-outline" size={18} color={amber} />
          <Text style={[styles.warningText, { color: colors.textSecondary }]}>{warning}</Text>
        </View>
      ) : null}
      {stale ? (
        <View style={[styles.staleStrip, { backgroundColor: colors.surface }]}>
          <View style={[styles.liveDot, { backgroundColor: amber }]} />
          <Text style={[styles.muted, { color: colors.textMuted }]}>Showing saved data while we try to refresh.</Text>
          {onRetry ? <Pressable onPress={onRetry} hitSlop={8}><Text style={[styles.retryText, { color: colors.accent }]}>Refresh</Text></Pressable> : null}
        </View>
      ) : null}
      {emptyText ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.surface }]}>
          <View style={[styles.emptyMark, { backgroundColor: pitch }]}><Ionicons name="football-outline" size={23} color={colors.accent} /></View>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{emptyText}</Text>
          <Text style={[styles.muted, { color: colors.textMuted, textAlign: "center", marginTop: 5 }]}>No provider records are available for this view yet.</Text>
        </View>
      ) : null}
    </View>
  );
}

function FixtureRow({ item }: { item: FootballRecord }) {
  const { colors, green, pitch } = usePalette();
  const home = item.teams?.home ?? {};
  const away = item.teams?.away ?? {};
  const live = isLive(item);
  const finished = ["FT", "AET", "PEN"].includes(item.fixture?.status?.short);
  return (
    <Pressable
      onPress={() => safeRouter.push(`/football/match/${item.fixture?.id}`)}
      style={({ pressed }) => [styles.fixtureRow, { backgroundColor: colors.surface, opacity: pressed ? 0.84 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${home.name ?? "home team"} versus ${away.name ?? "away team"}`}
      testID={`football-fixture-${item.fixture?.id}`}
    >
      <View style={styles.fixtureMeta}>
        <Text numberOfLines={1} style={[styles.leagueMeta, { color: colors.textMuted }]}>{item.league?.name ?? "Competition"}</Text>
        <View style={styles.statusLine}>
          {live ? <View style={[styles.liveDot, { backgroundColor: "#D94A3B" }]} /> : null}
          <Text style={[styles.statusText, { color: live ? "#C84234" : colors.textMuted }]}>{live ? `LIVE ${fixtureStatus(item)}` : fixtureStatus(item)}</Text>
        </View>
      </View>
      <View style={styles.fixtureTeams}>
        <View style={styles.teamLine}>
          <Logo uri={home.logo} label={home.name} size={31} />
          <Text numberOfLines={1} style={[styles.teamName, { color: colors.text }]}>{home.name ?? "Home"}</Text>
          <Text style={[styles.score, { color: colors.text }]}>{item.goals?.home ?? (finished ? "—" : "")}</Text>
        </View>
        <View style={styles.teamLine}>
          <Logo uri={away.logo} label={away.name} size={31} />
          <Text numberOfLines={1} style={[styles.teamName, { color: colors.text }]}>{away.name ?? "Away"}</Text>
          <Text style={[styles.score, { color: colors.text }]}>{item.goals?.away ?? (finished ? "—" : "")}</Text>
        </View>
      </View>
      <View style={[styles.fixtureArrow, { backgroundColor: pitch }]}><Ionicons name="chevron-forward" size={15} color={green} /></View>
    </Pressable>
  );
}

function TeamListRow({ item, onPress }: { item: FootballRecord; onPress: () => void }) {
  const { colors } = usePalette();
  const team = item.team ?? item;
  const country = item.country ?? item.league?.country;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.resultRow, { backgroundColor: colors.surface, opacity: pressed ? 0.82 : 1 }]}>
      <Logo uri={team.logo} label={team.name ?? "Team"} size={43} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[styles.cardTitle, { color: colors.text }]}>{team.name ?? "Team"}</Text>
        {country ? <Text style={[styles.muted, { color: colors.textMuted, marginTop: 3 }]}>{country}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function CompetitionRow({ item, onPress }: { item: FootballRecord; onPress: () => void }) {
  const { colors, pitch, green } = usePalette();
  const league = item.league ?? item;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.competitionRow, { backgroundColor: colors.surface, opacity: pressed ? 0.82 : 1 }]}>
      <View style={[styles.competitionMark, { backgroundColor: pitch }]}><Logo uri={league.logo} label={league.name ?? "League"} size={37} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[styles.cardTitle, { color: colors.text }]}>{league.name ?? "Competition"}</Text>
        <Text numberOfLines={1} style={[styles.muted, { color: colors.textMuted, marginTop: 3 }]}>{[league.country, league.season].filter(Boolean).join(" · ") || "Competition"}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={green} />
    </Pressable>
  );
}

function FollowButton({ item, entityType, isFollowing }: { item: FootballRecord; entityType: "team" | "league"; isFollowing: boolean }) {
  const { colors, green } = usePalette();
  const follows = useFollows();
  const [busy, setBusy] = useState(false);
  const entity = entityType === "team" ? item.team ?? item : item.league ?? item;
  async function toggle() {
    if (busy || !entity.id) return;
    setBusy(true);
    try {
      await toggleFootballFollow({
        entity_type: entityType,
        entity_id: String(entity.id),
        entity_name: entity.name ?? entityType,
        entity_logo: entity.logo ?? null,
      }, isFollowing);
      queryCacheInvalidate(FOLLOW_KEY);
      await follows.refresh();
    } catch (error) {
      Alert.alert("Could not update follow", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Pressable onPress={toggle} disabled={busy} accessibilityRole="button" style={[styles.followButton, { backgroundColor: isFollowing ? colors.backgroundTertiary : green }]}>
      {busy ? <ActivityIndicator size="small" color={isFollowing ? colors.text : "#FFFFFF"} /> : <Ionicons name={isFollowing ? "checkmark" : "add"} size={17} color={isFollowing ? colors.text : "#FFFFFF"} />}
      <Text style={[styles.followText, { color: isFollowing ? colors.text : "#FFFFFF" }]}>{isFollowing ? "Following" : "Follow"}</Text>
    </Pressable>
  );
}

function recordWarning(...results: Array<FootballData<any> | null>) {
  return results.map((result) => result?.warning).find(Boolean);
}

function ShareEntityButton({ name, path, title }: { name: string; path: string; title: string }) {
  const { colors } = usePalette();
  async function share() {
    try {
      const url = footballShareLink(path);
      await Share.share({ message: `${name} on AfuFootball\n${url}`, title });
    } catch {}
  }
  return (
    <Pressable onPress={share} style={[styles.roundButton, { backgroundColor: colors.surface }]} accessibilityRole="button" accessibilityLabel={title}>
      <Ionicons name="share-outline" size={19} color={colors.text} />
    </Pressable>
  );
}

function fixtureItems(response: FootballRecord[]) {
  return response.filter((row) => row?.fixture?.id != null);
}

type HomeSectionKey = "overview" | "matches" | "competitions" | "teams" | "standings";

const HOME_SECTIONS: Array<{ key: HomeSectionKey; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }> = [
  { key: "overview", label: "Overview", icon: "trophy-outline" },
  { key: "matches", label: "Matches", icon: "calendar-outline" },
  { key: "competitions", label: "Competitions", icon: "star-outline" },
  { key: "teams", label: "Teams", icon: "people-outline" },
  { key: "standings", label: "Standings", icon: "bar-chart-outline" },
];

function initialHomeSection(section?: string): HomeSectionKey {
  if (section === "live" || section === "matches") return "matches";
  if (section === "competitions") return "competitions";
  if (section === "followed" || section === "teams") return "teams";
  if (section === "standings") return "standings";
  return "overview";
}

function FootballBrandHeader() {
  const { colors } = usePalette();
  return (
    <View style={styles.brandHeader}>
      <View style={styles.brandIdentity}>
        <View style={styles.brandMark}>
          <Ionicons name="football" size={22} color="#FFFFFF" />
        </View>
        <Text style={styles.brandName}>
          Afu<Text style={{ color: colors.accent }}>Chat</Text>
        </Text>
      </View>
      <Pressable
        onPress={() => safeRouter.push("/football/search")}
        style={styles.headerIconButton}
        accessibilityRole="button"
        accessibilityLabel="Search football"
      >
        <Ionicons name="search" size={22} color="#FFFFFF" />
      </Pressable>
      <Pressable
        onPress={() => safeRouter.push("/football/settings")}
        style={styles.headerIconButton}
        accessibilityRole="button"
        accessibilityLabel="Match notification settings"
      >
        <Ionicons name="notifications-outline" size={22} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

function HomeLiveCard({ item }: { item: FootballRecord }) {
  const home = item.teams?.home ?? {};
  const away = item.teams?.away ?? {};
  return (
    <Pressable
      onPress={() => safeRouter.push(`/football/match/${item.fixture?.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`Open live match: ${home.name ?? "Home"} versus ${away.name ?? "Away"}`}
      style={({ pressed }) => [styles.liveMatchWrap, { opacity: pressed ? 0.94 : 1 }]}
    >
      <LinearGradient colors={["#0757A5", "#092C5A", "#07182E"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.liveMatchCard}>
        <View style={styles.liveMatchHeader}>
          <View style={styles.liveNowPill}>
            <View style={[styles.liveDot, { backgroundColor: "#20D58A" }]} />
            <Text style={styles.liveNowText}>LIVE NOW</Text>
          </View>
          <Text numberOfLines={1} style={styles.liveLeague}>{item.league?.name ?? "Match centre"}  ›</Text>
        </View>
        <View style={styles.liveScoreRow}>
          <View style={styles.liveTeam}>
            <Logo uri={home.logo} label={home.name ?? "Home"} size={48} />
            <Text numberOfLines={1} style={styles.liveTeamName}>{home.name ?? "Home"}</Text>
          </View>
          <Text style={styles.liveScore}>{item.goals?.home ?? "–"}</Text>
          <View style={styles.liveMinute}><Text style={styles.liveMinuteText}>{fixtureStatus(item)}</Text></View>
          <Text style={styles.liveScore}>{item.goals?.away ?? "–"}</Text>
          <View style={styles.liveTeam}>
            <Logo uri={away.logo} label={away.name ?? "Away"} size={48} />
            <Text numberOfLines={1} style={styles.liveTeamName}>{away.name ?? "Away"}</Text>
          </View>
        </View>
        <View style={styles.liveMatchAction}>
          <Ionicons name="play-circle" size={17} color="#FFFFFF" />
          <Text style={styles.liveMatchActionText}>View match details</Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function HomeFixtureRow({ item }: { item: FootballRecord }) {
  const home = item.teams?.home ?? {};
  const away = item.teams?.away ?? {};
  const date = item.fixture?.date ? new Date(item.fixture.date) : null;
  const dateLabel = date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString([], { month: "short", day: "2-digit" })
    : "Date TBC";
  return (
    <View style={styles.homeFixtureRow}>
      <Pressable
        onPress={() => safeRouter.push(`/football/match/${item.fixture?.id}`)}
        style={styles.homeFixtureMatch}
        accessibilityRole="button"
        accessibilityLabel={`Open ${home.name ?? "home team"} versus ${away.name ?? "away team"}`}
      >
        <View style={styles.homeFixtureTeam}>
          <Text numberOfLines={1} style={[styles.homeFixtureTeamName, { textAlign: "right" }]}>{home.name ?? "Home"}</Text>
          <Logo uri={home.logo} label={home.name ?? "Home"} size={27} />
        </View>
        <View style={styles.homeFixtureTime}>
          <Text style={styles.homeFixtureKickoff}>{formatKickoff(item.fixture?.date)}</Text>
          <Text style={styles.homeFixtureDate}>{dateLabel}</Text>
        </View>
        <View style={styles.homeFixtureTeam}>
          <Logo uri={away.logo} label={away.name ?? "Away"} size={27} />
          <Text numberOfLines={1} style={styles.homeFixtureTeamName}>{away.name ?? "Away"}</Text>
        </View>
      </Pressable>
      <Pressable
        onPress={() => safeRouter.push("/football/settings")}
        style={styles.matchReminderButton}
        accessibilityRole="button"
        accessibilityLabel="Open match notification settings"
        hitSlop={8}
      >
        <Ionicons name="notifications-outline" size={19} color="#1687F8" />
      </Pressable>
    </View>
  );
}

function UpcomingMatchesCard({
  items,
  loading,
  hasError,
  onSeeAll,
}: {
  items: FootballRecord[];
  loading: boolean;
  hasError: boolean;
  onSeeAll: () => void;
}) {
  return (
    <View style={styles.homeSectionCard}>
      <View style={styles.homeCardHeader}>
        <View style={styles.homeCardHeading}>
          <View style={styles.homeCardIcon}><Ionicons name="calendar" size={19} color="#1388F8" /></View>
          <Text style={styles.homeCardTitle}>Upcoming Matches</Text>
        </View>
        <Pressable onPress={onSeeAll} style={styles.seeAllButton} accessibilityRole="button">
          <Text style={styles.seeAllText}>See all</Text>
          <Ionicons name="chevron-forward" size={16} color="#1388F8" />
        </Pressable>
      </View>
      {loading ? (
        <View style={styles.homeInlineState}>
          <ActivityIndicator size="small" color="#1388F8" />
          <Text style={styles.homeInlineText}>Loading today’s fixtures</Text>
        </View>
      ) : hasError ? (
        <Text style={styles.homeInlineText}>Sign in to load today’s fixtures.</Text>
      ) : items.length ? (
        items.slice(0, 3).map((item) => <HomeFixtureRow key={String(item.fixture?.id)} item={item} />)
      ) : (
        <Text style={styles.homeInlineText}>No fixtures listed for today.</Text>
      )}
    </View>
  );
}

function PopularCompetitionsCard({
  items,
  loading,
  hasError,
  onSeeAll,
  onOpen,
}: {
  items: FootballRecord[];
  loading: boolean;
  hasError: boolean;
  onSeeAll: () => void;
  onOpen: (item: FootballRecord) => void;
}) {
  const competitions = items.slice(0, 6);
  return (
    <View style={styles.homeSectionCard}>
      <View style={styles.homeCardHeader}>
        <View style={styles.homeCardHeading}>
          <View style={styles.homeCardIcon}><Ionicons name="trophy" size={19} color="#1388F8" /></View>
          <Text style={styles.homeCardTitle}>Popular Competitions</Text>
        </View>
        <Pressable onPress={onSeeAll} style={styles.seeAllButton} accessibilityRole="button">
          <Text style={styles.seeAllText}>See all</Text>
          <Ionicons name="chevron-forward" size={16} color="#1388F8" />
        </Pressable>
      </View>
      {loading ? (
        <View style={styles.homeInlineState}>
          <ActivityIndicator size="small" color="#1388F8" />
          <Text style={styles.homeInlineText}>Loading competitions</Text>
        </View>
      ) : hasError ? (
        <Text style={styles.homeInlineText}>Sign in to load competitions.</Text>
      ) : competitions.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.competitionTiles}>
          {competitions.map((item, index) => {
            const league = item.league ?? item;
            return (
              <Pressable
                key={String(league.id ?? index)}
                onPress={() => onOpen(item)}
                style={({ pressed }) => [styles.competitionTile, { opacity: pressed ? 0.82 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel={`Open ${league.name ?? "competition"}`}
              >
                <Logo uri={league.logo} label={league.name ?? "League"} size={39} />
                <Text numberOfLines={2} style={styles.competitionTileName}>{league.name ?? "Competition"}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <Text style={styles.homeInlineText}>Competitions will appear here.</Text>
      )}
    </View>
  );
}

export function AfuFootballApp({ initialSection }: { initialSection?: string }) {
  const [date, setDate] = useState(() => new Date());
  const [selectedSection, setSelectedSection] = useState<HomeSectionKey>(() => initialHomeSection(initialSection));
  const insets = useSafeAreaInsets();
  useEffect(() => {
    setSelectedSection(initialHomeSection(initialSection));
  }, [initialSection]);
  const live = useFootballQuery<FootballRecord>("football:live", "live");
  const fixtureDate = localDateKey(date);
  const fixtureTimeZone = localTimeZone();
  const dated = useFootballQuery<FootballRecord>(
    `football:fixtures:${fixtureDate}:${fixtureTimeZone ?? "provider-default"}`,
    "fixtures",
    { date: fixtureDate, timezone: fixtureTimeZone },
  );
  const competitions = useFootballQuery<FootballRecord>("football:competitions", "competitions");
  const follows = useFollows();
  const { colors, pitch, green, navy } = usePalette();
  const liveFixtures = fixtureItems(live.result?.response ?? []);
  const dateFixtures = fixtureItems(dated.result?.response ?? []);
  const compItems = competitions.result?.response ?? [];
  const following = follows.data ?? [];
  const firstCompetition = compItems.find((row) => (row.league ?? row).id != null);
  const firstLeague = firstCompetition?.league ?? firstCompetition ?? {};
  const standingsSeason = firstLeague.season ?? firstLeague.seasons?.find((season: FootballRecord) => season.current)?.year ?? new Date().getFullYear();
  const standingsQuery = useFootballQuery<FootballRecord>(
    `football:home-standings:${firstLeague.id ?? "none"}:${standingsSeason}`,
    "standings",
    { league: firstLeague.id, season: standingsSeason },
    selectedSection === "standings" && !!firstLeague.id,
  );
  const standingsRows: FootballRecord[] = standingsQuery.result?.response?.[0]?.league?.standings?.flat?.() ?? [];
  const warning = recordWarning(live.result, dated.result, competitions.result, standingsQuery.result);
  const homeError = selectedSection === "overview"
    ? live.error ?? dated.error ?? competitions.error
    : selectedSection === "matches"
      ? live.error ?? dated.error
      : selectedSection === "competitions"
        ? competitions.error
        : selectedSection === "teams"
          ? follows.error
          : standingsQuery.error ?? competitions.error;

  function changeDate(direction: number) {
    setDate((previous) => {
      const next = new Date(previous);
      next.setDate(next.getDate() + direction);
      return next;
    });
  }

  function openCompetition(item: FootballRecord) {
    const league = item.league ?? item;
    if (league.id) safeRouter.push(`/football/league/${league.id}`);
  }

  const sectionLoading = selectedSection === "overview"
    ? live.loading || dated.loading || competitions.loading
    : selectedSection === "matches"
      ? live.loading || dated.loading
      : selectedSection === "competitions"
        ? competitions.loading
        : selectedSection === "teams"
          ? follows.loading
          : standingsQuery.loading || competitions.loading;
  const showGlobalNotice = !!homeError || (!sectionLoading && !!warning);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: Math.max(insets.top, Platform.OS === "web" ? 67 : 10) + 4, paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 8) + 104 }}>
        <FootballBrandHeader />
        <View style={styles.heroImage}>
          <ExpoImage
          source={require("../../assets/images/football-hero.png")}
          style={styles.heroImagePhoto}
          contentFit="cover"
          accessible
          accessibilityLabel="Football stadium, live scores, fixtures and competitions"
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectionTabs}>
          {HOME_SECTIONS.map((section) => {
            const active = selectedSection === section.key;
            return (
              <Pressable
                key={section.key}
                onPress={() => setSelectedSection(section.key)}
                style={[styles.sectionTab, active && styles.sectionTabActive]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Ionicons name={section.icon} size={18} color={active ? "#FFFFFF" : "#C5D1E0"} />
                <Text style={[styles.sectionTabText, { color: active ? "#FFFFFF" : "#E1E8F1" }]}>{section.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {showGlobalNotice ? (
          <DataNotice
            error={homeError}
            warning={warning}
            onRetry={() => {
              if (selectedSection === "teams") void follows.refresh();
              else if (selectedSection === "competitions") void competitions.refresh();
              else if (selectedSection === "standings") {
                if (firstLeague.id) void standingsQuery.refresh();
                else void competitions.refresh();
              } else {
                void live.refresh();
                void dated.refresh();
                if (selectedSection === "overview") void competitions.refresh();
              }
            }}
          />
        ) : null}

        {selectedSection === "overview" ? (
          <>
            {liveFixtures.length ? (
              <HomeLiveCard item={liveFixtures[0]} />
            ) : live.loading ? (
              <View style={styles.liveSkeleton}><ActivityIndicator color="#FFFFFF" /><Text style={styles.liveSkeletonText}>Checking live matches</Text></View>
            ) : live.error ? null : (
              <View style={styles.noLiveCard}>
                <View style={styles.noLiveIcon}><Ionicons name="football-outline" size={23} color="#67B5FF" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.noLiveTitle}>No live matches right now</Text>
                  <Text style={styles.noLiveSubtitle}>Today’s fixtures are listed below.</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#8EA5C1" />
              </View>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickActionRow}>
              {[
                { label: "Live Matches", icon: "flame" as const, tab: "matches" as const },
                { label: "Today’s Fixtures", icon: "calendar" as const, tab: "matches" as const },
                { label: "Leagues", icon: "trophy" as const, tab: "competitions" as const },
                { label: "My Teams", icon: "star" as const, tab: "teams" as const },
                { label: "Results", icon: "stats-chart" as const, tab: "matches" as const },
              ].map((action) => (
                <Pressable
                  key={action.label}
                  onPress={() => {
                    setDate(new Date());
                    setSelectedSection(action.tab);
                  }}
                  style={({ pressed }) => [styles.quickActionTile, { opacity: pressed ? 0.84 : 1 }]}
                  accessibilityRole="button"
                >
                  <Ionicons name={action.icon} size={22} color="#42A5FF" />
                  <Text style={styles.quickActionLabel}>{action.label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <UpcomingMatchesCard
              items={dateFixtures}
              loading={dated.loading && !dated.error}
              hasError={!!dated.error}
              onSeeAll={() => setSelectedSection("matches")}
            />
            <PopularCompetitionsCard
              items={compItems}
              loading={competitions.loading && !competitions.error}
              hasError={!!competitions.error}
              onSeeAll={() => setSelectedSection("competitions")}
              onOpen={openCompetition}
            />
          </>
        ) : null}

        {selectedSection === "matches" ? (
          <>
            <SectionTitle
              title="Live Matches"
              note="Real-time scores from the football provider."
              right={<Pressable onPress={() => safeRouter.push("/football/search")} style={styles.headerLink}><Ionicons name="search" size={18} color="#FFFFFF" /></Pressable>}
            />
            {!homeError && live.loading ? <DataNotice loading /> : null}
            {!homeError && !liveFixtures.length && !live.loading ? <DataNotice emptyText="No live matches right now" /> : null}
            {!live.error ? liveFixtures.map((item) => <FixtureRow key={String(item.fixture?.id)} item={item} />) : null}
            <View style={{ marginTop: 8 }}>
              <SectionTitle
                title="Fixtures"
                note="Browse matches by date."
                right={
                  <View style={styles.dateStepper}>
                    <Pressable onPress={() => changeDate(-1)} style={styles.stepButton} accessibilityLabel="Previous day"><Ionicons name="chevron-back" size={17} color="#FFFFFF" /></Pressable>
                    <Pressable onPress={() => setDate(new Date())} style={styles.dateLabel}><Text style={styles.dateLabelText}>{formatDateLabel(date)}</Text></Pressable>
                    <Pressable onPress={() => changeDate(1)} style={styles.stepButton} accessibilityLabel="Next day"><Ionicons name="chevron-forward" size={17} color="#FFFFFF" /></Pressable>
                  </View>
                }
              />
              {!homeError && dated.loading ? <DataNotice loading /> : null}
              {!dated.error && !dated.loading && !dateFixtures.length ? <DataNotice emptyText="No fixtures listed for this date" /> : null}
              {!dated.error ? dateFixtures.map((item) => <FixtureRow key={String(item.fixture?.id)} item={item} />) : null}
            </View>
          </>
        ) : null}

        {selectedSection === "competitions" ? (
          <>
            <SectionTitle title="Popular Competitions" note="Explore leagues and tournaments." right={<Pressable onPress={() => safeRouter.push("/football/search")} style={styles.headerLink}><Ionicons name="search" size={18} color="#FFFFFF" /></Pressable>} />
            {!competitions.error && competitions.loading ? <DataNotice loading /> : null}
            {!competitions.error && !competitions.loading && !compItems.length ? <DataNotice emptyText="No competitions available" /> : null}
            {compItems.map((item, index) => <CompetitionRow key={String(item.league?.id ?? item.id ?? index)} item={item} onPress={() => openCompetition(item)} />)}
          </>
        ) : null}

        {selectedSection === "teams" ? (
          <>
            <SectionTitle
              title="My Teams"
              note="Clubs and competitions you follow."
              right={<Pressable onPress={() => safeRouter.push("/football/search")} style={styles.headerLink}><Ionicons name="search" size={18} color="#FFFFFF" /></Pressable>}
            />
            {follows.loading && !follows.error ? <DataNotice loading /> : null}
            {!follows.error && !follows.loading && !following.length ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.surface }]}>
                <View style={[styles.emptyMark, { backgroundColor: pitch }]}><Ionicons name="star-outline" size={22} color={colors.accent} /></View>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Build your matchday</Text>
                <Text style={[styles.muted, { color: colors.textMuted, textAlign: "center", marginTop: 5 }]}>Follow teams and competitions to keep them close.</Text>
                <Pressable onPress={() => safeRouter.push("/football/search")} style={[styles.primaryButton, { backgroundColor: colors.accent, marginTop: 15 }]}><Text style={styles.primaryButtonText}>Find teams</Text></Pressable>
              </View>
            ) : null}
            {following.map((item) => (
              <Pressable key={item.id} onPress={() => safeRouter.push(item.entity_type === "team" ? `/football/team/${item.entity_id}` : `/football/league/${item.entity_id}`)} style={({ pressed }) => [styles.resultRow, { backgroundColor: colors.surface, opacity: pressed ? 0.84 : 1 }]}>
                <Logo uri={item.entity_logo} label={item.entity_name} size={42} />
                <View style={{ flex: 1 }}><Text style={[styles.cardTitle, { color: colors.text }]}>{item.entity_name}</Text><Text style={[styles.muted, { color: colors.textMuted, marginTop: 3 }]}>{item.entity_type === "team" ? "Team" : "Competition"}</Text></View>
                <Ionicons name="chevron-forward" size={18} color={colors.accent} />
              </Pressable>
            ))}
          </>
        ) : null}

        {selectedSection === "standings" ? (
          <>
            <SectionTitle title={firstLeague.name ? `${firstLeague.name} Standings` : "Standings"} note="Current table from the football provider." right={<Pressable onPress={() => setSelectedSection("competitions")} style={styles.headerLink}><Ionicons name="trophy-outline" size={18} color="#FFFFFF" /></Pressable>} />
            {!firstLeague.id ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.surface }]}>
                <View style={[styles.emptyMark, { backgroundColor: pitch }]}><Ionicons name="bar-chart-outline" size={22} color={colors.accent} /></View>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Choose a competition</Text>
                <Text style={[styles.muted, { color: colors.textMuted, textAlign: "center", marginTop: 5 }]}>Open a league to view its current table.</Text>
                <Pressable onPress={() => setSelectedSection("competitions")} style={[styles.primaryButton, { backgroundColor: colors.accent, marginTop: 15 }]}><Text style={styles.primaryButtonText}>Browse competitions</Text></Pressable>
              </View>
            ) : standingsRows.length ? (
              <View style={[styles.panel, { backgroundColor: colors.surface }]}>
                <SectionTitle title="Table" tone="card" />
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableHead, { color: colors.textMuted, width: 28 }]}>#</Text>
                  <Text style={[styles.tableHead, { color: colors.textMuted, flex: 1 }]}>TEAM</Text>
                  <Text style={[styles.tableHead, { color: colors.textMuted, width: 36, textAlign: "right" }]}>PL</Text>
                  <Text style={[styles.tableHead, { color: colors.textMuted, width: 39, textAlign: "right" }]}>GD</Text>
                  <Text style={[styles.tableHead, { color: colors.accent, width: 38, textAlign: "right" }]}>PTS</Text>
                </View>
                {standingsRows.map((row, index) => (
                  <Pressable key={`${row.team?.id}-${index}`} onPress={() => safeRouter.push(`/football/team/${row.team?.id}`)} style={styles.tableRow}>
                    <Text style={[styles.tableRank, { color: colors.textMuted }]}>{row.rank}</Text>
                    <View style={styles.tableTeam}><Logo uri={row.team?.logo} label={row.team?.name} size={24} /><Text numberOfLines={1} style={[styles.tableTeamName, { color: colors.text }]}>{row.team?.name}</Text></View>
                    <Text style={[styles.tableStat, { color: colors.textSecondary }]}>{row.all?.played ?? "—"}</Text>
                    <Text style={[styles.tableStat, { color: colors.textSecondary }]}>{row.goalsDiff ?? "—"}</Text>
                    <Text style={[styles.tablePoints, { color: colors.accent }]}>{row.points ?? "—"}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <DataNotice error={standingsQuery.error} loading={standingsQuery.loading} onRetry={() => void standingsQuery.refresh()} emptyText={!standingsQuery.error && !standingsQuery.loading ? "Standings are not available for this competition" : undefined} />
            )}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

export function FootballMatchScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const match = useFootballQuery<FootballRecord>(`football:fixture:${id}`, "fixture", { id }, !!id);
  const events = useFootballQuery<FootballRecord>(`football:events:${id}`, "events", { fixture: id }, !!id);
  const statistics = useFootballQuery<FootballRecord>(`football:statistics:${id}`, "statistics", { fixture: id }, !!id);
  const lineups = useFootballQuery<FootballRecord>(`football:lineups:${id}`, "lineups", { fixture: id }, !!id);
  const item = match.result?.response?.[0];
  const eventRows = events.result?.response ?? [];
  const statRows = statistics.result?.response ?? [];
  const lineupRows = lineups.result?.response ?? [];
  const { colors, pitch, green } = usePalette();
  const home = item?.teams?.home ?? {};
  const away = item?.teams?.away ?? {};
  const warning = recordWarning(match.result, events.result, statistics.result, lineups.result);

  async function shareMatch() {
    try {
      const url = footballShareLink(`/football/match/${id}`);
      await Share.share({ message: `${home.name ?? "Home"} vs ${away.name ?? "Away"} on AfuFootball\n${url}`, title: "Share match" });
    } catch {}
  }

  return (
    <ScreenFrame title="Match centre" eyebrow={item?.league?.name ?? "Football"} action={<Pressable onPress={shareMatch} style={[styles.roundButton, { backgroundColor: colors.surface }]} accessibilityLabel="Share match"><Ionicons name="share-outline" size={19} color={colors.text} /></Pressable>}>
      <DataNotice error={match.error} warning={warning} loading={match.loading} stale={match.isStale || !!match.result?.stale} onRetry={() => void match.refresh()} emptyText={!match.error && !match.loading && !item ? "Match details unavailable" : undefined} />
      {item ? (
        <>
          <View style={[styles.scoreboard, { backgroundColor: pitch }]}>
            <Text style={[styles.scoreboardMeta, { color: green }]}>{item.league?.name}{item.league?.round ? ` · ${item.league.round}` : ""}</Text>
            <View style={styles.scoreboardTeams}>
              <Pressable style={styles.scoreboardTeam} onPress={() => safeRouter.push(`/football/team/${home.id}`)}>
                <Logo uri={home.logo} label={home.name} size={58} />
                <Text numberOfLines={2} style={[styles.scoreboardName, { color: colors.text }]}>{home.name}</Text>
              </Pressable>
              <View style={styles.scoreCenter}>
                <Text style={[styles.scoreLarge, { color: colors.text }]}>{item.goals?.home ?? "–"} <Text style={{ color: colors.textMuted }}>:</Text> {item.goals?.away ?? "–"}</Text>
                <Text style={[styles.statusText, { color: isLive(item) ? "#C84234" : colors.textMuted }]}>{isLive(item) ? `LIVE · ${fixtureStatus(item)}` : fixtureStatus(item)}</Text>
              </View>
              <Pressable style={styles.scoreboardTeam} onPress={() => safeRouter.push(`/football/team/${away.id}`)}>
                <Logo uri={away.logo} label={away.name} size={58} />
                <Text numberOfLines={2} style={[styles.scoreboardName, { color: colors.text }]}>{away.name}</Text>
              </Pressable>
            </View>
            <Text style={[styles.venueText, { color: colors.textMuted }]}>{[item.fixture?.venue?.name, item.fixture?.venue?.city].filter(Boolean).join(" · ") || (item.fixture?.date ? new Date(item.fixture.date).toLocaleString() : "Venue details unavailable")}</Text>
          </View>
          {eventRows.length ? <View style={[styles.panel, { backgroundColor: colors.surface }]}><SectionTitle title="Match events" note="Provider event feed" />{eventRows.map((event, index) => <View key={`${event.time?.elapsed}-${index}`} style={styles.eventRow}><Text style={[styles.eventTime, { color: green }]}>{event.time?.elapsed ?? "—"}'</Text><View style={{ flex: 1 }}><Text style={[styles.eventTitle, { color: colors.text }]}>{[event.type, event.detail].filter(Boolean).join(" · ")}</Text><Text style={[styles.muted, { color: colors.textMuted, marginTop: 3 }]}>{[event.player?.name, event.assist?.name].filter(Boolean).join(" · ")}</Text></View><Text style={[styles.muted, { color: colors.textMuted }]}>{event.team?.name}</Text></View>)}</View> : null}
          {statRows.length ? <View style={[styles.panel, { backgroundColor: colors.surface }]}><SectionTitle title="Statistics" note="Only figures returned for this match" />{statRows.map((teamStats, index) => <View key={`${teamStats.team?.id}-${index}`} style={{ marginTop: 12 }}><View style={styles.statTeam}><Logo uri={teamStats.team?.logo} label={teamStats.team?.name} size={27} /><Text style={[styles.cardTitle, { color: colors.text }]}>{teamStats.team?.name}</Text></View>{(teamStats.statistics ?? []).map((stat: FootballRecord, i: number) => <View key={`${stat.type}-${i}`} style={styles.statRow}><Text style={[styles.statValue, { color: colors.text }]}>{stat.value ?? "—"}</Text><Text style={[styles.statName, { color: colors.textMuted }]}>{stat.type}</Text></View>)}</View>)}</View> : null}
          {lineupRows.length ? <View style={[styles.panel, { backgroundColor: colors.surface }]}><SectionTitle title="Lineups" note="Starting XI and substitutes" />{lineupRows.map((lineup, index) => <View key={`${lineup.team?.id}-${index}`} style={{ marginTop: 13 }}><View style={styles.statTeam}><Logo uri={lineup.team?.logo} label={lineup.team?.name} size={27} /><Text style={[styles.cardTitle, { color: colors.text }]}>{lineup.team?.name}</Text>{lineup.formation ? <Text style={[styles.muted, { color: colors.textMuted, marginLeft: "auto" }]}>{lineup.formation}</Text> : null}</View>{lineup.coach?.name ? <Text style={[styles.muted, { color: colors.textMuted, marginTop: 9 }]}>Coach · {lineup.coach.name}</Text> : null}<Text style={[styles.lineupCaption, { color: colors.textMuted }]}>STARTING XI</Text>{(lineup.startXI ?? []).map((player: FootballRecord, i: number) => <Text key={`${player.player?.id}-${i}`} style={[styles.playerRow, { color: colors.text }]}>{player.player?.number ?? "—"}  {player.player?.name ?? "Player"} <Text style={{ color: colors.textMuted }}>· {player.player?.pos ?? ""}</Text></Text>)}{(lineup.substitutes ?? []).length ? <Text style={[styles.lineupCaption, { color: colors.textMuted, marginTop: 12 }]}>SUBSTITUTES</Text> : null}{(lineup.substitutes ?? []).map((player: FootballRecord, i: number) => <Text key={`${player.player?.id}-${i}`} style={[styles.playerRow, { color: colors.text }]}>{player.player?.number ?? "—"}  {player.player?.name ?? "Player"}</Text>)}</View>)}</View> : null}
          {!eventRows.length && !statRows.length && !lineupRows.length ? (
            events.loading || statistics.loading || lineups.loading
              ? <DataNotice loading />
              : <DataNotice error={events.error ?? statistics.error ?? lineups.error} onRetry={() => { void events.refresh(); void statistics.refresh(); void lineups.refresh(); }} emptyText={!events.error && !statistics.error && !lineups.error ? "No match panels returned" : undefined} />
          ) : null}
        </>
      ) : null}
    </ScreenFrame>
  );
}

export function FootballTeamScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const teamQuery = useFootballQuery<FootballRecord>(`football:team:${id}`, "team", { id }, !!id);
  const fixtures = useFootballQuery<FootballRecord>(`football:team-fixtures:${id}`, "teamFixtures", { team: id, last: 10 }, !!id);
  const follows = useFollows();
  const teamRecord = teamQuery.result?.response?.[0];
  const team = teamRecord?.team ?? teamRecord;
  const isFollowing = (follows.data ?? []).some((follow) => follow.entity_type === "team" && follow.entity_id === String(id));
  const { colors, pitch, green } = usePalette();
  return (
    <ScreenFrame title={team?.name ?? "Team"} eyebrow={team?.country ?? "Club profile"} action={team ? <View style={{ flexDirection: "row", gap: 7 }}><ShareEntityButton name={team.name ?? "Team"} path={`/football/team/${id}`} title="Share team" /><FollowButton item={team} entityType="team" isFollowing={isFollowing} /></View> : undefined}>
      <DataNotice error={teamQuery.error} warning={recordWarning(teamQuery.result, fixtures.result)} loading={teamQuery.loading} stale={teamQuery.isStale || !!teamQuery.result?.stale} onRetry={() => void teamQuery.refresh()} emptyText={!teamQuery.error && !teamQuery.loading && !team ? "Team details unavailable" : undefined} />
      {team ? <View style={[styles.profileHero, { backgroundColor: pitch }]}><Logo uri={team.logo} label={team.name} size={76} /><View style={{ flex: 1 }}><Text style={[styles.profileName, { color: colors.text }]}>{team.name}</Text><Text style={[styles.muted, { color: colors.textMuted, marginTop: 4 }]}>{[team.country, team.founded, team.venue?.name].filter(Boolean).join(" · ")}</Text></View></View> : null}
      <SectionTitle title="Fixtures" note="Matches returned for this team." />
      <DataNotice error={fixtures.error} loading={fixtures.loading} stale={fixtures.isStale || !!fixtures.result?.stale} onRetry={() => void fixtures.refresh()} emptyText={!fixtures.error && !fixtures.loading && !(fixtures.result?.response?.length) ? "No team fixtures available" : undefined} />
      {fixtureItems(fixtures.result?.response ?? []).map((item) => <FixtureRow key={String(item.fixture?.id)} item={item} />)}
    </ScreenFrame>
  );
}

export function FootballLeagueScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const competition = useFootballQuery<FootballRecord>(`football:competition:${id}`, "competitions", { id }, !!id);
  const followQuery = useFollows();
  const competitionRecord = competition.result?.response?.find((row) => String((row.league ?? row).id) === String(id)) ?? competition.result?.response?.[0];
  const league = competitionRecord?.league ?? competitionRecord;
  const season = league?.season
    ?? league?.seasons?.find((candidate: FootballRecord) => candidate.current)?.year
    ?? new Date().getFullYear();
  const fixtures = useFootballQuery<FootballRecord>(`football:league-fixtures:${id}:${season}`, "fixtures", { league: id, season });
  const standings = useFootballQuery<FootballRecord>(`football:standings:${id}:${season}`, "standings", { league: id, season });
  const isFollowing = (followQuery.data ?? []).some((follow) => follow.entity_type === "league" && follow.entity_id === String(id));
  const standingsRows: FootballRecord[] = standings.result?.response?.[0]?.league?.standings?.flat?.() ?? [];
  const { colors, pitch, green } = usePalette();
  return (
    <ScreenFrame title={league?.name ?? "Competition"} eyebrow={league?.country ?? "Competition"} action={league ? <View style={{ flexDirection: "row", gap: 7 }}><ShareEntityButton name={league.name ?? "Competition"} path={`/football/league/${id}`} title="Share competition" /><FollowButton item={league} entityType="league" isFollowing={isFollowing} /></View> : undefined}>
      <DataNotice error={competition.error} warning={recordWarning(competition.result, fixtures.result, standings.result)} loading={competition.loading} stale={competition.isStale || !!competition.result?.stale} onRetry={() => void competition.refresh()} emptyText={!competition.error && !competition.loading && !league ? "Competition details unavailable" : undefined} />
      {league ? <View style={[styles.profileHero, { backgroundColor: pitch }]}><Logo uri={league.logo} label={league.name} size={68} /><View style={{ flex: 1 }}><Text style={[styles.profileName, { color: colors.text }]}>{league.name}</Text><Text style={[styles.muted, { color: colors.textMuted, marginTop: 4 }]}>{[league.country, season, league.round].filter(Boolean).join(" · ")}</Text></View><Ionicons name="trophy-outline" size={24} color={green} /></View> : null}
      <SectionTitle title="Fixtures" note="Competition schedule returned by the provider." />
      <DataNotice error={fixtures.error} loading={fixtures.loading} stale={fixtures.isStale || !!fixtures.result?.stale} onRetry={() => void fixtures.refresh()} emptyText={!fixtures.error && !fixtures.loading && !(fixtures.result?.response?.length) ? "No competition fixtures available" : undefined} />
      {fixtureItems(fixtures.result?.response ?? []).map((item) => <FixtureRow key={String(item.fixture?.id)} item={item} />)}
      {standingsRows.length ? <View style={[styles.panel, { backgroundColor: colors.surface }]}><SectionTitle title="Standings" note="Official table rows available from the provider." /><View style={styles.tableHeader}><Text style={[styles.tableHead, { color: colors.textMuted, width: 28 }]}>#</Text><Text style={[styles.tableHead, { color: colors.textMuted, flex: 1 }]}>TEAM</Text><Text style={[styles.tableHead, { color: colors.textMuted, width: 36, textAlign: "right" }]}>PL</Text><Text style={[styles.tableHead, { color: colors.textMuted, width: 39, textAlign: "right" }]}>GD</Text><Text style={[styles.tableHead, { color: green, width: 38, textAlign: "right" }]}>PTS</Text></View>{standingsRows.map((row, index) => <Pressable key={`${row.team?.id}-${index}`} onPress={() => safeRouter.push(`/football/team/${row.team?.id}`)} style={styles.tableRow}><Text style={[styles.tableRank, { color: colors.textMuted }]}>{row.rank}</Text><View style={styles.tableTeam}><Logo uri={row.team?.logo} label={row.team?.name} size={24} /><Text numberOfLines={1} style={[styles.tableTeamName, { color: colors.text }]}>{row.team?.name}</Text></View><Text style={[styles.tableStat, { color: colors.textSecondary }]}>{row.all?.played ?? "—"}</Text><Text style={[styles.tableStat, { color: colors.textSecondary }]}>{row.goalsDiff ?? "—"}</Text><Text style={[styles.tablePoints, { color: green }]}>{row.points ?? "—"}</Text></Pressable>)}</View> : standings.error ? <DataNotice error={standings.error} onRetry={() => void standings.refresh()} /> : standings.loading ? <DataNotice loading /> : null}
    </ScreenFrame>
  );
}

export function FootballSearchScreen() {
  const params = useLocalSearchParams<{ q?: string; type?: string }>();
  const initialQuery = Array.isArray(params.q) ? params.q[0] : params.q ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [submitted, setSubmitted] = useState(initialQuery);
  const [category, setCategory] = useState<"all" | "teams" | "competitions" | "players">("all");
  const search = submitted.trim();
  const teams = useFootballQuery<FootballRecord>(`football:search-teams:${search}`, "searchTeams", { search }, search.length >= 2 && (category === "all" || category === "teams"));
  const leagues = useFootballQuery<FootballRecord>(`football:search-leagues:${search}`, "searchCompetitions", { search }, search.length >= 2 && (category === "all" || category === "competitions"));
  const players = useFootballQuery<FootballRecord>(`football:search-players:${search}`, "searchPlayers", { search }, search.length >= 2 && (category === "all" || category === "players"));
  const { colors } = usePalette();
  const busy = teams.loading || leagues.loading || players.loading;
  const teamRows = teams.result?.response ?? [];
  const leagueRows = leagues.result?.response ?? [];
  const playerRows = players.result?.response ?? [];
  const allEmpty = search.length >= 2 && !busy && !teamRows.length && !leagueRows.length && !playerRows.length;

  function submit() {
    setSubmitted(query.trim());
  }

  return (
    <ScreenFrame title="Find your football" eyebrow="AfuFootball">
      <View style={[styles.searchBox, { backgroundColor: colors.surface }]}>
        <Ionicons name="search" size={19} color={colors.textMuted} />
        <TextInput value={query} onChangeText={setQuery} onSubmitEditing={submit} placeholder="Team, competition or player" placeholderTextColor={colors.textMuted} returnKeyType="search" style={[styles.searchInput, { color: colors.text }]} accessibilityLabel="Search football" />
        {query.length > 0 ? <Pressable onPress={() => { setQuery(""); setSubmitted(""); }} hitSlop={8}><Ionicons name="close-circle" size={18} color={colors.textMuted} /></Pressable> : null}
        <Pressable onPress={submit} style={[styles.searchSubmit, { backgroundColor: colors.accent }]} accessibilityRole="button"><Ionicons name="arrow-forward" size={17} color="#FFFFFF" /></Pressable>
      </View>
      <View style={styles.filterRow}>{(["all", "teams", "competitions", "players"] as const).map((item) => <Pressable key={item} onPress={() => setCategory(item)} style={[styles.filterPill, { backgroundColor: category === item ? colors.accent : colors.surface }]}><Text style={{ color: category === item ? "#FFFFFF" : colors.textSecondary, fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" }}>{item}</Text></Pressable>)}</View>
      {!search ? <View style={[styles.emptyCard, { backgroundColor: colors.surface }]}><View style={[styles.emptyMark, { backgroundColor: colors.backgroundTertiary }]}><Ionicons name="search" size={21} color={colors.accent} /></View><Text style={[styles.cardTitle, { color: colors.text }]}>Search the provider index</Text><Text style={[styles.muted, { color: colors.textMuted, textAlign: "center", marginTop: 5 }]}>Search returns real teams, competitions and players from the connected football provider.</Text></View> : null}
      {busy ? <DataNotice loading /> : null}
      {teams.error || leagues.error || players.error ? <DataNotice error={teams.error ?? leagues.error ?? players.error} onRetry={() => { void teams.refresh(); void leagues.refresh(); void players.refresh(); }} /> : null}
      {allEmpty ? <DataNotice warning={recordWarning(teams.result, leagues.result, players.result)} emptyText="No matching provider results" /> : null}
      {search.length >= 2 && teamRows.length > 0 && (category === "all" || category === "teams") ? <><SectionTitle title="Teams" />{teamRows.map((item, index) => <TeamListRow key={String((item.team ?? item).id ?? index)} item={item} onPress={() => safeRouter.push(`/football/team/${(item.team ?? item).id}`)} />)}</> : null}
      {search.length >= 2 && leagueRows.length > 0 && (category === "all" || category === "competitions") ? <><SectionTitle title="Competitions" />{leagueRows.map((item, index) => <CompetitionRow key={String((item.league ?? item).id ?? index)} item={item} onPress={() => safeRouter.push(`/football/league/${(item.league ?? item).id}`)} />)}</> : null}
      {search.length >= 2 && playerRows.length > 0 && (category === "all" || category === "players") ? <><SectionTitle title="Players" note="Player profiles are not available in this version." />{playerRows.map((item, index) => { const player = item.player ?? item; return <View key={String(player.id ?? index)} style={[styles.resultRow, { backgroundColor: colors.surface }]}><Logo uri={player.photo} label={player.name} size={43} /><View style={{ flex: 1 }}><Text style={[styles.cardTitle, { color: colors.text }]}>{player.name ?? "Player"}</Text><Text style={[styles.muted, { color: colors.textMuted, marginTop: 3 }]}>{[item.statistics?.[0]?.team?.name, item.statistics?.[0]?.league?.name].filter(Boolean).join(" · ") || "Provider player result"}</Text></View></View>; })}</> : null}
      <DataNotice warning={recordWarning(teams.result, leagues.result, players.result)} stale={teams.isStale || leagues.isStale || players.isStale} onRetry={() => { void teams.refresh(); void leagues.refresh(); void players.refresh(); }} />
    </ScreenFrame>
  );
}

export function FootballSettingsScreen() {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const preferencesQuery = useQueryCache<{ value: FootballNotificationPreferences | null; error: string | null }>(
    "football:notification-preferences",
    async () => {
      try { return { value: await getFootballNotificationPreferences(), error: null }; }
      catch (error) { return { value: null, error: error instanceof Error ? error.message : "Could not load saved preferences." }; }
    },
    { ttlMs: 120_000 },
  );
  const [preferences, setPreferences] = useState(DEFAULT_FOOTBALL_NOTIFICATION_PREFERENCES);
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (!preferencesQuery.data?.value || initialized) return;
    setPreferences({
      kickoff: preferencesQuery.data.value.kickoff,
      goals: preferencesQuery.data.value.goals,
      half_time: preferencesQuery.data.value.half_time,
      full_time: preferencesQuery.data.value.full_time,
      followed_teams: preferencesQuery.data.value.followed_teams,
    });
    setInitialized(true);
  }, [preferencesQuery.data, initialized]);
  const { colors, pitch, green } = usePalette();

  async function savePreferences() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await saveFootballNotificationPreferences(preferences);
      queryCacheInvalidate("football:notification-preferences");
      setSaved(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save notification preferences.");
    } finally {
      setSaving(false);
    }
  }

  const options: Array<{ key: keyof typeof preferences; title: string; detail: string }> = [
    { key: "kickoff", title: "Kick-off reminders", detail: "Preference for reminders before a match starts." },
    { key: "goals", title: "Goals", detail: "Preference for goal event alerts." },
    { key: "half_time", title: "Half-time", detail: "Preference for the half-time update." },
    { key: "full_time", title: "Full-time", detail: "Preference for the final whistle update." },
    { key: "followed_teams", title: "Followed teams", detail: "Preference for updates from teams you follow." },
  ];

  return (
    <ScreenFrame title="Football settings" eyebrow="Your matchday">
      <View style={[styles.settingsIntro, { backgroundColor: pitch }]}><Ionicons name="notifications-outline" size={22} color={green} /><View style={{ flex: 1 }}><Text style={[styles.cardTitle, { color: colors.text }]}>Choose what matters</Text><Text style={[styles.muted, { color: colors.textMuted, marginTop: 4 }]}>These preferences are saved to your AfuFootball profile. Delivery depends on supported notification services.</Text></View></View>
      {preferencesQuery.loading ? <DataNotice loading /> : null}
      {preferencesQuery.data?.error ? <DataNotice error={preferencesQuery.data.error} onRetry={() => { queryCacheInvalidate("football:notification-preferences"); void preferencesQuery.refresh(); }} /> : null}
      <View style={[styles.settingsGroup, { backgroundColor: colors.surface }]}>
        {options.map((option, index) => (
          <View key={option.key} style={[styles.settingRow, index < options.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.backgroundTertiary }]}>
            <View style={{ flex: 1, paddingRight: 12 }}><Text style={[styles.cardTitle, { color: colors.text }]}>{option.title}</Text><Text style={[styles.muted, { color: colors.textMuted, marginTop: 4 }]}>{option.detail}</Text></View>
            <Switch value={preferences[option.key]} onValueChange={(value) => { setPreferences((current) => ({ ...current, [option.key]: value })); setSaved(false); }} trackColor={{ false: colors.backgroundTertiary, true: green }} thumbColor="#F7F4ED" accessibilityLabel={option.title} />
          </View>
        ))}
      </View>
      {saveError ? <Text style={[styles.errorText, { color: colors.error }]}>{saveError}</Text> : null}
      {saved ? <View style={[styles.savedMessage, { backgroundColor: `${green}18` }]}><Ionicons name="checkmark-circle" size={17} color={green} /><Text style={{ color: colors.textSecondary, flex: 1, fontSize: 13 }}>Preferences saved. This does not confirm push delivery.</Text></View> : null}
      <Pressable onPress={savePreferences} disabled={saving} style={[styles.primaryButton, { backgroundColor: colors.accent, marginTop: 16, opacity: saving ? 0.7 : 1 }]}>{saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Save preferences</Text>}</Pressable>
    </ScreenFrame>
  );
}

export type { FootballRecord };

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: "100%" },
  topRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 18, marginBottom: 17 },
  backButton: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#102B4B" },
  roundButton: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  eyebrow: { fontSize: 10, letterSpacing: 1.4, fontFamily: "Inter_700Bold", marginBottom: 4 },
  screenTitle: { fontSize: 20, letterSpacing: -0.3, fontFamily: "Inter_700Bold" },
  brandHeader: { minHeight: 58, flexDirection: "row", alignItems: "center", paddingHorizontal: 20, gap: 8, marginBottom: 8 },
  brandIdentity: { flex: 1, flexDirection: "row", alignItems: "center", gap: 9 },
  brandMark: { width: 37, height: 37, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "#087FE8", borderWidth: 2, borderColor: "#6AC0FF" },
  brandName: { color: "#FFFFFF", fontSize: 21, letterSpacing: -0.7, fontFamily: "Inter_700Bold" },
  headerIconButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  heroImage: { alignSelf: "stretch", height: 142, marginHorizontal: 9, marginBottom: 11, borderRadius: 19, overflow: "hidden", backgroundColor: "#0B3768" },
  heroImagePhoto: { width: "100%", height: "100%", borderRadius: 19 },
  sectionTabs: { flexDirection: "row", alignItems: "center", marginHorizontal: 9, marginBottom: 13, borderRadius: 17, padding: 4, gap: 4, backgroundColor: "#0D2746" },
  sectionTab: { flex: 1, minWidth: 69, minHeight: 48, flexDirection: "column", gap: 3, alignItems: "center", justifyContent: "center", borderRadius: 13 },
  sectionTabActive: { backgroundColor: "#0788F8" },
  sectionTabText: { fontSize: 9.5, fontFamily: "Inter_600SemiBold" },
  sectionHeading: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, marginTop: 15, marginBottom: 10, gap: 10 },
  sectionTitle: { fontSize: 18, letterSpacing: -0.3, fontFamily: "Inter_700Bold" },
  headerLink: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#102B4B" },
  muted: { fontSize: 12, lineHeight: 17, fontFamily: "Inter_400Regular" },
  notice: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 16, marginBottom: 9, borderRadius: 18, padding: 15 },
  skeleton: { borderRadius: 8 },
  connectionCard: { flexDirection: "row", gap: 12, marginHorizontal: 16, marginBottom: 10, borderRadius: 19, padding: 16 },
  connectionIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  retryButton: { alignSelf: "flex-start", paddingVertical: 7, paddingHorizontal: 11, borderRadius: 10, marginTop: 10 },
  retryText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  warningStrip: { marginHorizontal: 16, marginBottom: 9, padding: 12, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 8 },
  warningText: { fontSize: 12, lineHeight: 17, flex: 1 },
  staleStrip: { marginHorizontal: 16, marginBottom: 9, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  emptyCard: { marginHorizontal: 16, borderRadius: 20, alignItems: "center", paddingVertical: 22, paddingHorizontal: 21, marginBottom: 10 },
  emptyMark: { width: 46, height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  liveMatchWrap: { marginHorizontal: 9, marginBottom: 12, borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: "rgba(92,177,255,0.55)" },
  liveMatchCard: { minHeight: 169, paddingHorizontal: 15, paddingTop: 13, paddingBottom: 12, justifyContent: "space-between" },
  liveMatchHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  liveNowPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12, backgroundColor: "rgba(8,196,124,0.18)" },
  liveNowText: { color: "#FFFFFF", fontSize: 9, letterSpacing: 0.6, fontFamily: "Inter_700Bold" },
  liveLeague: { flex: 1, color: "#E8F4FF", textAlign: "right", fontSize: 10, fontFamily: "Inter_600SemiBold" },
  liveScoreRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 7, marginTop: 11 },
  liveTeam: { flex: 1, minWidth: 0, alignItems: "center", gap: 5 },
  liveTeamName: { width: "100%", color: "#FFFFFF", textAlign: "center", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  liveScore: { color: "#FFFFFF", fontSize: 28, fontFamily: "Inter_700Bold" },
  liveMinute: { minWidth: 38, alignItems: "center", paddingHorizontal: 7, paddingVertical: 5, borderRadius: 8, backgroundColor: "#168AF6" },
  liveMinuteText: { color: "#FFFFFF", fontSize: 10, fontFamily: "Inter_700Bold" },
  liveMatchAction: { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 12, backgroundColor: "rgba(3,19,40,0.48)" },
  liveMatchActionText: { color: "#FFFFFF", fontSize: 10, fontFamily: "Inter_600SemiBold" },
  liveSkeleton: { minHeight: 144, marginHorizontal: 9, marginBottom: 12, borderRadius: 20, alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#0A315A" },
  liveSkeletonText: { color: "#D5E5F6", fontSize: 12, fontFamily: "Inter_500Medium" },
  noLiveCard: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 11, marginHorizontal: 9, marginBottom: 12, paddingHorizontal: 14, borderRadius: 17, backgroundColor: "#102B4B" },
  noLiveIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#153D68" },
  noLiveTitle: { color: "#FFFFFF", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  noLiveSubtitle: { color: "#A6B8CD", fontSize: 11, marginTop: 3, fontFamily: "Inter_400Regular" },
  quickActionRow: { flexDirection: "row", gap: 8, paddingHorizontal: 9, paddingBottom: 13 },
  quickActionTile: { width: 72, minHeight: 70, alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 15, backgroundColor: "#102B4B" },
  quickActionLabel: { color: "#E6EFF9", textAlign: "center", fontSize: 9, lineHeight: 12, fontFamily: "Inter_600SemiBold" },
  homeSectionCard: { marginHorizontal: 9, marginBottom: 10, paddingHorizontal: 15, paddingTop: 14, paddingBottom: 9, borderRadius: 18, backgroundColor: "#F8FAFD" },
  homeCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 },
  homeCardHeading: { flex: 1, flexDirection: "row", alignItems: "center", gap: 9 },
  homeCardIcon: { width: 31, height: 31, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#E8F3FF" },
  homeCardTitle: { color: "#10203A", fontSize: 14, letterSpacing: -0.2, fontFamily: "Inter_700Bold" },
  seeAllButton: { flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 6, paddingLeft: 6 },
  seeAllText: { color: "#087FE8", fontSize: 11, fontFamily: "Inter_700Bold" },
  homeInlineState: { minHeight: 57, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  homeInlineText: { color: "#687A90", paddingVertical: 14, fontSize: 12, fontFamily: "Inter_500Medium" },
  homeFixtureRow: { minHeight: 60, flexDirection: "row", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#DCE6F1" },
  homeFixtureMatch: { flex: 1, minWidth: 0, minHeight: 59, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 5 },
  homeFixtureTeam: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 5 },
  homeFixtureTeamName: { flex: 1, minWidth: 0, color: "#172942", fontSize: 10, fontFamily: "Inter_600SemiBold" },
  homeFixtureTime: { minWidth: 49, alignItems: "center" },
  homeFixtureKickoff: { color: "#162941", fontSize: 12, fontFamily: "Inter_700Bold" },
  homeFixtureDate: { color: "#748197", fontSize: 9, marginTop: 2, fontFamily: "Inter_400Regular" },
  matchReminderButton: { width: 34, height: 42, marginLeft: 5, alignItems: "center", justifyContent: "center" },
  competitionTiles: { gap: 7, paddingTop: 2, paddingBottom: 2 },
  competitionTile: { width: 66, minHeight: 76, alignItems: "center", justifyContent: "center", gap: 5, padding: 6, borderRadius: 13, backgroundColor: "#EAF3FC" },
  competitionTileName: { color: "#243A55", textAlign: "center", fontSize: 9, lineHeight: 11, fontFamily: "Inter_600SemiBold" },
  fixtureRow: { marginHorizontal: 16, marginBottom: 8, padding: 13, borderRadius: 16 },
  fixtureMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 9 },
  leagueMeta: { flex: 1, fontSize: 10, fontFamily: "Inter_600SemiBold" },
  statusLine: { flexDirection: "row", alignItems: "center", gap: 5 },
  statusText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  fixtureTeams: { gap: 7 },
  teamLine: { flexDirection: "row", alignItems: "center", gap: 9 },
  teamName: { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  score: { fontSize: 15, minWidth: 18, textAlign: "right", fontFamily: "Inter_700Bold" },
  fixtureArrow: { position: "absolute", right: 12, bottom: 13, width: 25, height: 25, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  dateStepper: { flexDirection: "row", alignItems: "center", gap: 4 },
  stepButton: { width: 31, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#102B4B" },
  dateLabel: { paddingHorizontal: 9, paddingVertical: 8, borderRadius: 10, backgroundColor: "#102B4B" },
  dateLabelText: { color: "#FFFFFF", fontSize: 10, fontFamily: "Inter_600SemiBold" },
  competitionRow: { marginHorizontal: 16, marginBottom: 8, borderRadius: 16, padding: 12, flexDirection: "row", alignItems: "center", gap: 11 },
  competitionMark: { width: 49, height: 49, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  resultRow: { marginHorizontal: 16, marginBottom: 8, borderRadius: 16, padding: 12, flexDirection: "row", alignItems: "center", gap: 11 },
  followButton: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 13, paddingHorizontal: 11, paddingVertical: 9 },
  followText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  primaryButton: { minHeight: 45, paddingHorizontal: 16, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  primaryButtonText: { color: "#FFFFFF", fontSize: 13, fontFamily: "Inter_700Bold" },
  scoreboard: { marginHorizontal: 16, padding: 18, borderRadius: 20, marginBottom: 17 },
  scoreboardMeta: { fontSize: 10, letterSpacing: 0.4, textAlign: "center", fontFamily: "Inter_700Bold" },
  scoreboardTeams: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20 },
  scoreboardTeam: { width: "28%", alignItems: "center", gap: 9 },
  scoreboardName: { fontSize: 12, textAlign: "center", fontFamily: "Inter_600SemiBold" },
  scoreCenter: { flex: 1, alignItems: "center" },
  scoreLarge: { fontSize: 33, letterSpacing: -1, fontFamily: "Inter_700Bold" },
  venueText: { textAlign: "center", fontSize: 11, marginTop: 18, fontFamily: "Inter_400Regular" },
  panel: { marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 15, borderRadius: 18 },
  eventRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(120,120,120,0.13)" },
  eventTime: { width: 34, fontSize: 12, fontFamily: "Inter_700Bold" },
  eventTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  statTeam: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  statRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(120,120,120,0.13)" },
  statValue: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  statName: { fontSize: 12, fontFamily: "Inter_400Regular" },
  lineupCaption: { fontSize: 10, letterSpacing: 1, marginTop: 13, marginBottom: 7, fontFamily: "Inter_700Bold" },
  playerRow: { paddingVertical: 5, fontSize: 12, fontFamily: "Inter_500Medium" },
  profileHero: { marginHorizontal: 16, marginBottom: 18, padding: 17, borderRadius: 19, flexDirection: "row", alignItems: "center", gap: 14 },
  profileName: { fontSize: 21, letterSpacing: -0.4, fontFamily: "Inter_700Bold" },
  tableHeader: { flexDirection: "row", alignItems: "center", marginTop: 13, paddingVertical: 9 },
  tableHead: { fontSize: 9, letterSpacing: 0.5, fontFamily: "Inter_700Bold" },
  tableRow: { flexDirection: "row", alignItems: "center", minHeight: 42, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(120,120,120,0.13)" },
  tableRank: { width: 28, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  tableTeam: { flex: 1, flexDirection: "row", alignItems: "center", gap: 7, minWidth: 0 },
  tableTeamName: { flex: 1, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  tableStat: { width: 36, textAlign: "right", fontSize: 11, fontFamily: "Inter_500Medium" },
  tablePoints: { width: 38, textAlign: "right", fontSize: 12, fontFamily: "Inter_700Bold" },
  searchBox: { marginHorizontal: 16, marginBottom: 10, minHeight: 51, borderRadius: 16, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 9 },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular" },
  searchSubmit: { width: 33, height: 33, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, paddingHorizontal: 16, marginBottom: 13 },
  filterPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  settingsIntro: { marginHorizontal: 16, marginBottom: 13, borderRadius: 18, padding: 15, flexDirection: "row", alignItems: "flex-start", gap: 11 },
  settingsGroup: { marginHorizontal: 16, borderRadius: 18, paddingHorizontal: 14 },
  settingRow: { minHeight: 72, flexDirection: "row", alignItems: "center", paddingVertical: 11 },
  errorText: { marginHorizontal: 18, marginTop: 10, fontSize: 12 },
  savedMessage: { marginHorizontal: 16, marginTop: 12, borderRadius: 14, padding: 11, flexDirection: "row", alignItems: "center", gap: 8 },
});

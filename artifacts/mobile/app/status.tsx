import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";

type ServiceStatus = "operational" | "degraded" | "outage";

interface ServiceCheck {
  name: string;
  status: ServiceStatus;
  latency_ms?: number;
  message?: string;
}

interface StatusResponse {
  overall: ServiceStatus;
  checked_at: string;
  services: ServiceCheck[];
}

const STATUS_CONFIG: Record<ServiceStatus, { color: string; icon: string; label: string }> = {
  operational: { color: "#22C55E", icon: "checkmark-circle", label: "Operational" },
  degraded:    { color: "#F59E0B", icon: "warning",           label: "Degraded"    },
  outage:      { color: "#EF4444", icon: "close-circle",      label: "Outage"      },
};

type HeroState = ServiceStatus | "unknown";

const OVERALL_CONFIG: Record<HeroState, { bg: string; text: string; title: string; sub: string; icon: string }> = {
  operational: {
    bg: "#16A34A", text: "#fff",
    title: "All Systems Operational",
    sub: "Everything is running smoothly.",
    icon: "checkmark-circle",
  },
  degraded: {
    bg: "#D97706", text: "#fff",
    title: "Partial System Degradation",
    sub: "Some features may be limited. We're working on it.",
    icon: "warning",
  },
  outage: {
    bg: "#DC2626", text: "#fff",
    title: "Service Disruption",
    sub: "We're aware of the issue and working to restore service.",
    icon: "close-circle",
  },
  unknown: {
    bg: "#4B5563", text: "#fff",
    title: "Status Unavailable",
    sub: "Could not reach the status server.",
    icon: "cloud-offline-outline",
  },
};

function formatLatency(ms?: number): string {
  if (ms === undefined) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatCheckedAt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

function ServiceRow({ svc, colors }: { svc: ServiceCheck; colors: any }) {
  const cfg = STATUS_CONFIG[svc.status];
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View style={[styles.serviceRow, { backgroundColor: colors.surface, opacity: fadeAnim }]}>
      <View style={[styles.statusDot, { backgroundColor: cfg.color }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.serviceName, { color: colors.text }]}>{svc.name}</Text>
        {svc.message && (
          <Text style={[styles.serviceMsg, { color: colors.textSecondary }]}>{svc.message}</Text>
        )}
      </View>
      <View style={{ alignItems: "flex-end", gap: 2 }}>
        <View style={[styles.statusBadge, { backgroundColor: cfg.color + "20", borderColor: cfg.color + "50" }]}>
          <Ionicons name={cfg.icon as any} size={12} color={cfg.color} />
          <Text style={[styles.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
        {svc.latency_ms !== undefined && (
          <Text style={[styles.latency, { color: colors.textMuted }]}>{formatLatency(svc.latency_ms)}</Text>
        )}
      </View>
    </Animated.View>
  );
}

export default function StatusPage() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const edgeFnBase = (process.env.EXPO_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "") + "/functions/v1";

  const fetchStatus = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch(`${edgeFnBase}/status`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const json: StatusResponse = await res.json();
      if (!Array.isArray(json?.services)) {
        throw new Error("Unexpected response from status service.");
      }
      setData(json);
      setError(null);
    } catch (e: any) {
      setError("Could not reach the status server. Check your internet connection.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [edgeFnBase]);

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(() => fetchStatus(), 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchStatus]);

  useEffect(() => {
    if (!data || data.overall === "operational") return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.6, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    ).start();
    return () => pulseAnim.stopAnimation();
  }, [data?.overall]);

  // If fetch failed and we have no cached data, show the "unknown" hero state.
  // Previously this defaulted to "operational" which caused the green banner and
  // the error card to appear simultaneously — two contradictory states at once.
  const overall: HeroState = data?.overall ?? (error && !data ? "unknown" : "operational");
  const overallCfg = OVERALL_CONFIG[overall];
  const isPulse = overall !== "operational" && overall !== "unknown";

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Hero banner */}
      <View style={[styles.hero, { backgroundColor: overallCfg.bg, paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={12}
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.heroContent}>
          {loading ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : (
            <>
              <Animated.View style={{ opacity: isPulse ? pulseAnim : 1 }}>
                <Ionicons
                  name={overallCfg.icon as any}
                  size={48}
                  color="#fff"
                  style={{ marginBottom: 12 }}
                />
              </Animated.View>
              <Text style={styles.heroTitle}>{overallCfg.title}</Text>
              <Text style={styles.heroSub}>{overallCfg.sub}</Text>
            </>
          )}
        </View>
        {data && (
          <Text style={styles.checkedAt}>
            Last checked · {formatCheckedAt(data.checked_at)}
          </Text>
        )}
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchStatus(true)}
            tintColor={colors.accent}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <View style={[styles.errorBox, { backgroundColor: colors.surface, borderColor: "#EF4444" + "40" }]}>
            <Ionicons name="wifi-outline" size={28} color="#EF4444" />
            <Text style={[styles.errorText, { color: colors.text }]}>{error}</Text>
            <TouchableOpacity
              style={[styles.retryBtn, { backgroundColor: colors.accent }]}
              onPress={() => fetchStatus()}
              activeOpacity={0.8}
            >
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>SERVICES</Text>

            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <View key={i} style={[styles.serviceRow, { backgroundColor: colors.surface }]}>
                    <View style={[styles.statusDot, { backgroundColor: colors.border }]} />
                    <View style={{ flex: 1, gap: 6 }}>
                      <View style={{ height: 14, width: 120, borderRadius: 4, backgroundColor: colors.border }} />
                      <View style={{ height: 11, width: 180, borderRadius: 4, backgroundColor: colors.border }} />
                    </View>
                  </View>
                ))
              : data?.services?.map((svc) => (
                  <ServiceRow key={svc.name} svc={svc} colors={colors} />
                ))
            }

            <Text style={[styles.sectionLabel, { color: colors.textMuted, marginTop: 28 }]}>ABOUT THIS PAGE</Text>
            <View style={[styles.infoBox, { backgroundColor: colors.surface }]}>
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                This page shows the real-time health of AfuChat's core services. It refreshes automatically every 30 seconds.
                {"\n\n"}
                If you see a degraded or outage status, our team is already aware and working to restore service as quickly as possible.
                {"\n\n"}
                For support, visit the Help & Support section in Settings.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.refreshRow, { borderColor: colors.border }]}
              onPress={() => fetchStatus(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh" size={16} color={colors.accent} />
              <Text style={[styles.refreshText, { color: colors.accent }]}>Refresh now</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: {
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  heroContent: {
    alignItems: "center",
    paddingVertical: 16,
    gap: 6,
  },
  heroTitle: {
    color: "#fff",
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  heroSub: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  checkedAt: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 8,
  },
  scroll: {
    padding: 16,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
    gap: 12,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  serviceName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  serviceMsg: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
    lineHeight: 16,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  latency: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  infoBox: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  infoText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  refreshRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 4,
  },
  refreshText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  errorBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 12,
    marginTop: 16,
  },
  errorText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 4,
  },
  retryBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});

import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { GlassMenuSection, GlassMenuItem, GlassMenuSeparator } from "@/components/ui/GlassMenuItem";

export default function PrivacySettingsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="Privacy" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 48 }]}
      >
        {/* ── ACCOUNT ──────────────────────────────────────────────────── */}
        <GlassMenuSection title="ACCOUNT">
          <GlassMenuItem
            icon="lock-closed"
            iconBg={["#007AFF", "#0055FF"]}
            label="Account Privacy"
            subtitle="Private account, online status, profile visibility"
            onPress={() => router.push("/settings/privacy-account" as any)}
          />
          <GlassMenuSeparator />
          <GlassMenuItem
            icon="eye-off"
            iconBg={["#5856D6", "#3D3BAA"]}
            label="Visibility"
            subtitle="Who can see your followers and following list"
            onPress={() => router.push("/settings/privacy-visibility" as any)}
          />
        </GlassMenuSection>

        {/* ── INTERACTIONS ─────────────────────────────────────────────── */}
        <GlassMenuSection title="INTERACTIONS">
          <GlassMenuItem
            icon="chatbubble-ellipses"
            iconBg={["#34C759", "#25A844"]}
            label="Messages"
            subtitle="Who can send you messages and calls"
            onPress={() => router.push("/settings/privacy-messages" as any)}
          />
          <GlassMenuSeparator />
          <GlassMenuItem
            icon="heart"
            iconBg={["#FF2D55", "#CC2244"]}
            label="Reactions & Tags"
            subtitle="Who can like, comment and tag you"
            onPress={() => router.push("/settings/privacy-interactions" as any)}
          />
        </GlassMenuSection>

        {/* ── SAFETY ───────────────────────────────────────────────────── */}
        <GlassMenuSection title="SAFETY">
          <GlassMenuItem
            icon="ban"
            iconBg={["#FF3B30", "#CC2B22"]}
            label="Blocked Users"
            subtitle="Manage accounts you have blocked"
            danger
            onPress={() => router.push("/settings/blocked")}
          />
          <GlassMenuSeparator />
          <GlassMenuItem
            icon="flag"
            iconBg={["#FF9500", "#CC7700"]}
            label="Restricted Accounts"
            subtitle="Limit interactions without blocking"
            onPress={() => router.push("/settings/privacy-restricted" as any)}
          />
        </GlassMenuSection>

        {/* ── DATA ─────────────────────────────────────────────────────── */}
        <GlassMenuSection title="DATA">
          <GlassMenuItem
            icon="analytics"
            iconBg={["#00BCD4", "#0097A7"]}
            label="Activity Data"
            subtitle="Manage how your activity is used"
            onPress={() => router.push("/settings/privacy-data" as any)}
          />
          <GlassMenuSeparator />
          <GlassMenuItem
            icon="cloud-download"
            iconBg={["#BF5AF2", "#9B3FD5"]}
            label="Download My Data"
            subtitle="Request a copy of your AfuChat data"
            onPress={() => router.push("/settings/privacy-download" as any)}
          />
        </GlassMenuSection>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 24, gap: 28 },
});

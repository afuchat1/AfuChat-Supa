import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "@/lib/haptics";
import { GlassHeader } from "@/components/ui/GlassHeader";

import Colors from "@/constants/colors";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { uploadToStorage } from "@/lib/mediaUpload";
import { showAlert } from "@/lib/alert";
import { isOnline } from "@/lib/offlineStore";
import { TIER_CHANNEL_LIMITS } from "@/lib/featureUsage";

const PURPLE = "#5856D6";

export default function CreateChannelScreen() {
  const { colors } = useTheme();
  const { user, subscription } = useAuth();

  const [channelName, setChannelName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [creating, setCreating] = useState(false);

  const descRef = useRef<TextInput>(null);

  async function pickAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showAlert("Permission required", "Please allow photo library access to set a channel photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
    }
  }

  async function createChannel() {
    if (!isOnline()) {
      showAlert("No internet", "Creating a channel requires an internet connection.");
      return;
    }
    if (!channelName.trim()) {
      showAlert("Channel name required", "Please enter a name for your channel.");
      return;
    }
    if (!user) return;

    const tier = (subscription?.plan_tier as keyof typeof TIER_CHANNEL_LIMITS) || "free";
    const limit = TIER_CHANNEL_LIMITS[tier] ?? 1;
    if (isFinite(limit)) {
      const { count } = await supabase
        .from("channels")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id);
      const current = count ?? 0;
      if (current >= limit) {
        const nextTier = tier === "free" ? "Silver" : tier === "silver" ? "Gold" : "Platinum";
        showAlert(
          "Channel limit reached",
          `You can create up to ${limit} channel${limit === 1 ? "" : "s"} on your current plan. Upgrade to ${nextTier} to broadcast to more audiences.`,
          [
            { text: `Upgrade to ${nextTier}`, onPress: () => router.push("/premium" as any) },
            { text: "OK" },
          ]
        );
        return;
      }
    }

    setCreating(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    let avatarUrl: string | null = null;
    if (avatarUri) {
      try {
        const ext = avatarUri.split(".").pop()?.split("?")[0]?.toLowerCase() ?? "jpg";
        const fileName = `channel-${user.id}-${Date.now()}.${ext}`;
        const { publicUrl } = await uploadToStorage(
          "group-avatars",
          `${user.id}/${fileName}`,
          avatarUri,
          `image/${ext === "png" ? "png" : "jpeg"}`
        );
        avatarUrl = publicUrl;
      } catch (_) {}
    }

    const { data: channel, error } = await supabase
      .from("channels")
      .insert({
        name: channelName.trim(),
        description: description.trim() || null,
        avatar_url: avatarUrl,
        owner_id: user.id,
        is_public: isPublic,
        subscriber_count: 0,
      })
      .select("id")
      .single();

    if (error || !channel) {
      showAlert("Error", "Could not create channel. Please try again.");
      setCreating(false);
      return;
    }

    await supabase
      .from("channel_subscriptions")
      .insert({ channel_id: channel.id, user_id: user.id });

    try {
      const { rewardXp } = await import("../../lib/rewardXp");
      rewardXp("channel_created");
    } catch (_) {}

    router.replace({ pathname: "/channel/[id]", params: { id: channel.id } });
    setCreating(false);
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <GlassHeader
        title="New Channel"
        onBack={() => router.back()}
        right={
          <TouchableOpacity
            onPress={createChannel}
            disabled={creating || !channelName.trim()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {creating ? (
              <ActivityIndicator color={PURPLE} size="small" />
            ) : (
              <Ionicons name="checkmark" size={24} color={channelName.trim() ? PURPLE : colors.textMuted} />
            )}
          </TouchableOpacity>
        }
      />

      <View style={[styles.nameSection, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.avatarBtn, { backgroundColor: avatarUri ? "transparent" : PURPLE }]}
          onPress={pickAvatar}
          activeOpacity={0.8}
        >
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarIconWrap}>
              <Ionicons name="camera" size={22} color="#fff" />
              <View style={styles.plusBadge}>
                <Ionicons name="add" size={10} color="#fff" />
              </View>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.nameInputWrap}>
          <TextInput
            style={[styles.nameInput, { color: colors.text, borderBottomColor: PURPLE }]}
            placeholder="Channel name"
            placeholderTextColor={colors.textMuted}
            value={channelName}
            onChangeText={setChannelName}
            autoFocus
            returnKeyType="next"
            onSubmitEditing={() => descRef.current?.focus()}
          />
        </View>
      </View>

      <View style={[styles.descSection, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TextInput
          ref={descRef}
          style={[styles.descInput, { color: colors.text }]}
          placeholder="Description (optional)"
          placeholderTextColor={colors.textMuted}
          value={description}
          onChangeText={setDescription}
          multiline
          returnKeyType="done"
          blurOnSubmit
        />
      </View>

      <TouchableOpacity
        style={[styles.visibilityRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
        onPress={() => setIsPublic((v) => !v)}
        activeOpacity={0.75}
      >
        <View style={styles.visibilityLeft}>
          <Ionicons
            name={isPublic ? "globe-outline" : "lock-closed-outline"}
            size={20}
            color={isPublic ? PURPLE : colors.textMuted}
          />
          <View>
            <Text style={[styles.visibilityTitle, { color: colors.text }]}>
              {isPublic ? "Public Channel" : "Private Channel"}
            </Text>
            <Text style={[styles.visibilitySub, { color: colors.textMuted }]}>
              {isPublic
                ? "Anyone can find and subscribe"
                : "Only people with the link can subscribe"}
            </Text>
          </View>
        </View>
        <View
          style={[
            styles.visibilityToggle,
            { backgroundColor: isPublic ? PURPLE : colors.border },
          ]}
        >
          <View
            style={[
              styles.visibilityThumb,
              { transform: [{ translateX: isPublic ? 18 : 0 }] },
            ]}
          />
        </View>
      </TouchableOpacity>

      <View style={[styles.tipCard, { backgroundColor: PURPLE + "0E", marginHorizontal: 14, marginTop: 14, borderRadius: 14, borderWidth: 1, borderColor: PURPLE + "30", padding: 14 }]}>
        <Ionicons name="megaphone-outline" size={16} color={PURPLE} />
        <Text style={[styles.tipText, { color: PURPLE }]}>
          As the channel owner, only you can post broadcasts. Subscribers can like and comment on your posts.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  nameSection: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatarBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: { width: 64, height: 64, borderRadius: 32 },
  avatarIconWrap: { alignItems: "center", justifyContent: "center" },
  plusBadge: {
    position: "absolute",
    bottom: -8,
    right: -8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.brand,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  nameInputWrap: {
    flex: 1,
    paddingBottom: 6,
  },
  nameInput: {
    flex: 1,
    fontSize: 17,
    fontFamily: "Inter_400Regular",
    padding: 0,
    borderBottomWidth: 1.5,
    paddingBottom: 6,
  },

  descSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  descInput: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    minHeight: 60,
    padding: 0,
  },

  visibilityRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  visibilityLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  visibilityTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  visibilitySub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  visibilityToggle: {
    width: 42,
    height: 24,
    borderRadius: 12,
    padding: 3,
    justifyContent: "center",
  },
  visibilityThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#fff",
  },

  tipCard: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  tipText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
});

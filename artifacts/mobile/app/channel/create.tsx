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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "@/lib/haptics";

import Colors from "@/constants/colors";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { uploadToStorage } from "@/lib/mediaUpload";
import { showAlert } from "@/lib/alert";
import { PremiumGate } from "@/components/ui/PremiumGate";
import { isOnline } from "@/lib/offlineStore";

export default function CreateChannelScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [channelName, setChannelName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
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

    setCreating(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    let avatarUrl: string | null = null;

    if (avatarUri) {
      const ext = avatarUri.split(".").pop()?.split("?")[0]?.toLowerCase() ?? "jpg";
      const fileName = `channel-${user.id}-${Date.now()}.${ext}`;
      const { publicUrl } = await uploadToStorage("group-avatars", `${user.id}/${fileName}`, avatarUri, `image/${ext === "png" ? "png" : "jpeg"}`);
      avatarUrl = publicUrl;
    }

    const { data: chat, error } = await supabase
      .from("chats")
      .insert({
        name: channelName.trim(),
        description: description.trim() || null,
        is_group: false,
        is_channel: true,
        avatar_url: avatarUrl,
        created_by: user.id,
        user_id: user.id,
      })
      .select()
      .single();

    if (error || !chat) {
      const { data: chat2, error: error2 } = await supabase
        .from("chats")
        .insert({
          name: channelName.trim(),
          is_group: true,
          avatar_url: avatarUrl,
          created_by: user.id,
          user_id: user.id,
        })
        .select()
        .single();

      if (error2 || !chat2) {
        showAlert("Error", "Could not create channel. Please try again.");
        setCreating(false);
        return;
      }

      await supabase.from("chat_members").insert({
        chat_id: chat2.id,
        user_id: user.id,
        is_admin: true,
      });

      try { const { rewardXp } = await import("../../lib/rewardXp"); rewardXp("channel_created"); } catch (_) {}
      router.replace({ pathname: "/chat/[id]", params: { id: chat2.id } });
      setCreating(false);
      return;
    }

    await supabase.from("chat_members").insert({
      chat_id: chat.id,
      user_id: user.id,
      is_admin: true,
    });

    try { const { rewardXp } = await import("../../lib/rewardXp"); rewardXp("channel_created"); } catch (_) {}
    router.replace({ pathname: "/chat/[id]", params: { id: chat.id } });
    setCreating(false);
  }

  return (
    <PremiumGate
      tier="platinum"
      title="Create a Channel"
      description="Broadcast channels are a Platinum-only feature. Upgrade to reach your audience at scale."
    >
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior="padding"
    >
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>New Channel</Text>
        <TouchableOpacity
          onPress={createChannel}
          disabled={creating || !channelName.trim()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {creating ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : (
            <Ionicons
              name="checkmark"
              size={24}
              color={channelName.trim() ? colors.accent : colors.textMuted}
            />
          )}
        </TouchableOpacity>
      </View>

      <View style={[styles.nameSection, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={[styles.avatarBtn, { backgroundColor: colors.accent }]} onPress={pickAvatar} activeOpacity={0.8}>
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
            style={[styles.nameInput, { color: colors.text, borderBottomColor: colors.accent }]}
            placeholder="Channel name"
            placeholderTextColor={colors.textMuted}
            value={channelName}
            onChangeText={setChannelName}
            autoFocus
            returnKeyType="next"
            onSubmitEditing={() => descRef.current?.focus()}
          />
          <TouchableOpacity style={styles.emojiBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="happy-outline" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.descSection, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TextInput
          ref={descRef}
          style={[styles.descInput, { color: colors.text, borderBottomColor: colors.border }]}
          placeholder="Description"
          placeholderTextColor={colors.textMuted}
          value={description}
          onChangeText={setDescription}
          multiline
          returnKeyType="done"
          blurOnSubmit
        />
        <Text style={[styles.descHint, { color: colors.textMuted }]}>
          You can provide an optional description for your channel.
        </Text>
      </View>
    </KeyboardAvoidingView>
    </PremiumGate>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },

  nameSection: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 16,
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
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 6,
  },
  nameInput: {
    flex: 1,
    fontSize: 17,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  emojiBtn: { paddingLeft: 8 },

  descSection: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    gap: 10,
  },
  descInput: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    paddingBottom: 8,
    minHeight: 36,
    color: "inherit",
    padding: 0,
  },
  descHint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
});

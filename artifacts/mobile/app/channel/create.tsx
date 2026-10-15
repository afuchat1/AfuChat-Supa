import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
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
import { GlassHeader } from "@/components/ui/GlassHeader";

import Colors from "@/constants/colors";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { uploadToStorage } from "@/lib/mediaUpload";
import { showAlert } from "@/lib/alert";
import { isOnline } from "@/lib/offlineStore";
import { TIER_CHANNEL_LIMITS } from "@/lib/featureUsage";
import { checkPublicChatUsername } from "@/lib/usernameAvailability";

const PURPLE = "#5856D6";
type HandleStatus = "idle" | "checking" | "available" | "taken" | "invalid_format" | "error";

export default function CreateChannelScreen() {
  const { colors } = useTheme();
  const { user, subscription } = useAuth();

  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const [channelName, setChannelName] = useState("");
  const [channelHandle, setChannelHandle] = useState("");
  const [description, setDescription] = useState("");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [handleStatus, setHandleStatus] = useState<HandleStatus>("idle");
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  const descRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!isPublic) {
      setHandleStatus("idle");
      return;
    }
    const normalized = channelHandle.trim().toLowerCase();
    if (!normalized) {
      setHandleStatus("idle");
      return;
    }
    if (normalized.length < 3) {
      setHandleStatus("invalid_format");
      return;
    }
    let active = true;
    setHandleStatus("checking");
    const timer = setTimeout(() => {
      void checkPublicChatUsername(normalized).then((result) => {
        if (active) setHandleStatus(result?.status ?? "error");
      });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [channelHandle, isPublic]);

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
    const normalizedHandle = channelHandle.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (isPublic && !normalizedHandle) {
      showAlert("Username required", "Public channels need a username so people can find and share them.");
      return;
    }
    if (normalizedHandle && normalizedHandle.length < 3) {
      showAlert("Username too short", "Channel usernames must be at least 3 characters.");
      return;
    }
    if (isPublic) {
      const availability = await checkPublicChatUsername(normalizedHandle);
      if (!availability || availability.status !== "available") {
        showAlert(
          availability?.status === "invalid_format" ? "Invalid username" : "Username unavailable",
          availability?.status === "invalid_format"
            ? "Use 3–30 lowercase letters, numbers, or underscores."
            : "That username is already used or owned on AfuChat. Please choose another."
        );
        return;
      }
    }
    if (!user) return;

    const tier = (subscription?.plan_tier as keyof typeof TIER_CHANNEL_LIMITS) || "free";
    const limit = TIER_CHANNEL_LIMITS[tier] ?? 1;
    if (isFinite(limit)) {
      const { data: currentCount } = await supabase.rpc("count_my_channels");
      const current = Number(currentCount ?? 0);
      if (current >= limit) {
        const nextTier = tier === "free" ? "Standard" : tier === "silver" ? "Pro" : "Platinum";
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

    const { data: channelId, error } = await supabase.rpc("create_channel_chat", {
      p_name: channelName.trim(),
      p_description: description.trim() || null,
      p_handle: normalizedHandle || null,
      p_avatar_url: avatarUrl,
      p_is_public: isPublic,
    });

    if (error || !channelId) {
      const message = error?.message?.toLowerCase() || "";
      if (message.includes("channel_handle_taken") || message.includes("duplicate")) {
        showAlert("Username unavailable", "That channel username is already in use. Please choose another.");
      } else {
        showAlert("Error", "Could not create the channel. Please try again.");
      }
      setCreating(false);
      return;
    }

    try {
      const { rewardXp } = await import("../../lib/rewardXp");
      rewardXp("channel_created");
    } catch (_) {}

    router.replace({ pathname: "/chat/[id]", params: {
      id: channelId,
      isChannel: "true",
      chatName: channelName.trim(),
      chatAvatar: avatarUrl || "",
      channelHandle: normalizedHandle,
    } });
    setCreating(false);
  }

  function goToSetup() {
    if (!channelName.trim()) {
      showAlert("Channel name required", "Please enter a name for your channel.");
      return;
    }
    Keyboard.dismiss();
    setStep(2);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingBottom: keyboardHeight }]}>
      <GlassHeader
        title={step === 1 ? "New Channel" : "Channel Setup"}
        onBack={() => step === 1 ? router.back() : setStep(1)}
        right={
          <TouchableOpacity
            onPress={step === 1 ? goToSetup : createChannel}
            disabled={creating || (step === 1 && !channelName.trim())}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {creating ? (
              <ActivityIndicator color={PURPLE} size="small" />
            ) : (
              <Ionicons
                name={step === 1 ? "arrow-forward" : "checkmark"}
                size={24}
                color={step === 1 && !channelName.trim() ? colors.textMuted : PURPLE}
              />
            )}
          </TouchableOpacity>
        }
      />

      <View style={[styles.nameSection, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {step === 1 ? (
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
        ) : null}

        <View style={styles.nameInputWrap}>
          {step === 1 ? (
            <TextInput
              style={[styles.nameInput, { color: colors.text, borderBottomColor: PURPLE }]}
              placeholder="Channel name"
              placeholderTextColor={colors.textMuted}
              value={channelName}
              onChangeText={setChannelName}
              autoFocus
              returnKeyType="next"
              onSubmitEditing={goToSetup}
            />
          ) : (
            <>
              <TextInput
                style={[styles.handleInput, { color: colors.text, borderBottomColor: PURPLE }]}
                placeholder={isPublic ? "Channel username" : "Username (optional)"}
                placeholderTextColor={colors.textMuted}
                value={channelHandle}
                onChangeText={(value) => setChannelHandle(value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30))}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={30}
                returnKeyType="next"
                onSubmitEditing={() => descRef.current?.focus()}
                autoFocus
              />
              {isPublic && channelHandle.trim() ? (
                <Text style={[styles.handleStatus, {
                  color: handleStatus === "available" ? "#34C759" : handleStatus === "taken" || handleStatus === "invalid_format" ? "#FF3B30" : colors.textMuted,
                }]}>
                  {handleStatus === "checking" ? "Checking username…" :
                    handleStatus === "available" ? "Username available" :
                    handleStatus === "taken" ? "Username already used or owned" :
                    handleStatus === "invalid_format" ? "Use at least 3 letters, numbers, or underscores" :
                    handleStatus === "error" ? "Could not check username yet" : ""}
                </Text>
              ) : null}
            </>
          )}
        </View>
      </View>

      {step === 2 ? (
        <>
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
                name={isPublic ? "globe" : "lock-closed"}
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
        </>
      ) : null}
    </View>
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
  handleInput: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    padding: 0,
    paddingTop: 10,
    paddingBottom: 5,
    borderBottomWidth: 1,
  },
  handleStatus: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    paddingTop: 4,
  },

  descSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    
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

});

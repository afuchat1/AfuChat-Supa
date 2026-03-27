import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";
import { uploadAvatar as uploadAvatarMedia } from "@/lib/mediaUpload";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { aiGenerateBio } from "@/lib/aiHelper";

export default function EditProfileScreen() {
  const { colors } = useTheme();
  const { profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();

  const [displayName, setDisplayName] = useState(profile?.display_name || "");
  const [handle, setHandle] = useState(profile?.handle || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [website, setWebsite] = useState(profile?.website_url || "");
  const [country, setCountry] = useState(profile?.country || "");
  const [loading, setLoading] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);

  async function pickAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showAlert("Permission needed", "Please allow access to your photo library to change your profile picture.");
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

  async function uploadAvatar(): Promise<string | null> {
    if (!avatarUri || !profile?.id) return null;
    const url = await uploadAvatarMedia(profile.id, avatarUri);
    if (!url) {
      showAlert("Upload failed", "Could not upload avatar. Please try again.");
    }
    return url;
  }

  async function save() {
    if (!displayName.trim()) {
      showAlert("Required", "Display name cannot be empty.");
      return;
    }
    if ((bio || "").length > 150) {
      showAlert("Too long", "Bio is limited to 150 characters.");
      return;
    }
    setLoading(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    let newAvatarUrl: string | null = null;
    if (avatarUri) {
      setUploadingAvatar(true);
      newAvatarUrl = await uploadAvatar();
      setUploadingAvatar(false);
      if (!newAvatarUrl) {
        setLoading(false);
        return;
      }
    }

    const updateData: any = {
      display_name: displayName.trim(),
      handle: handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"),
      bio: bio.trim() || null,
      website_url: website.trim() || null,
      country: country.trim() || null,
    };

    if (newAvatarUrl) {
      updateData.avatar_url = newAvatarUrl;
    }

    const { error } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", profile?.id);

    if (error) {
      showAlert("Error", error.message);
    } else {
      await refreshProfile();
      router.back();
    }
    setLoading(false);
  }

  const currentAvatarDisplay = avatarUri || profile?.avatar_url;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.root, { backgroundColor: colors.background }]}
    >
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Edit Profile</Text>
        <TouchableOpacity onPress={save} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={Colors.brand} />
          ) : (
            <Text style={[styles.saveText, { color: Colors.brand }]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={pickAvatar} activeOpacity={0.8}>
            <View style={styles.avatarWrap}>
              {currentAvatarDisplay ? (
                <Image source={{ uri: currentAvatarDisplay }} style={styles.avatarImg} />
              ) : (
                <Avatar uri={null} name={profile?.display_name} size={84} />
              )}
              {uploadingAvatar && (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator color="#fff" />
                </View>
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={pickAvatar}>
            <Text style={[styles.changePhotoText, { color: Colors.brand }]}>Change Photo</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.fields}>
          <FieldItem
            label="Name"
            value={displayName}
            onChange={setDisplayName}
            placeholder="Your display name"
          />
          <FieldItem
            label="Handle"
            value={handle}
            onChange={setHandle}
            placeholder="your_handle"
            autoCapitalize="none"
          />
          <FieldItem
            label="Bio"
            value={bio}
            onChange={setBio}
            placeholder="Tell people about yourself (max 150)"
            multiline
          />
          <View style={styles.aiBioRow}>
            <TouchableOpacity
              style={[styles.aiBioBtn, { backgroundColor: Colors.brand + "12", borderColor: Colors.brand + "30" }]}
              onPress={async () => {
                setAiGenerating(true);
                try {
                  const generated = await aiGenerateBio(
                    displayName || "User",
                    profile?.interests,
                    country || undefined,
                  );
                  setBio(generated.slice(0, 150));
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                } catch {
                  showAlert("AI Error", "Could not generate bio. Try again.");
                }
                setAiGenerating(false);
              }}
              disabled={aiGenerating}
            >
              {aiGenerating ? (
                <ActivityIndicator size="small" color={Colors.brand} />
              ) : (
                <Ionicons name="sparkles" size={14} color={Colors.brand} />
              )}
              <Text style={[styles.aiBioBtnText, { color: Colors.brand }]}>
                {aiGenerating ? "Generating..." : "AI Generate Bio"}
              </Text>
            </TouchableOpacity>
          </View>
          <FieldItem
            label="Website"
            value={website}
            onChange={setWebsite}
            placeholder="https://your-website.com"
            autoCapitalize="none"
            keyboardType="url"
          />
          <FieldItem
            label="Country"
            value={country}
            onChange={setCountry}
            placeholder="Your country"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FieldItem({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  autoCapitalize,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?: "default" | "email-address" | "phone-pad" | "url";
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.field, { borderBottomColor: colors.border }]}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        style={[
          styles.fieldInput,
          { color: colors.text },
          multiline && styles.fieldInputMulti,
        ]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        autoCapitalize={autoCapitalize || "sentences"}
        keyboardType={keyboardType || "default"}
      />
    </View>
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
  cancelText: { fontSize: 16, fontFamily: "Inter_400Regular" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  saveText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  body: { paddingBottom: 40 },
  avatarSection: { alignItems: "center", paddingVertical: 24, gap: 10 },
  avatarWrap: { position: "relative" },
  avatarImg: { width: 84, height: 84, borderRadius: 42 },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  changePhotoText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  fields: {},
  field: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  fieldLabel: {
    width: 80,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    paddingTop: 2,
  },
  fieldInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  fieldInputMulti: { minHeight: 60 },
  aiBioRow: { paddingHorizontal: 16, paddingBottom: 8 },
  aiBioBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  aiBioBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});

import React, { useState } from "react";
import {
  ActivityIndicator,
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
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";

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

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim(),
        handle: handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"),
        bio: bio.trim() || null,
        website_url: website.trim() || null,
        country: country.trim() || null,
      })
      .eq("id", profile?.id);

    if (error) {
      showAlert("Error", error.message);
    } else {
      await refreshProfile();
      router.back();
    }
    setLoading(false);
  }

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
          <Avatar uri={profile?.avatar_url} name={profile?.display_name} size={84} />
          <TouchableOpacity style={styles.changePhotoBtn}>
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
  changePhotoBtn: {},
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
});

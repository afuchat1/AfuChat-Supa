import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

export default function EditProfileScreen() {
  const { colors } = useTheme();
  const { profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();

  const [displayName, setDisplayName] = useState(profile?.display_name || "");
  const [username, setUsername] = useState(profile?.username || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [status, setStatus] = useState(profile?.status || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [loading, setLoading] = useState(false);

  async function save() {
    if (!displayName.trim()) {
      Alert.alert("Required", "Display name cannot be empty.");
      return;
    }
    setLoading(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim(),
        username: username.trim(),
        bio: bio.trim(),
        status: status.trim(),
        phone: phone.trim(),
      })
      .eq("id", profile?.id);

    if (error) {
      Alert.alert("Error", error.message);
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
      {/* Header */}
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
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <Avatar uri={profile?.avatar_url} name={profile?.display_name} size={84} />
          <TouchableOpacity style={styles.changePhotoBtn}>
            <Text style={[styles.changePhotoText, { color: Colors.brand }]}>Change Photo</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.fields}>
          <FieldItem
            label="Display Name"
            value={displayName}
            onChange={setDisplayName}
            placeholder="Your display name"
          />
          <FieldItem
            label="Username"
            value={username}
            onChange={setUsername}
            placeholder="@username"
            autoCapitalize="none"
          />
          <FieldItem
            label="Status"
            value={status}
            onChange={setStatus}
            placeholder="What's your status?"
          />
          <FieldItem
            label="Bio"
            value={bio}
            onChange={setBio}
            placeholder="Tell people about yourself"
            multiline
          />
          <FieldItem
            label="Phone"
            value={phone}
            onChange={setPhone}
            placeholder="+1 234 567 8900"
            keyboardType="phone-pad"
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
  keyboardType?: "default" | "email-address" | "phone-pad";
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
  avatarSection: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 10,
  },
  changePhotoBtn: {},
  changePhotoText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  fields: {},
  field: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  fieldLabel: {
    width: 100,
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

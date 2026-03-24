import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { Video, ResizeMode } from "expo-av";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";

export default function CreateStoryScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [caption, setCaption] = useState("");
  const [loading, setLoading] = useState(false);

  async function pickMedia() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setMediaUri(result.assets[0].uri);
      setMediaType(result.assets[0].type === "video" ? "video" : "image");
    }
  }

  async function publish() {
    if (!mediaUri || !user) return;
    setLoading(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from("stories").insert({
      user_id: user.id,
      media_url: mediaUri,
      media_type: mediaType,
      caption: caption.trim() || null,
      expires_at: expiresAt,
    });

    setLoading(false);
    if (error) {
      showAlert("Error", "Could not post story.");
    } else {
      router.back();
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>New Story</Text>
        <TouchableOpacity onPress={publish} disabled={!mediaUri || loading}>
          {loading ? <ActivityIndicator color={Colors.brand} /> : (
            <Text style={[styles.postText, { color: mediaUri ? Colors.brand : colors.textMuted }]}>Post</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {mediaUri ? (
          <View style={styles.previewWrap}>
            {mediaType === "video" ? (
              <Video
                source={{ uri: mediaUri }}
                style={styles.preview}
                resizeMode={ResizeMode.COVER}
                useNativeControls
                isLooping
              />
            ) : (
              <Image source={{ uri: mediaUri }} style={styles.preview} resizeMode="cover" />
            )}
            <TouchableOpacity style={styles.changeBtn} onPress={pickMedia}>
              <Ionicons name="camera-outline" size={20} color="#fff" />
              <Text style={styles.changeBtnText}>Change</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={[styles.pickArea, { backgroundColor: colors.inputBg }]} onPress={pickMedia}>
            <Ionicons name="camera-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.pickText, { color: colors.textSecondary }]}>Tap to select a photo or video</Text>
          </TouchableOpacity>
        )}

        <TextInput
          style={[styles.captionInput, { color: colors.text, backgroundColor: colors.inputBg }]}
          placeholder="Add a caption..."
          placeholderTextColor={colors.textMuted}
          value={caption}
          onChangeText={setCaption}
          multiline
          maxLength={200}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  cancelText: { fontSize: 16, fontFamily: "Inter_400Regular" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  postText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  body: { flex: 1, padding: 16, gap: 16 },
  pickArea: { height: 300, borderRadius: 16, alignItems: "center", justifyContent: "center", gap: 12 },
  pickText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  previewWrap: { height: 300, borderRadius: 16, overflow: "hidden", position: "relative" },
  preview: { width: "100%", height: "100%" },
  changeBtn: { position: "absolute", bottom: 12, right: 12, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  changeBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_500Medium" },
  captionInput: { borderRadius: 0, padding: 14, fontSize: 15, fontFamily: "Inter_400Regular", minHeight: 60 },
});

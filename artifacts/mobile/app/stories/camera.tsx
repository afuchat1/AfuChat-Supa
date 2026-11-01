import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GlassBackButton } from "@/components/ui/GlassBackButton";
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { useAppAccent } from "@/context/AppAccentContext";
import { showAlert } from "@/lib/alert";
import FilterSelector from "@/components/camera/FilterSelector";
import FaceFilterOverlay from "@/components/camera/FaceFilterOverlay";
import { FilterId } from "@/components/camera/filterDefs";
import { prepareMediaForUpload } from "@/lib/mediaUpload";
import { setStoryMediaDraft } from "@/lib/storyMediaDraft";

type CameraMode = "photo" | "video";

function NativeCameraScreen() {
  const { accent } = useAppAccent();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<any>(null);

  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [mode, setMode] = useState<CameraMode>("photo");
  const [facing, setFacing] = useState<"front" | "back">("front");
  const [flash, setFlash] = useState<"off" | "on">("off");
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [filter, setFilter] = useState<FilterId>("normal");

  useFocusEffect(
    useCallback(() => {
      setProcessing(false);
      setRecording(false);
    }, [])
  );

  const takePicture = useCallback(async () => {
    if (!cameraRef.current || processing || !cameraReady) return;
    setProcessing(true);
    try {
      // Keep camera photos as native files. Converting them to base64 sends
      // them through the small in-memory upload path and can fail on Android;
      // the working Stories picker uses native streaming instead.
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (photo?.uri) {
        const stableUri = await prepareMediaForUpload(photo.uri, "jpg");
        setStoryMediaDraft({ uri: stableUri, mediaType: "image", mimeType: "image/jpeg" });
        router.push("/stories/create");
      } else {
        showAlert("Error", "Could not capture photo. Please try again.");
        setProcessing(false);
      }
    } catch (e: any) {
      showAlert("Error", e?.message || "Failed to take photo.");
      setProcessing(false);
    }
  }, [processing, cameraReady]);

  const toggleRecord = useCallback(async () => {
    if (!cameraRef.current || !cameraReady) return;
    if (recording) {
      cameraRef.current.stopRecording();
      return;
    }
    if (!micPermission?.granted) {
      const permission = await requestMicPermission();
      if (!permission.granted) {
        const buttons = permission.canAskAgain === false
          ? [
              { text: "Not now", style: "cancel" as const },
              { text: "Open Settings", onPress: () => { void Linking.openSettings().catch(() => {}); } },
            ]
          : undefined;
        showAlert(
          "Microphone Required",
          permission.canAskAgain === false
            ? "Enable microphone access in AfuChat settings to record video with audio."
            : "Allow microphone access to record video with audio.",
          buttons,
        );
        return;
      }
    }
    setRecording(true);
    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: 30 });
      setRecording(false);
      if (video?.uri) {
        const stableUri = await prepareMediaForUpload(video.uri, "mp4");
        router.push({ pathname: "/stories/create", params: { mediaUri: stableUri, mediaType: "video" } });
      } else {
        showAlert("Error", "Could not record video. Please try again.");
      }
    } catch (e: any) {
      setRecording(false);
      showAlert("Error", e?.message || "Failed to record video.");
    }
  }, [recording, micPermission, cameraReady]);

  const openGallery = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        quality: 0.85,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const isVideo = asset.type === "video";
        const stableUri = await prepareMediaForUpload(asset.uri, isVideo ? "mp4" : "jpg");
        setStoryMediaDraft({
          uri: stableUri,
          mediaType: isVideo ? "video" : "image",
          mimeType: asset.mimeType || (isVideo ? "video/mp4" : "image/jpeg"),
        });
        router.push("/stories/create");
      }
    } catch {
      showAlert("Error", "Could not open gallery.");
    }
  }, []);

  if (!camPermission) {
    return (
      <View style={[st.root, { backgroundColor: "#000", alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  if (!camPermission.granted) {
    return (
      <View style={[st.root, { backgroundColor: "#000" }]}>
        <View style={st.permWrap}>
          <Ionicons name="camera" size={56} color="rgba(255,255,255,0.5)" />
          <Text style={st.permText}>Camera access is needed to take photos and videos for stories.</Text>
          <TouchableOpacity
            style={[st.permBtn, { backgroundColor: accent }]}
            onPress={() => camPermission.canAskAgain === false
              ? void Linking.openSettings().catch(() => {})
              : void requestCamPermission()}
          >
            <Text style={st.permBtnText}>{camPermission.canAskAgain === false ? "Open Settings" : "Allow Camera"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.permSecondary} onPress={openGallery}>
            <Ionicons name="images" size={18} color="rgba(255,255,255,0.7)" />
            <Text style={[st.permBtnText, { color: "rgba(255,255,255,0.7)" }]}>Choose from Gallery</Text>
          </TouchableOpacity>
          <GlassBackButton
            onPress={() => router.back()}
            label="Go back"
            accessibilityLabel="Go back"
            style={{ marginTop: 8, alignSelf: "center" }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[st.root, { backgroundColor: "#000" }]}>
      <CameraView
        ref={cameraRef}
        style={st.camera}
        facing={facing}
        flash={flash}
        mode={mode === "video" ? "video" : "picture"}
        onCameraReady={() => setCameraReady(true)}
      />

      <FaceFilterOverlay filter={filter} />

      <View style={[st.topBar, { paddingTop: insets.top + 8 }]}>
        <GlassBackButton onPress={() => router.back()} style={st.topBtn} color="#fff" />
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={() => setFlash(flash === "off" ? "on" : "off")}
          style={st.topBtn}
        >
          <Ionicons name={flash === "off" ? "flash-off" : "flash"} size={22} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={openGallery} style={st.topBtn}>
          <Ionicons name="grid" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <FilterSelector selected={filter} onSelect={setFilter} />

      <View style={[st.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={st.galleryThumb} onPress={openGallery}>
          <View style={[st.galleryImg, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
            <Ionicons name="images" size={20} color="rgba(255,255,255,0.5)" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[st.shutter, recording && st.shutterRec]}
          onPress={mode === "photo" ? takePicture : toggleRecord}
          disabled={processing || !cameraReady}
          activeOpacity={0.7}
        >
          {processing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : recording ? (
            <View style={st.shutterStop} />
          ) : (
            <View style={[st.shutterInner, mode === "video" && { backgroundColor: "#FF3B30" }]} />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={st.flipBtn}
          onPress={() => setFacing(facing === "back" ? "front" : "back")}
        >
          <Ionicons name="camera-reverse" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={[st.modeBar, { bottom: insets.bottom + 4 }]}>
        {(["photo", "video"] as CameraMode[]).map((m) => (
          <TouchableOpacity
            key={m}
            onPress={() => { if (!recording) setMode(m); }}
            style={[st.modeBtn, mode === m && st.modeBtnActive]}
          >
            <Text style={[st.modeText, mode === m && st.modeTextActive]}>
              {m === "photo" ? "Photo" : "Video"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function StoryCameraScreen() {
  return <NativeCameraScreen />;
}

const st = StyleSheet.create({
  root: { flex: 1 },
  camera: { flex: 1 },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 8,
  },
  topBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  bottomBar: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  galleryThumb: {
    position: "absolute",
    left: 32,
  },
  galleryImg: {
    width: 48,
    height: 48,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  shutterRec: {
    borderColor: "#FF3B30",
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#fff",
  },
  shutterStop: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "#FF3B30",
  },
  flipBtn: {
    position: "absolute",
    right: 32,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  modeBar: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 4,
  },
  modeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  modeBtnActive: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  modeText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  modeTextActive: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
  },
  permWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 16,
  },
  permText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  permBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  permSecondary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  permBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});

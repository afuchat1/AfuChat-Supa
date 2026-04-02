import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";

type CameraMode = "photo" | "video";

export default function StoryCameraScreen() {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);

  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [mode, setMode] = useState<CameraMode>("photo");
  const [facing, setFacing] = useState<"front" | "back">("back");
  const [flash, setFlash] = useState<"off" | "on">("off");
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  useEffect(() => {
    if (!camPermission?.granted) requestCamPermission();
    if (!micPermission?.granted) requestMicPermission();
  }, []);

  const takePicture = useCallback(async () => {
    if (!cameraRef.current || processing) return;
    setProcessing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (photo?.uri) {
        router.push({ pathname: "/stories/create", params: { mediaUri: photo.uri, mediaType: "image" } });
      }
    } catch {
      setProcessing(false);
    }
  }, [processing]);

  const toggleRecord = useCallback(async () => {
    if (!cameraRef.current) return;
    if (recording) {
      cameraRef.current.stopRecording();
      return;
    }
    if (!micPermission?.granted) {
      const { granted } = await requestMicPermission();
      if (!granted) return;
    }
    setRecording(true);
    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: 30 });
      setRecording(false);
      if (video?.uri) {
        router.push({ pathname: "/stories/create", params: { mediaUri: video.uri, mediaType: "video" } });
      }
    } catch {
      setRecording(false);
    }
  }, [recording, micPermission]);

  const openGallery = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      router.push({
        pathname: "/stories/create",
        params: { mediaUri: asset.uri, mediaType: asset.type === "video" ? "video" : "image" },
      });
    }
  }, []);

  if (!camPermission?.granted) {
    return (
      <View style={[st.root, { backgroundColor: "#000" }]}>
        <View style={st.permWrap}>
          <Ionicons name="camera-outline" size={56} color="rgba(255,255,255,0.5)" />
          <Text style={st.permText}>Camera access is needed to take photos and videos for stories.</Text>
          <TouchableOpacity style={st.permBtn} onPress={requestCamPermission}>
            <Text style={st.permBtnText}>Allow Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[st.permBtnText, { color: "rgba(255,255,255,0.5)", marginTop: 16 }]}>Go Back</Text>
          </TouchableOpacity>
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
      />

      <View style={[st.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.topBtn}>
          <Ionicons name="arrow-back" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={() => setFlash(flash === "off" ? "on" : "off")}
          style={st.topBtn}
        >
          <Ionicons name={flash === "off" ? "flash-off" : "flash"} size={22} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={openGallery} style={st.topBtn}>
          <Ionicons name="grid-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={[st.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={st.galleryThumb} onPress={openGallery}>
          <View style={[st.galleryImg, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
            <Ionicons name="images-outline" size={20} color="rgba(255,255,255,0.5)" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[st.shutter, recording && st.shutterRec]}
          onPress={mode === "photo" ? takePicture : toggleRecord}
          disabled={processing}
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
          <Ionicons name="camera-reverse-outline" size={28} color="#fff" />
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
    backgroundColor: Colors.brand,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  permBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});

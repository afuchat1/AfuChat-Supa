import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { useAppAccent } from "@/context/AppAccentContext";
import { showAlert } from "@/lib/alert";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { DesktopCameraFallback } from "@/components/desktop/DesktopCameraFallback";

type CameraMode = "photo" | "video";

function useWebCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");

  const start = useCallback(async (facing: "user" | "environment") => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setReady(true);
    } catch {
      setReady(false);
    }
  }, []);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setReady(false);
  }, []);

  const capture = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video) return null;
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(video.videoWidth, 1280);
    canvas.height = Math.min(video.videoHeight, 720);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  }, []);

  const flip = useCallback(() => {
    const next = facingMode === "user" ? "environment" : "user";
    setFacingMode(next);
    start(next);
  }, [facingMode, start]);

  return { videoRef, ready, start, stop, capture, flip, facingMode };
}

function WebCameraScreen() {
  const { accent } = useAppAccent();
  const insets = useSafeAreaInsets();
  const { videoRef, ready, start, stop, capture, flip } = useWebCamera();
  const [processing, setProcessing] = useState(false);
  const [permDenied, setPermDenied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await start("environment");
      } catch {
        setPermDenied(true);
      }
    })();
    return () => stop();
  }, []);

  const takePicture = useCallback(() => {
    if (processing) return;
    setProcessing(true);
    try {
      const dataUri = capture();
      if (dataUri) {
        router.push({ pathname: "/stories/create", params: { mediaUri: dataUri, mediaType: "image" } });
      } else {
        showAlert("Error", "Could not capture photo.");
        setProcessing(false);
      }
    } catch {
      showAlert("Error", "Failed to take photo.");
      setProcessing(false);
    }
  }, [processing, capture]);

  useFocusEffect(
    useCallback(() => {
      setProcessing(false);
    }, [])
  );

  const openGallery = useCallback(async () => {
    try {
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
    } catch {
      showAlert("Error", "Could not open gallery.");
    }
  }, []);

  if (permDenied) {
    return (
      <View style={[st.root, { backgroundColor: "#000" }]}>
        <View style={st.permWrap}>
          <Ionicons name="camera-outline" size={56} color="rgba(255,255,255,0.5)" />
          <Text style={st.permText}>Camera access is needed to take photos for stories.</Text>
          <TouchableOpacity style={[st.permBtn, { backgroundColor: accent }]} onPress={() => { setPermDenied(false); start("environment"); }}>
            <Text style={st.permBtnText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.permSecondary} onPress={openGallery}>
            <Ionicons name="images-outline" size={18} color="rgba(255,255,255,0.7)" />
            <Text style={[st.permBtnText, { color: "rgba(255,255,255,0.7)" }]}>Choose from Gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[st.permBtnText, { color: "rgba(255,255,255,0.4)", marginTop: 8 }]}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[st.root, { backgroundColor: "#000" }]}>
      <video
        ref={videoRef as any}
        autoPlay
        playsInline
        muted
        style={{ width: "100%", height: "100%", objectFit: "cover" } as any}
      />

      <View style={[st.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.topBtn}>
          <Ionicons name="arrow-back" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
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
          style={st.shutter}
          onPress={takePicture}
          disabled={processing || !ready}
          activeOpacity={0.7}
        >
          {processing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <View style={st.shutterInner} />
          )}
        </TouchableOpacity>

        <TouchableOpacity style={st.flipBtn} onPress={flip}>
          <Ionicons name="camera-reverse-outline" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={[st.modeBar, { bottom: insets.bottom + 4 }]}>
        <View style={[st.modeBtn, st.modeBtnActive]}>
          <Text style={[st.modeText, st.modeTextActive]}>Photo</Text>
        </View>
      </View>
    </View>
  );
}

let CameraView: any;
let useCameraPermissions: any;
let useMicrophonePermissions: any;
if (Platform.OS !== "web") {
  const cam = require("expo-camera");
  CameraView = cam.CameraView;
  useCameraPermissions = cam.useCameraPermissions;
  useMicrophonePermissions = cam.useMicrophonePermissions;
}

function NativeCameraScreen() {
  const { accent } = useAppAccent();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<any>(null);

  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [mode, setMode] = useState<CameraMode>("photo");
  const [facing, setFacing] = useState<"front" | "back">("back");
  const [flash, setFlash] = useState<"off" | "on">("off");
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setProcessing(false);
      setRecording(false);
    }, [])
  );

  const takePicture = useCallback(async () => {
    if (!cameraRef.current || processing) return;
    setProcessing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (photo?.uri) {
        router.push({ pathname: "/stories/create", params: { mediaUri: photo.uri, mediaType: "image" } });
      } else {
        showAlert("Error", "Could not capture photo. Please try again.");
        setProcessing(false);
      }
    } catch (e: any) {
      showAlert("Error", e?.message || "Failed to take photo.");
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
      if (!granted) {
        showAlert("Microphone Required", "Microphone access is needed to record video with audio.");
        return;
      }
    }
    setRecording(true);
    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: 30 });
      setRecording(false);
      if (video?.uri) {
        router.push({ pathname: "/stories/create", params: { mediaUri: video.uri, mediaType: "video" } });
      } else {
        showAlert("Error", "Could not record video. Please try again.");
      }
    } catch (e: any) {
      setRecording(false);
      showAlert("Error", e?.message || "Failed to record video.");
    }
  }, [recording, micPermission]);

  const openGallery = useCallback(async () => {
    try {
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
          <Ionicons name="camera-outline" size={56} color="rgba(255,255,255,0.5)" />
          <Text style={st.permText}>Camera access is needed to take photos and videos for stories.</Text>
          <TouchableOpacity style={[st.permBtn, { backgroundColor: accent }]} onPress={requestCamPermission}>
            <Text style={st.permBtnText}>Allow Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.permSecondary} onPress={openGallery}>
            <Ionicons name="images-outline" size={18} color="rgba(255,255,255,0.7)" />
            <Text style={[st.permBtnText, { color: "rgba(255,255,255,0.7)" }]}>Choose from Gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[st.permBtnText, { color: "rgba(255,255,255,0.4)", marginTop: 8 }]}>Go Back</Text>
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

export default function StoryCameraScreen() {
  const { isDesktop } = useIsDesktop();
  useEffect(() => {
    if (isDesktop) router.replace("/");
  }, [isDesktop]);
  if (isDesktop) return null;
  if (Platform.OS === "web") return <WebCameraScreen />;
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

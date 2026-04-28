import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/components/ui/Avatar";
import { useAuth } from "@/context/AuthContext";
import {
  CallRecord,
  CallSession,
  CallType,
  RTCView,
  getCall,
  isCallSupported,
  updateCallStatus,
} from "@/lib/callSignaling";
import { WebVideoStream } from "@/components/call/WebVideoStream";
import { CallChatPanel } from "@/components/call/CallChatPanel";
import { notifyCallInitiated } from "@/lib/notifyUser";

type CallState = "connecting" | "ringing" | "active" | "ended";

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60)
    .toString()
    .padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function CallScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [call, setCall] = useState<CallRecord | null>(null);
  const [callState, setCallState] = useState<CallState>("connecting");
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [duration, setDuration] = useState(0);
  const [localStream, setLocalStream] = useState<any>(null);
  const [remoteStream, setRemoteStream] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const sessionRef = useRef<CallSession | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringSound = useRef<Audio.Sound | null>(null);
  const startTimeRef = useRef<number>(0);

  const isCaller = call ? call.caller_id === user?.id : false;
  const isVideo = call?.call_type === "video";
  const otherPerson = isCaller ? call?.callee : call?.caller;

  const endCall = useCallback(
    async (reason: "ended" | "declined" | "missed" = "ended") => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (ringSound.current) {
        await ringSound.current.stopAsync().catch(() => {});
        await ringSound.current.unloadAsync().catch(() => {});
        ringSound.current = null;
      }
      sessionRef.current?.sendEndSignal();
      sessionRef.current?.cleanup();
      sessionRef.current = null;

      const durationSecs =
        startTimeRef.current > 0
          ? Math.floor((Date.now() - startTimeRef.current) / 1000)
          : 0;

      if (id) {
        await updateCallStatus(id, reason, {
          ended_at: new Date().toISOString(),
          ...(durationSecs > 0 ? { duration_seconds: durationSecs } : {}),
        });
      }
      router.back();
    },
    [id]
  );

  useEffect(() => {
    if (!id || !user) return;
    if (Platform.OS === "web" && !isCallSupported()) return;

    let cancelled = false;

    async function setup() {
      const record = await getCall(id as string);
      if (!record || cancelled) return;
      setCall(record);

      if (record.status === "ended" || record.status === "declined") {
        setCallState("ended");
        setTimeout(() => router.back(), 1500);
        return;
      }

      const amCaller = record.caller_id === user!.id;
      setCallState(amCaller ? "ringing" : "connecting");

      const session = new CallSession(record.id, amCaller);
      sessionRef.current = session;

      session.onLocalStream = (s) => setLocalStream(s);
      session.onRemoteStream = (s) => {
        setRemoteStream(s);
        setCallState("active");
        stopRing();
        startTimeRef.current = Date.now();
        timerRef.current = setInterval(
          () => setDuration((d) => d + 1),
          1000
        );
      };
      session.onCallConnected = () => {
        setCallState("active");
      };
      session.onCallEnded = () => {
        endCall("ended");
      };
      session.onError = (msg) => setError(msg);

      if (amCaller) {
        await playRingtone();
        await notifyCallInitiated({
          calleeId: record.callee_id,
          callId: record.id,
          callType: record.call_type as CallType,
          callerName: record.caller?.display_name || "Someone",
        });
      }

      try {
        await session.start(record.call_type as CallType);
      } catch (e: any) {
        if (!cancelled) setError("Could not access microphone or camera.");
      }
    }

    setup();
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
      stopRing();
    };
  }, [id, user]);

  async function playRingtone() {
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        require("../../assets/sounds/notification.wav"),
        { isLooping: true, volume: 1 }
      );
      ringSound.current = sound;
      await sound.playAsync();
    } catch (_) {}
  }

  async function stopRing() {
    if (ringSound.current) {
      await ringSound.current.stopAsync().catch(() => {});
      await ringSound.current.unloadAsync().catch(() => {});
      ringSound.current = null;
    }
  }

  async function handleMute() {
    const muted = await sessionRef.current?.toggleMute();
    setIsMuted(muted ?? !isMuted);
  }

  async function handleCamera() {
    const off = await sessionRef.current?.toggleCamera();
    setIsCameraOff(off ?? !isCameraOff);
  }

  async function handleFlip() {
    sessionRef.current?.flipCamera();
  }

  async function handleSpeaker() {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        playThroughEarpieceAndroid: isSpeaker,
      });
      setIsSpeaker((s) => !s);
    } catch (_) {}
  }

  if (Platform.OS === "web" && !isCallSupported()) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Ionicons name="call-outline" size={48} color="#fff" />
        <Text style={styles.notSupported}>
          Your browser doesn't support voice or video calls. Try Chrome, Edge or Safari.
        </Text>
        <TouchableOpacity style={styles.endBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  }

  const statusText =
    callState === "connecting"
      ? "Connecting..."
      : callState === "ringing"
      ? "Ringing..."
      : callState === "active"
      ? formatDuration(duration)
      : "Call ended";

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {isVideo && remoteStream && Platform.OS === "web" ? (
        <WebVideoStream stream={remoteStream} style={StyleSheet.absoluteFill} />
      ) : isVideo && remoteStream && RTCView ? (
        <RTCView
          streamURL={remoteStream.toURL()}
          style={StyleSheet.absoluteFill}
          objectFit="cover"
          mirror={false}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.voiceBg]} />
      )}

      <View style={[styles.overlay, { paddingTop: insets.top + 16 }]}>
        <View style={styles.callerSection}>
          <View style={styles.avatarRing}>
            <Avatar
              uri={otherPerson?.avatar_url}
              name={otherPerson?.display_name || "?"}
              size={isVideo && callState === "active" ? 72 : 100}
            />
          </View>
          <Text style={styles.callerName}>
            {otherPerson?.display_name || "Unknown"}
          </Text>
          <Text style={styles.callStatus}>{statusText}</Text>
          {call?.call_type === "video" && (
            <View style={styles.callTypeBadge}>
              <Ionicons name="videocam" size={14} color="#fff" />
              <Text style={styles.callTypeTxt}>Video call</Text>
            </View>
          )}
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={16} color="#fff" />
            <Text style={styles.errorTxt}>{error}</Text>
          </View>
        )}

        {callState === "connecting" && (
          <ActivityIndicator
            size="large"
            color="#fff"
            style={{ marginBottom: 40 }}
          />
        )}

        {isVideo && localStream && Platform.OS === "web" ? (
          <View style={[styles.localVideoWrap, { bottom: insets.bottom + 120 }]}>
            <WebVideoStream stream={localStream} style={styles.localVideo} mirror muted />
          </View>
        ) : isVideo && localStream && RTCView ? (
          <View style={[styles.localVideoWrap, { bottom: insets.bottom + 120 }]}>
            <RTCView
              streamURL={localStream.toURL()}
              style={styles.localVideo}
              objectFit="cover"
              mirror={true}
            />
          </View>
        ) : null}

        <View style={[styles.controls, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.controlRow}>
            <TouchableOpacity
              style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
              onPress={handleMute}
            >
              <Ionicons
                name={isMuted ? "mic-off" : "mic"}
                size={24}
                color="#fff"
              />
              <Text style={styles.controlLabel}>
                {isMuted ? "Unmute" : "Mute"}
              </Text>
            </TouchableOpacity>

            {isVideo && (
              <TouchableOpacity
                style={[styles.controlBtn, isCameraOff && styles.controlBtnActive]}
                onPress={handleCamera}
              >
                <Ionicons
                  name={isCameraOff ? "videocam-off" : "videocam"}
                  size={24}
                  color="#fff"
                />
                <Text style={styles.controlLabel}>
                  {isCameraOff ? "Show" : "Hide"}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.controlBtn, isSpeaker && styles.controlBtnActive]}
              onPress={handleSpeaker}
            >
              <Ionicons
                name={isSpeaker ? "volume-high" : "volume-medium"}
                size={24}
                color="#fff"
              />
              <Text style={styles.controlLabel}>Speaker</Text>
            </TouchableOpacity>

            {isVideo && (
              <TouchableOpacity style={styles.controlBtn} onPress={handleFlip}>
                <Ionicons name="camera-reverse" size={24} color="#fff" />
                <Text style={styles.controlLabel}>Flip</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.controlBtn, chatOpen && styles.controlBtnActive]}
              onPress={() => setChatOpen((v) => !v)}
            >
              <Ionicons name="chatbubble-ellipses" size={24} color="#fff" />
              <Text style={styles.controlLabel}>Chat</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.endCallBtn}
            onPress={() => endCall("ended")}
            activeOpacity={0.8}
          >
            <Ionicons name="call" size={30} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {id && user && (
        <CallChatPanel
          visible={chatOpen}
          callId={String(id)}
          selfId={user.id}
          selfName={(user as any).user_metadata?.display_name || "You"}
          otherName={otherPerson?.display_name || "Caller"}
          onClose={() => setChatOpen(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a2e",
  },
  voiceBg: {
    backgroundColor: "#1a1a2e",
  },
  overlay: {
    flex: 1,
    justifyContent: "space-between",
  },
  callerSection: {
    alignItems: "center",
    paddingTop: 24,
  },
  endBtn: {
    marginTop: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FF3B30",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  avatarRing: {
    padding: 6,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.3)",
    marginBottom: 16,
  },
  callerName: {
    color: "#fff",
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    marginBottom: 6,
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  callStatus: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    marginBottom: 8,
  },
  callTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
  },
  callTypeTxt: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  localVideoWrap: {
    position: "absolute",
    right: 16,
    width: 100,
    height: 140,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
  },
  localVideo: {
    flex: 1,
  },
  controls: {
    alignItems: "center",
    paddingHorizontal: 24,
  },
  controlRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 20,
    marginBottom: 32,
  },
  controlBtn: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 50,
    width: 64,
    height: 64,
    justifyContent: "center",
  },
  controlBtnActive: {
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  controlLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
    position: "absolute",
    bottom: -18,
    width: 60,
    textAlign: "center",
  },
  endCallBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#FF3B30",
    justifyContent: "center",
    alignItems: "center",
    transform: [{ rotate: "135deg" }],
    shadowColor: "#FF3B30",
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,59,48,0.6)",
    marginHorizontal: 24,
    padding: 12,
    borderRadius: 10,
  },
  errorTxt: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  notSupported: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 16,
    textAlign: "center",
    marginVertical: 16,
    paddingHorizontal: 32,
    fontFamily: "Inter_400Regular",
  },
});

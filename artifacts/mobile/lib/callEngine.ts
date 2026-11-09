import { NativeModules, Platform, TurboModuleRegistry } from "react-native";
import { supabase } from "@/lib/supabase";
import { isExpoGo } from "@/lib/expoEnvironment";
import { notifyCallRecipient } from "@/lib/pushNotifications";
import { setNativeSpeakerphone } from "@/lib/nativeShareShortcuts";

export type CallStatus =
  | "idle"
  | "outgoing_ringing"
  | "incoming_ringing"
  | "connecting"
  | "active"
  | "ended";

export interface CallInfo {
  callId: string;
  callerId: string;
  calleeId: string;
  callerName: string;
  callerAvatar: string | null;
  calleeName: string;
  calleeAvatar: string | null;
  chatId: string | null;
  startedAt: number;
  answeredAt: number | null;
  isCaller: boolean;
}

export interface IncomingCallNotice {
  callId: string;
  callerId: string;
  callerName: string;
  callerAvatar: string | null;
  chatId: string | null;
}

export type CallEngineEvent =
  | { type: "status"; status: CallStatus; info: CallInfo | null }
  | { type: "incoming"; notice: IncomingCallNotice }
  | { type: "error"; message: string };

type Listener = (event: CallEngineEvent) => void;
type RtcBridge = {
  RTCPeerConnection: any;
  RTCSessionDescription: any;
  RTCIceCandidate: any;
  mediaDevices: { getUserMedia: (constraints: any) => Promise<any> };
};

let rtc: RtcBridge | null | undefined;
let status: CallStatus = "idle";
let info: CallInfo | null = null;
let currentUserId: string | null = null;
let localStream: any = null;
let remoteAudio: any = null;
let peer: any = null;
let signalChannel: any = null;
let inboxChannel: any = null;
let pendingCandidates: any[] = [];
let remoteDescriptionReady = false;
let ringTimer: ReturnType<typeof setTimeout> | null = null;
let listeners = new Set<Listener>();
let speakerEnabled = false;

function emit(event: CallEngineEvent) {
  listeners.forEach((listener) => {
    try { listener(event); } catch {}
  });
}

function setStatus(next: CallStatus) {
  status = next;
  emit({ type: "status", status, info });
}

function detectRtc(): RtcBridge | null {
  // A native module can appear a moment after the first JS effect on Android.
  // Cache only a successful bridge; a transient null must remain retryable.
  if (rtc) return rtc;

  if (Platform.OS === "web") {
    const g = globalThis as any;
    if (!g.RTCPeerConnection || !g.navigator?.mediaDevices?.getUserMedia) {
      rtc = null;
      return rtc;
    }
    rtc = {
      RTCPeerConnection: g.RTCPeerConnection,
      RTCSessionDescription: g.RTCSessionDescription,
      RTCIceCandidate: g.RTCIceCandidate,
      mediaDevices: g.navigator.mediaDevices,
    };
    return rtc;
  }

  // react-native-webrtc is not included in Expo Go. Keep this require lazy so
  // its native module cannot crash the app during bundle evaluation.
  if (isExpoGo()) {
    return null;
  }
  try {
    if (!NativeModules.WebRTCModule && TurboModuleRegistry?.get) {
      try {
        (NativeModules as any).WebRTCModule = TurboModuleRegistry.get("WebRTCModule");
      } catch {}
    }
    // Some RN 0.83 bridgeless builds expose the legacy WebRTC package through
    // TurboModuleRegistry only after the first lookup.
    if (!NativeModules.WebRTCModule && TurboModuleRegistry?.getEnforcing) {
      try {
        (NativeModules as any).WebRTCModule =
          TurboModuleRegistry.getEnforcing("WebRTCModule");
      } catch {}
    }
    const webrtc = require("react-native-webrtc");
    if (!webrtc?.RTCPeerConnection || !webrtc?.mediaDevices?.getUserMedia) {
      return null;
    }
    rtc = {
      RTCPeerConnection: webrtc.RTCPeerConnection,
      RTCSessionDescription: webrtc.RTCSessionDescription,
      RTCIceCandidate: webrtc.RTCIceCandidate,
      mediaDevices: webrtc.mediaDevices,
    };
  } catch {
    return null;
  }
  return rtc;
}

export function getWebRTCAvailable(): boolean {
  return !!detectRtc();
}

function subscribe(channel: any): Promise<void> {
  if (channel.state === "joined") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Call signaling timed out")), 8000);
    channel.subscribe((state: string) => {
      if (state === "SUBSCRIBED") {
        clearTimeout(timeout);
        resolve();
      } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") {
        clearTimeout(timeout);
        reject(new Error("Call signaling unavailable"));
      }
    });
  });
}

async function sendToUser(userId: string, event: string, payload: Record<string, unknown>) {
  const channel = supabase.channel(`user-call:${userId}`);
  try {
    await subscribe(channel);
    await channel.send({ type: "broadcast", event, payload });
  } finally {
    void supabase.removeChannel(channel);
  }
}

async function sendSignal(event: string, payload: Record<string, unknown>) {
  if (!signalChannel) return;
  try {
    await signalChannel.send({ type: "broadcast", event, payload });
  } catch {}
}

async function flushCandidates() {
  if (!peer || !remoteDescriptionReady) return;
  const candidates = pendingCandidates.splice(0);
  for (const candidate of candidates) {
    try { await peer.addIceCandidate(new (detectRtc() as RtcBridge).RTCIceCandidate(candidate)); } catch {}
  }
}

function clearRingTimer() {
  if (ringTimer) clearTimeout(ringTimer);
  ringTimer = null;
}

function stopPeer() {
  clearRingTimer();
  pendingCandidates = [];
  remoteDescriptionReady = false;
  try { localStream?.getTracks?.().forEach((track: any) => track.stop()); } catch {}
  if (remoteAudio) {
    try { remoteAudio.pause?.(); } catch {}
    try { remoteAudio.srcObject = null; } catch {}
    try { remoteAudio.remove?.(); } catch {}
    remoteAudio = null;
  }
  try { peer?.close?.(); } catch {}
  localStream = null;
  peer = null;
  speakerEnabled = false;
  setNativeSpeakerphone(false);
}

function removeSignalChannel() {
  if (signalChannel) void supabase.removeChannel(signalChannel);
  signalChannel = null;
}

async function finishCall(sendEnd: boolean) {
  const oldInfo = info;
  if (sendEnd && oldInfo) {
    await sendSignal("end", { callId: oldInfo.callId });
    await sendToUser(
      oldInfo.isCaller ? oldInfo.calleeId : oldInfo.callerId,
      "cancel",
      { callId: oldInfo.callId },
    ).catch(() => {});
  }
  stopPeer();
  removeSignalChannel();
  info = null;
  setStatus("ended");
  setTimeout(() => {
    if (status === "ended") setStatus("idle");
  }, 350);
}

function configurePeer(callId: string, isCaller: boolean) {
  const bridge = detectRtc();
  if (!bridge) throw new Error("Voice calls require a native build or WebRTC-enabled browser");

  peer = new bridge.RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  localStream?.getTracks?.().forEach((track: any) => peer.addTrack(track, localStream));
  peer.onicecandidate = (event: any) => {
    if (event.candidate) {
      void sendSignal("ice", {
        callId,
        candidate: event.candidate.toJSON?.() ?? event.candidate,
      });
    }
  };
  peer.oniceconnectionstatechange = () => {
    const state = peer?.iceConnectionState;
    if (state === "connected" || state === "completed") {
      if (status !== "active") {
        info = info ? { ...info, answeredAt: info.answeredAt ?? Date.now() } : info;
        setStatus("active");
      }
    } else if (state === "failed" || state === "closed") {
      void finishCall(false);
    }
  };
  peer.onconnectionstatechange = () => {
    if (peer?.connectionState === "connected" && status !== "active") {
      info = info ? { ...info, answeredAt: info.answeredAt ?? Date.now() } : info;
      setStatus("active");
    }
  };
  peer.ontrack = (event: any) => {
    // Native WebRTC routes an audio track through its audio session. On web,
    // the track must be attached to an HTMLAudioElement or the call connects
    // silently with no audible remote participant.
    if (Platform.OS !== "web" || !event?.streams?.[0]) return;
    try {
      if (!remoteAudio) {
        remoteAudio = document.createElement("audio");
        remoteAudio.autoplay = true;
        remoteAudio.playsInline = true;
        remoteAudio.setAttribute("aria-hidden", "true");
        remoteAudio.style.display = "none";
        document.body.appendChild(remoteAudio);
      }
      remoteAudio.srcObject = event.streams[0];
      void remoteAudio.play?.().catch(() => {});
    } catch {}
  };
  return isCaller;
}

function configureSignalChannel(callId: string, isCaller: boolean) {
  const bridge = detectRtc();
  if (!bridge) throw new Error("WebRTC unavailable");
  signalChannel = supabase
    .channel(`call:${callId}`, { config: { broadcast: { self: false } } })
    .on("broadcast", { event: "ready" }, async ({ payload }: any) => {
      if (!isCaller || !peer) return;
      setStatus("connecting");
      const offer = await peer.createOffer({ offerToReceiveAudio: true });
      await peer.setLocalDescription(offer);
      await sendSignal("offer", { callId, description: offer });
    })
    .on("broadcast", { event: "offer" }, async ({ payload }: any) => {
      if (isCaller || !peer) return;
      setStatus("connecting");
      await peer.setRemoteDescription(new bridge.RTCSessionDescription(payload.description));
      remoteDescriptionReady = true;
      await flushCandidates();
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await sendSignal("answer", { callId, description: answer });
    })
    .on("broadcast", { event: "answer" }, async ({ payload }: any) => {
      if (!isCaller || !peer) return;
      await peer.setRemoteDescription(new bridge.RTCSessionDescription(payload.description));
      remoteDescriptionReady = true;
      await flushCandidates();
    })
    .on("broadcast", { event: "ice" }, async ({ payload }: any) => {
      if (!peer || !payload?.candidate) return;
      if (!remoteDescriptionReady) {
        pendingCandidates.push(payload.candidate);
        return;
      }
      try { await peer.addIceCandidate(new bridge.RTCIceCandidate(payload.candidate)); } catch {}
    })
    .on("broadcast", { event: "end" }, () => void finishCall(false));
}

export async function initCallEngine(userId: string): Promise<() => void> {
  currentUserId = userId;
  if (inboxChannel) void supabase.removeChannel(inboxChannel);
  inboxChannel = supabase
    .channel(`user-call:${userId}`, { config: { broadcast: { self: false } } })
    .on("broadcast", { event: "invite" }, ({ payload }: any) => {
      if (!payload?.callId || !payload?.callerId) return;
      if (status !== "idle") {
        void sendToUser(payload.callerId, "busy", { callId: payload.callId });
        return;
      }
      info = {
        callId: payload.callId,
        callerId: payload.callerId,
        calleeId: userId,
        callerName: payload.callerName ?? "AfuChat user",
        callerAvatar: payload.callerAvatar ?? null,
        calleeName: payload.calleeName ?? "",
        calleeAvatar: payload.calleeAvatar ?? null,
        chatId: payload.chatId ?? null,
        startedAt: Date.now(),
        answeredAt: null,
        isCaller: false,
      };
      setStatus("incoming_ringing");
      emit({
        type: "incoming",
        notice: {
          callId: payload.callId,
          callerId: payload.callerId,
          callerName: payload.callerName ?? "AfuChat user",
          callerAvatar: payload.callerAvatar ?? null,
          chatId: payload.chatId ?? null,
        },
      });
    })
    .on("broadcast", { event: "cancel" }, ({ payload }: any) => {
      if (payload?.callId !== info?.callId) return;
      if (status === "incoming_ringing") {
        info = null;
        setStatus("idle");
      }
    })
    .on("broadcast", { event: "busy" }, ({ payload }: any) => {
      if (payload?.callId === info?.callId) void finishCall(false);
    });
  try {
    await subscribe(inboxChannel);
  } catch {}

  return () => {
    if (currentUserId !== userId) return;
    currentUserId = null;
    stopPeer();
    removeSignalChannel();
    if (inboxChannel) void supabase.removeChannel(inboxChannel);
    inboxChannel = null;
    info = null;
    status = "idle";
  };
}

export function addCallEngineListener(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function startCall(params: {
  callId: string;
  calleeId: string;
  calleeName: string;
  calleeAvatar: string | null;
  myId: string;
  myName: string;
  myAvatar: string | null;
  chatId: string | null;
}) {
  if (status !== "idle") throw new Error("A call is already in progress");
  if (!detectRtc()) throw new Error("Calls are unavailable in this app build");
  const bridge = detectRtc() as RtcBridge;
  info = {
    callId: params.callId,
    callerId: params.myId,
    calleeId: params.calleeId,
    callerName: params.myName,
    callerAvatar: params.myAvatar,
    calleeName: params.calleeName,
    calleeAvatar: params.calleeAvatar,
    chatId: params.chatId,
    startedAt: Date.now(),
    answeredAt: null,
    isCaller: true,
  };
  try {
    localStream = await bridge.mediaDevices.getUserMedia({ audio: true, video: false });
    setNativeSpeakerphone(false);
    configurePeer(params.callId, true);
    configureSignalChannel(params.callId, true);
    await subscribe(signalChannel);
    setStatus("outgoing_ringing");
    ringTimer = setTimeout(() => void finishCall(true), 30000);
    await sendToUser(params.calleeId, "invite", {
      callId: params.callId,
      callerId: params.myId,
      callerName: params.myName,
      callerAvatar: params.myAvatar,
      calleeName: params.calleeName,
      calleeAvatar: params.calleeAvatar,
      chatId: params.chatId,
    });
    void notifyCallRecipient({
      recipientId: params.calleeId,
      senderId: params.myId,
      callerName: params.myName,
      callerAvatar: params.myAvatar,
      callId: params.callId,
      chatId: params.chatId,
    });
  } catch (error) {
    await finishCall(false);
    throw error;
  }
}

export async function acceptCall(notice: IncomingCallNotice, params: {
  myId: string;
  myName: string;
  myAvatar: string | null;
}) {
  if (status !== "incoming_ringing" || !info) return;
  const bridge = detectRtc();
  if (!bridge) throw new Error("Calls are unavailable in this app build");
  try {
    localStream = await bridge.mediaDevices.getUserMedia({ audio: true, video: false });
    setNativeSpeakerphone(false);
    configurePeer(notice.callId, false);
    configureSignalChannel(notice.callId, false);
    await subscribe(signalChannel);
    setStatus("connecting");
    await sendSignal("ready", {
      callId: notice.callId,
      userId: params.myId,
      userName: params.myName,
      userAvatar: params.myAvatar,
    });
  } catch (error) {
    await finishCall(false);
    throw error;
  }
}

export function declineCall(notice: IncomingCallNotice) {
  void sendToUser(notice.callerId, "cancel", { callId: notice.callId });
  info = null;
  stopPeer();
  removeSignalChannel();
  setStatus("idle");
}

export async function handleCallNotificationAction(
  action: "accept_call" | "decline_call",
  notice: IncomingCallNotice,
  params: { myId: string; myName: string; myAvatar: string | null },
) {
  currentUserId = params.myId;
  if (!info || info.callId !== notice.callId) {
    if (status !== "idle") return;
    info = {
      callId: notice.callId,
      callerId: notice.callerId,
      calleeId: params.myId,
      callerName: notice.callerName,
      callerAvatar: notice.callerAvatar,
      calleeName: params.myName,
      calleeAvatar: params.myAvatar,
      chatId: notice.chatId,
      startedAt: Date.now(),
      answeredAt: null,
      isCaller: false,
    };
    setStatus("incoming_ringing");
  }
  if (action === "decline_call") {
    declineCall(notice);
    return;
  }
  await acceptCall(notice, params);
}

export async function endCall() {
  await finishCall(true);
}

export function toggleMute(): boolean {
  const next = !(localStream?.getAudioTracks?.().every((track: any) => !track.enabled) ?? false);
  localStream?.getAudioTracks?.().forEach((track: any) => { track.enabled = !next; });
  return next;
}

export function toggleSpeaker(): boolean {
  speakerEnabled = !speakerEnabled;
  setNativeSpeakerphone(speakerEnabled);
  return speakerEnabled;
}
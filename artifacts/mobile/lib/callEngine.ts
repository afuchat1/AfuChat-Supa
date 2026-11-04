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
type CallSessionStatus =
  | "initiated"
  | "ringing"
  | "active"
  | "ended"
  | "missed"
  | "declined"
  | "busy"
  | "failed";
type TurnIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
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
    // Never evaluate the JS package when its native module is absent. In Expo
    // Go the package throws at module-evaluation time before callers can use it.
    if (!NativeModules.WebRTCModule) return null;
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

async function updateCallStatus(callId: string, next: CallSessionStatus) {
  const update: Record<string, unknown> = { status: next };
  if (next === "active") update.answered_at = new Date().toISOString();
  if (["ended", "missed", "declined", "busy", "failed"].includes(next)) {
    update.ended_at = new Date().toISOString();
  }
  const { data, error } = await supabase
    .from("calls")
    .update(update)
    .eq("id", callId)
    .select("id")
    .maybeSingle();
  if (error || !data) throw new Error(error?.message || "Could not update call status");
}

async function getTurnIceServers(callId: string): Promise<TurnIceServer[]> {
  const { data, error } = await supabase.functions.invoke("call-turn-credentials", {
    body: { callId },
  });
  const servers = data?.iceServers;
  const hasTurn = Array.isArray(servers) && servers.some((server: TurnIceServer) => {
    const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls];
    return urls.some((url) => typeof url === "string" && url.toLowerCase().startsWith("turn"));
  });
  if (error || !hasTurn) {
    throw new Error("Secure call relay is unavailable. Please try again later.");
  }
  return servers as TurnIceServer[];
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

async function finishCall(sendEnd: boolean, finalStatus?: CallSessionStatus) {
  const oldInfo = info;
  if (sendEnd && oldInfo) {
    await sendSignal("end", { callId: oldInfo.callId });
  }
  stopPeer();
  removeSignalChannel();
  if (oldInfo && finalStatus) {
    try {
      await updateCallStatus(oldInfo.callId, finalStatus);
    } catch (error) {
      if (__DEV__) console.warn("[calls] status update failed", error);
    }
  }
  info = null;
  setStatus("ended");
  setTimeout(() => {
    if (status === "ended") setStatus("idle");
  }, 350);
}

function configurePeer(callId: string, isCaller: boolean, iceServers: TurnIceServer[]) {
  const bridge = detectRtc();
  if (!bridge) throw new Error("Voice calls require a native build or WebRTC-enabled browser");

  peer = new bridge.RTCPeerConnection({
    iceServers,
    iceTransportPolicy: "all",
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
    } else if (state === "failed") {
      void finishCall(false, "failed");
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
    .channel(`call:${callId}`, { config: { private: true, broadcast: { self: false } } })
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

function handleCallRow(row: any, userId: string) {
  const callId = typeof row?.id === "string" ? row.id : "";
  const callerId = typeof row?.caller_id === "string" ? row.caller_id : "";
  const calleeId = typeof row?.callee_id === "string" ? row.callee_id : "";
  const chatId = typeof row?.chat_id === "string" ? row.chat_id : "";
  if (!callId || !callerId || !calleeId || !chatId || callerId === calleeId) return;

  if (calleeId === userId && row.status === "ringing") {
    if (status !== "idle") {
      void updateCallStatus(callId, "busy").catch(() => {});
      return;
    }
    if (info?.callId === callId) return;

    const callerName = "AfuChat user";
    const notice: IncomingCallNotice = {
      callId,
      callerId,
      callerName,
      callerAvatar: null,
      chatId,
    };
    const startedAt = typeof row.started_at === "string"
      ? Date.parse(row.started_at)
      : Date.now();
    info = {
      callId,
      callerId,
      calleeId,
      callerName,
      callerAvatar: null,
      calleeName: "",
      calleeAvatar: null,
      chatId,
      startedAt: Number.isFinite(startedAt) ? startedAt : Date.now(),
      answeredAt: null,
      isCaller: false,
    };
    setStatus("incoming_ringing");
    emit({ type: "incoming", notice });

    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", callerId)
        .maybeSingle();
      if (!data || !isCurrentIncomingCall(callId)) return;
      const enrichedName = data.display_name || callerName;
      const enrichedAvatar = data.avatar_url || null;
      info = { ...info, callerName: enrichedName, callerAvatar: enrichedAvatar };
      setStatus("incoming_ringing");
      emit({
        type: "incoming",
        notice: { ...notice, callerName: enrichedName, callerAvatar: enrichedAvatar },
      });
    })().catch(() => {});
    return;
  }

  if (
    row.id !== info?.callId ||
    !["ended", "missed", "declined", "busy", "failed"].includes(row.status)
  ) {
    return;
  }
  if (status === "incoming_ringing") {
    info = null;
    stopPeer();
    removeSignalChannel();
    setStatus("ended");
    setTimeout(() => {
      if (status === "ended") setStatus("idle");
    }, 350);
  } else {
    void finishCall(false);
  }
}

function isCurrentIncomingCall(callId: string) {
  return status === "incoming_ringing" && info?.callId === callId;
}

export async function initCallEngine(userId: string): Promise<() => void> {
  currentUserId = userId;
  if (inboxChannel) void supabase.removeChannel(inboxChannel);
  inboxChannel = supabase
    .channel(`calls:${userId}`, { config: { private: true } })
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "calls", filter: `callee_id=eq.${userId}` },
      ({ new: row }: any) => handleCallRow(row, userId),
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "calls", filter: `callee_id=eq.${userId}` },
      ({ new: row }: any) => handleCallRow(row, userId),
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "calls", filter: `caller_id=eq.${userId}` },
      ({ new: row }: any) => handleCallRow(row, userId),
    );
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
  calleeId: string;
  calleeName: string;
  calleeAvatar: string | null;
  myId: string;
  myName: string;
  myAvatar: string | null;
  chatId: string | null;
}): Promise<string> {
  if (status !== "idle") throw new Error("A call is already in progress");
  if (!params.chatId) throw new Error("Calls can only be started from a direct chat.");
  if (!detectRtc()) {
    if (Platform.OS === "web") {
      throw new Error("Voice calls need a secure browser connection and microphone access.");
    }
    if (isExpoGo()) {
      throw new Error("Voice calls need the installed AfuChat app; Expo Go does not include WebRTC.");
    }
    throw new Error("Voice calls are unavailable in this AfuChat build. Update the app and try again.");
  }
  const bridge = detectRtc() as RtcBridge;
  let callId: string | null = null;
  try {
    localStream = await bridge.mediaDevices.getUserMedia({ audio: true, video: false });
    setNativeSpeakerphone(false);
    const { data: call, error: insertError } = await supabase
      .from("calls")
      .insert({
        room_id: params.chatId,
        caller_id: params.myId,
        callee_id: params.calleeId,
        call_type: "voice",
        status: "initiated",
        chat_id: params.chatId,
      })
      .select("id, started_at")
      .single();
    if (insertError || !call?.id) {
      throw new Error(insertError?.message || "Could not create the call session");
    }
    const createdCallId = String(call.id);
    callId = createdCallId;
    const startedAt = call.started_at ? Date.parse(call.started_at) : Date.now();
    info = {
      callId: createdCallId,
      callerId: params.myId,
      calleeId: params.calleeId,
      callerName: params.myName,
      callerAvatar: params.myAvatar,
      calleeName: params.calleeName,
      calleeAvatar: params.calleeAvatar,
      chatId: params.chatId,
      startedAt: Number.isFinite(startedAt) ? startedAt : Date.now(),
      answeredAt: null,
      isCaller: true,
    };
    const iceServers = await getTurnIceServers(createdCallId);
    configurePeer(createdCallId, true, iceServers);
    configureSignalChannel(createdCallId, true);
    await subscribe(signalChannel);
    setStatus("outgoing_ringing");
    ringTimer = setTimeout(() => void finishCall(true, "missed"), 30000);
    const { data: ringingCall, error: ringError } = await supabase
      .from("calls")
      .update({ status: "ringing" })
      .eq("id", createdCallId)
      .select("id")
      .maybeSingle();
    if (ringError || !ringingCall) {
      throw new Error(ringError?.message || "Could not ring the recipient");
    }
    void notifyCallRecipient({
      recipientId: params.calleeId,
      senderId: params.myId,
      callerName: params.myName,
      callerAvatar: params.myAvatar,
      callId: createdCallId,
      chatId: params.chatId,
    });
    return createdCallId;
  } catch (error) {
    await finishCall(false, callId ? "failed" : undefined);
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
  if (!bridge) {
    if (Platform.OS === "web") {
      throw new Error("Voice calls need a secure browser connection and microphone access.");
    }
    if (isExpoGo()) {
      throw new Error("Voice calls need the installed AfuChat app; Expo Go does not include WebRTC.");
    }
    throw new Error("Voice calls are unavailable in this AfuChat build. Update the app and try again.");
  }
  try {
    const { data: call, error: callError } = await supabase
      .from("calls")
      .select("id, caller_id, callee_id, chat_id, status, started_at, answered_at")
      .eq("id", notice.callId)
      .maybeSingle();
    if (
      callError ||
      !call ||
      call.callee_id !== params.myId ||
      call.caller_id !== notice.callerId ||
      call.status !== "ringing" ||
      !call.chat_id
    ) {
      throw new Error("This call is no longer available.");
    }
    info = {
      ...info,
      callId: call.id,
      callerId: call.caller_id,
      calleeId: call.callee_id,
      chatId: call.chat_id,
      startedAt: call.started_at ? Date.parse(call.started_at) : info.startedAt,
      answeredAt: call.answered_at ? Date.parse(call.answered_at) : null,
      isCaller: false,
    };
    const iceServers = await getTurnIceServers(notice.callId);
    localStream = await bridge.mediaDevices.getUserMedia({ audio: true, video: false });
    setNativeSpeakerphone(false);
    configurePeer(notice.callId, false, iceServers);
    configureSignalChannel(notice.callId, false);
    await subscribe(signalChannel);
    await updateCallStatus(notice.callId, "active");
    setStatus("connecting");
    await sendSignal("ready", {
      callId: notice.callId,
      userId: params.myId,
      userName: params.myName,
      userAvatar: params.myAvatar,
    });
  } catch (error) {
    await finishCall(false, "failed");
    throw error;
  }
}

export function declineCall(notice: IncomingCallNotice) {
  void updateCallStatus(notice.callId, "declined").catch(() => {});
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
  await finishCall(true, "ended");
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
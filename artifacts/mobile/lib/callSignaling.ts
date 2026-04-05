import { Platform } from "react-native";
import { supabase } from "./supabase";

let RTCPeerConnection: any;
let RTCSessionDescription: any;
let RTCIceCandidate: any;
let mediaDevices: any;
let RTCView: any;

if (Platform.OS !== "web") {
  try {
    const webrtc = require("react-native-webrtc");
    RTCPeerConnection = webrtc.RTCPeerConnection;
    RTCSessionDescription = webrtc.RTCSessionDescription;
    RTCIceCandidate = webrtc.RTCIceCandidate;
    mediaDevices = webrtc.mediaDevices;
    RTCView = webrtc.RTCView;
  } catch (_) {}
}

export { RTCView };

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun.services.mozilla.com" },
];

export type CallType = "voice" | "video";
export type CallStatus =
  | "ringing"
  | "active"
  | "ended"
  | "declined"
  | "missed"
  | "busy";

export interface CallRecord {
  id: string;
  room_id: string;
  caller_id: string;
  callee_id: string;
  call_type: CallType;
  status: CallStatus;
  started_at: string;
  answered_at?: string;
  ended_at?: string;
  duration_seconds?: number;
  chat_id?: string;
  caller?: { display_name: string; avatar_url?: string; handle: string };
  callee?: { display_name: string; avatar_url?: string; handle: string };
}

export async function initiateCall(params: {
  calleeId: string;
  chatId?: string;
  callType: CallType;
  callerId: string;
}): Promise<string> {
  const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const { data, error } = await supabase
    .from("calls")
    .insert({
      room_id: roomId,
      caller_id: params.callerId,
      callee_id: params.calleeId,
      call_type: params.callType,
      chat_id: params.chatId || null,
      status: "ringing",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message || "Failed to create call");
  return data.id;
}

export async function getCall(callId: string): Promise<CallRecord | null> {
  const { data, error } = await supabase
    .from("calls")
    .select(
      `*, caller:caller_id(display_name, avatar_url, handle), callee:callee_id(display_name, avatar_url, handle)`
    )
    .eq("id", callId)
    .maybeSingle();
  if (error || !data) return null;
  return data as any;
}

export async function updateCallStatus(
  callId: string,
  status: CallStatus,
  extra?: Record<string, any>
) {
  await supabase
    .from("calls")
    .update({ status, ...extra })
    .eq("id", callId);
}

export function listenForIncomingCalls(
  userId: string,
  onCall: (call: CallRecord) => void
): () => void {
  const channel = supabase
    .channel(`incoming_calls_${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "calls",
        filter: `callee_id=eq.${userId}`,
      },
      async (payload) => {
        const call = payload.new as any;
        if (call.status === "ringing") {
          const full = await getCall(call.id);
          if (full) onCall(full);
        }
      }
    )
    .subscribe();
  return () => {
    channel.unsubscribe();
  };
}

export class CallSession {
  private pc: any = null;
  private localStream: any = null;
  private remoteStream: any = null;
  private channel: any = null;
  private callId: string;
  private isCaller: boolean;
  private pendingCandidates: any[] = [];
  private remoteDescSet = false;
  private callType: CallType = "voice";

  public onLocalStream?: (stream: any) => void;
  public onRemoteStream?: (stream: any) => void;
  public onCallEnded?: () => void;
  public onCallConnected?: () => void;
  public onError?: (err: string) => void;

  constructor(callId: string, isCaller: boolean) {
    this.callId = callId;
    this.isCaller = isCaller;
  }

  async start(callType: CallType) {
    if (Platform.OS === "web" || !RTCPeerConnection) return;
    this.callType = callType;

    try {
      this.localStream = await mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video:
          callType === "video"
            ? { facingMode: "user", width: 640, height: 480 }
            : false,
      });
      this.onLocalStream?.(this.localStream);
    } catch (e: any) {
      this.onError?.("Could not access microphone or camera.");
      throw e;
    }

    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.localStream.getTracks().forEach((track: any) => {
      this.pc.addTrack(track, this.localStream);
    });

    this.pc.ontrack = (event: any) => {
      const [stream] = event.streams;
      if (stream) {
        this.remoteStream = stream;
        this.onRemoteStream?.(stream);
      }
    };

    this.pc.onicecandidate = (event: any) => {
      if (event.candidate) {
        this.channel?.send({
          type: "broadcast",
          event: "ice-candidate",
          payload: {
            candidate: event.candidate.toJSON(),
            from: this.isCaller ? "caller" : "callee",
          },
        });
      }
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState;
      if (state === "connected") {
        this.onCallConnected?.();
      } else if (
        state === "disconnected" ||
        state === "failed" ||
        state === "closed"
      ) {
        this.onCallEnded?.();
      }
    };

    this.channel = supabase.channel(`call:${this.callId}`, {
      config: { broadcast: { self: false } },
    });

    this.channel.on(
      "broadcast",
      { event: "offer" },
      async ({ payload }: any) => {
        if (!this.isCaller && this.pc) {
          await this.pc.setRemoteDescription(
            new RTCSessionDescription(payload.offer)
          );
          this.remoteDescSet = true;
          await this.drainCandidates();
          const answer = await this.pc.createAnswer();
          await this.pc.setLocalDescription(answer);
          this.channel.send({
            type: "broadcast",
            event: "answer",
            payload: { answer: this.pc.localDescription },
          });
        }
      }
    );

    this.channel.on(
      "broadcast",
      { event: "answer" },
      async ({ payload }: any) => {
        if (this.isCaller && this.pc) {
          await this.pc.setRemoteDescription(
            new RTCSessionDescription(payload.answer)
          );
          this.remoteDescSet = true;
          await this.drainCandidates();
          await updateCallStatus(this.callId, "active", {
            answered_at: new Date().toISOString(),
          });
        }
      }
    );

    this.channel.on(
      "broadcast",
      { event: "ice-candidate" },
      async ({ payload }: any) => {
        const fromCaller = payload.from === "caller";
        const shouldProcess =
          (fromCaller && !this.isCaller) || (!fromCaller && this.isCaller);
        if (shouldProcess) {
          if (this.remoteDescSet && this.pc) {
            try {
              await this.pc.addIceCandidate(
                new RTCIceCandidate(payload.candidate)
              );
            } catch (_) {}
          } else {
            this.pendingCandidates.push(payload.candidate);
          }
        }
      }
    );

    this.channel.on("broadcast", { event: "end-call" }, () => {
      this.cleanup();
      this.onCallEnded?.();
    });

    await this.channel.subscribe();

    if (this.isCaller) {
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: callType === "video",
      });
      await this.pc.setLocalDescription(offer);
      await new Promise((r) => setTimeout(r, 600));
      this.channel.send({
        type: "broadcast",
        event: "offer",
        payload: { offer: this.pc.localDescription },
      });
    }
  }

  private async drainCandidates() {
    for (const c of this.pendingCandidates) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(c));
      } catch (_) {}
    }
    this.pendingCandidates = [];
  }

  async toggleMute(): Promise<boolean> {
    if (!this.localStream) return false;
    const tracks = this.localStream.getAudioTracks();
    if (tracks.length > 0) {
      const nowEnabled = !tracks[0].enabled;
      tracks.forEach((t: any) => (t.enabled = nowEnabled));
      return !nowEnabled;
    }
    return false;
  }

  async toggleCamera(): Promise<boolean> {
    if (!this.localStream) return false;
    const tracks = this.localStream.getVideoTracks();
    if (tracks.length > 0) {
      const nowEnabled = !tracks[0].enabled;
      tracks.forEach((t: any) => (t.enabled = nowEnabled));
      return !nowEnabled;
    }
    return false;
  }

  flipCamera() {
    if (!this.localStream) return;
    const tracks = this.localStream.getVideoTracks();
    tracks.forEach((t: any) => {
      if (typeof t._switchCamera === "function") t._switchCamera();
    });
  }

  sendEndSignal() {
    this.channel?.send({
      type: "broadcast",
      event: "end-call",
      payload: {},
    });
  }

  cleanup() {
    this.localStream?.getTracks().forEach((t: any) => t.stop());
    this.pc?.close();
    this.channel?.unsubscribe();
    this.localStream = null;
    this.pc = null;
    this.channel = null;
  }

  getLocalStream() {
    return this.localStream;
  }
  getRemoteStream() {
    return this.remoteStream;
  }
}

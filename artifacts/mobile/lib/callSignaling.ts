import { Platform } from "react-native";
import { supabase } from "./supabase";
import { getIceServers } from "./calling/turnConfig";
import {
  AdaptiveBitrateManager,
  BandwidthTier,
  applyTierToPeerConnection,
} from "./calling/adaptiveBitrate";

let RTCPeerConnection: any;
let RTCSessionDescription: any;
let RTCIceCandidate: any;
let mediaDevices: any;
let RTCView: any;

if (Platform.OS === "web") {
  if (typeof window !== "undefined") {
    RTCPeerConnection = (window as any).RTCPeerConnection;
    RTCSessionDescription = (window as any).RTCSessionDescription;
    RTCIceCandidate = (window as any).RTCIceCandidate;
    mediaDevices = (navigator as any)?.mediaDevices;
  }
} else {
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
export type { BandwidthTier } from "./calling/adaptiveBitrate";

export function isCallSupported(): boolean {
  return !!(RTCPeerConnection && mediaDevices?.getUserMedia);
}

/**
 * Get a renderable URL for a MediaStream. Native uses stream.toURL();
 * the browser uses the stream object directly through the <video>.srcObject.
 */
export function getStreamForRender(stream: any): { url: string | null; raw: any } {
  if (!stream) return { url: null, raw: null };
  if (Platform.OS === "web") return { url: null, raw: stream };
  try {
    return { url: stream.toURL?.() ?? null, raw: stream };
  } catch {
    return { url: null, raw: stream };
  }
}

// ICE servers are loaded dynamically at call-start time via turnConfig.ts.
// They may come from Supabase app_settings (custom Coturn) or fall back to
// public STUN + OpenRelay TURN. The static array is kept only as a last-resort
// fallback inside getIceServers() itself.

export type CallType = "voice" | "video";
export type CallStatus =
  | "ringing"
  | "active"
  | "ended"
  | "declined"
  | "missed"
  | "busy";

/**
 * Quality buckets surfaced to the UI. Computed from the underlying
 * `RTCPeerConnection.iceConnectionState` and per-tick `getStats()`
 * samples (round-trip time, packet loss, jitter).
 */
export type CallQuality =
  | "connecting"
  | "excellent"
  | "good"
  | "poor"
  | "reconnecting"
  | "disconnected";

export interface CallQualityStats {
  quality: CallQuality;
  /** Round-trip time in milliseconds, if available. */
  rttMs: number | null;
  /** Fraction of packets lost in the last sample (0-1). */
  packetLoss: number | null;
  /** Jitter in milliseconds, if available. */
  jitterMs: number | null;
  /** Raw ICE connection state for debugging. */
  iceState: string | null;
}

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
  // Track calls we've already surfaced so reconnects don't duplicate them.
  const seenCallIds = new Set<string>();

  /**
   * On mobile data the WebSocket can drop and reconnect, missing INSERT
   * events that arrived during the gap. Every time the channel (re)subscribes
   * we query for any "ringing" calls from the last 30 seconds so nothing slips
   * through.
   */
  async function checkRecentRingingCalls() {
    try {
      const since = new Date(Date.now() - 30_000).toISOString();
      const { data } = await supabase
        .from("calls")
        .select(`*, caller:caller_id(display_name, avatar_url, handle), callee:callee_id(display_name, avatar_url, handle)`)
        .eq("callee_id", userId)
        .eq("status", "ringing")
        .gte("started_at", since);
      for (const call of data ?? []) {
        if (!seenCallIds.has(call.id)) {
          seenCallIds.add(call.id);
          onCall(call as CallRecord);
        }
      }
    } catch (_) {}
  }

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
        if (call.status === "ringing" && !seenCallIds.has(call.id)) {
          seenCallIds.add(call.id);
          const full = await getCall(call.id);
          if (full) onCall(full);
        }
      }
    )
    .subscribe((status: string) => {
      // Each time we (re)subscribe — including after a mobile data reconnect —
      // poll for any ringing calls we might have missed during the gap.
      if (status === "SUBSCRIBED") {
        checkRecentRingingCalls();
      }
    });

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
  private offerRetransmitTimer: ReturnType<typeof setInterval> | null = null;
  private answered = false;
  private calleeReady = false;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private lastStatsSample: {
    timestamp: number;
    packetsLost: number;
    packetsReceived: number;
  } | null = null;
  private currentQuality: CallQualityStats = {
    quality: "connecting",
    rttMs: null,
    packetLoss: null,
    jitterMs: null,
    iceState: null,
  };

  // ── ICE restart state ──────────────────────────────────────────────────────
  private iceRestartAttempts = 0;
  private readonly maxIceRestarts = 3;
  private iceDisconnectedTimer: ReturnType<typeof setTimeout> | null = null;
  private iceRestartInProgress = false;

  // ── Adaptive bitrate ───────────────────────────────────────────────────────
  private abrManager = new AdaptiveBitrateManager();
  private currentBandwidthTier: BandwidthTier = "hd";

  public onLocalStream?: (stream: any) => void;
  public onRemoteStream?: (stream: any) => void;
  public onCallEnded?: () => void;
  public onCallConnected?: () => void;
  public onError?: (err: string) => void;
  public onQualityChange?: (stats: CallQualityStats) => void;
  public onBandwidthTierChange?: (tier: BandwidthTier) => void;

  constructor(callId: string, isCaller: boolean) {
    this.callId = callId;
    this.isCaller = isCaller;
  }

  async start(callType: CallType) {
    if (!RTCPeerConnection || !mediaDevices?.getUserMedia) {
      this.onError?.("Calls aren't supported on this device.");
      return;
    }
    this.callType = callType;

    // Load TURN/STUN servers (from Supabase app_settings or fallback)
    const iceServers = await getIceServers();

    try {
      this.localStream = await mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // Opus codec preferred: browser/RN-WebRTC will negotiate this
        },
        video:
          callType === "video"
            ? {
                facingMode: "user",
                width:     { ideal: 1280 },
                height:    { ideal: 720  },
                frameRate: { ideal: 24  },
              }
            : false,
      });
      this.onLocalStream?.(this.localStream);
    } catch (e: any) {
      this.onError?.("Could not access microphone or camera.");
      throw e;
    }

    this.pc = new RTCPeerConnection({
      iceServers,
      // Bundle policy: all tracks share one transport → lower latency & battery
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    });

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
        this.broadcast("ice-candidate", {
          candidate: event.candidate.toJSON(),
          from: this.isCaller ? "caller" : "callee",
        }).catch(() => {});
      }
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState;
      if (state === "connected") {
        this.onCallConnected?.();
        this.startStatsMonitor();
        // Clear restart state on successful (re)connect
        this.iceRestartAttempts = 0;
        this.iceRestartInProgress = false;
        this.clearIceDisconnectedTimer();
      } else if (state === "closed") {
        this.onCallEnded?.();
      }
      // NOTE: "disconnected" and "failed" are handled in oniceconnectionstatechange
      // with a delay + ICE restart. We do NOT immediately fire onCallEnded here.
    };

    this.pc.oniceconnectionstatechange = () => {
      const ice = this.pc?.iceConnectionState as string | undefined;
      if (!ice) return;
      this.currentQuality.iceState = ice;
      let next: CallQuality | null = null;

      if (ice === "checking" || ice === "new") {
        next = "connecting";
        this.clearIceDisconnectedTimer();
      } else if (ice === "disconnected") {
        next = "reconnecting";
        // Wait 4s before triggering ICE restart — transient disconnects resolve on their own
        this.scheduleIceRestart(4000);
      } else if (ice === "failed") {
        next = "disconnected";
        // Immediate ICE restart on hard failure
        this.scheduleIceRestart(0);
      } else if (ice === "closed") {
        next = "disconnected";
        this.clearIceDisconnectedTimer();
        this.onCallEnded?.();
      } else if (ice === "connected" || ice === "completed") {
        this.clearIceDisconnectedTimer();
        this.iceRestartAttempts = 0;
        this.iceRestartInProgress = false;
        if (
          this.currentQuality.quality === "connecting" ||
          this.currentQuality.quality === "reconnecting" ||
          this.currentQuality.quality === "disconnected"
        ) {
          next = "good";
        }
      }

      if (next && next !== this.currentQuality.quality) {
        this.currentQuality = { ...this.currentQuality, quality: next };
        this.onQualityChange?.(this.currentQuality);
      }
    };

    this.channel = supabase.channel(`call:${this.callId}`, {
      config: { broadcast: { self: false, ack: true } },
    });

    this.channel.on(
      "broadcast",
      { event: "offer" },
      async ({ payload }: any) => {
        if (!this.isCaller && this.pc) {
          // Block duplicate retransmits of the initial offer once we've already
          // answered. But ICE restart offers MUST be processed even after the
          // initial exchange — failing to do so is what causes calls on mobile
          // data to stay stuck in "reconnecting" forever.
          if (this.remoteDescSet && !payload.iceRestart) return;
          try {
            await this.pc.setRemoteDescription(
              new RTCSessionDescription(payload.offer)
            );
            this.remoteDescSet = true;
            await this.drainCandidates();
            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);
            await this.broadcast("answer", {
              answer: this.pc.localDescription,
              iceRestart: !!payload.iceRestart,
            });
            // If this was an ICE restart, clear our in-progress flag too.
            if (payload.iceRestart) {
              this.iceRestartInProgress = false;
              this.iceRestartAttempts = 0;
            }
          } catch (_) {}
        }
      }
    );

    this.channel.on(
      "broadcast",
      { event: "answer" },
      async ({ payload }: any) => {
        if (!this.isCaller || !this.pc) return;
        // Accept the initial answer OR any answer completing an ICE restart.
        // Previously this was `!this.answered` only, so ICE restart answers
        // were silently dropped and the restart never completed.
        const isInitial = !this.answered;
        const isRestartAnswer = this.iceRestartInProgress;
        if (!isInitial && !isRestartAnswer) return;

        if (isInitial) {
          this.answered = true;
          this.stopOfferRetransmit();
        }
        this.iceRestartInProgress = false;

        try {
          await this.pc.setRemoteDescription(
            new RTCSessionDescription(payload.answer)
          );
          this.remoteDescSet = true;
          await this.drainCandidates();
          if (isInitial) {
            await updateCallStatus(this.callId, "active", {
              answered_at: new Date().toISOString(),
            });
          }
        } catch (_) {}
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

    // Callee → caller "I've joined and I'm ready" handshake. Without
    // this, the caller sends the offer before the callee's WebSocket is
    // open and supabase-realtime falls back to slow REST broadcast,
    // which often loses the message and leaves the call stuck on
    // "Connecting...".
    this.channel.on("broadcast", { event: "callee-ready" }, () => {
      if (this.isCaller && !this.calleeReady) {
        this.calleeReady = true;
        // Send the offer immediately now that we know the callee is listening.
        this.sendOfferNow().catch(() => {});
      }
    });

    this.channel.on("broadcast", { event: "end-call" }, () => {
      this.cleanup();
      this.onCallEnded?.();
    });

    // Callee requests caller to perform an ICE restart
    this.channel.on("broadcast", { event: "request-ice-restart" }, () => {
      if (this.isCaller && !this.iceRestartInProgress) {
        this.attemptIceRestart().catch(() => {});
      }
    });

    // Peer signals a bandwidth tier change (e.g. "audio_only") so we can
    // show an appropriate UI indicator even on the receiving end.
    this.channel.on(
      "broadcast",
      { event: "bandwidth-tier" },
      ({ payload }: any) => {
        if (payload?.tier && payload.tier !== this.currentBandwidthTier) {
          this.currentBandwidthTier = payload.tier as BandwidthTier;
          this.onBandwidthTierChange?.(this.currentBandwidthTier);
        }
      },
    );

    await this.waitForSubscribed();

    if (this.isCaller) {
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: callType === "video",
      });
      await this.pc.setLocalDescription(offer);
      // Start retransmitting the offer every 1.5s until we receive an
      // answer. The first attempt fires immediately; subsequent attempts
      // cover the case where the callee subscribed after our first send.
      this.startOfferRetransmit();
    } else {
      // Tell the caller we're listening. On mobile data, the WebSocket
      // handshake can take several seconds — retry for ~10s (12 × 800ms)
      // to cover slow cellular connections where 2.5s was too short.
      for (let i = 0; i < 12; i++) {
        await this.broadcast("callee-ready", {});
        await new Promise((r) => setTimeout(r, 800));
        if (this.remoteDescSet) break;
      }
    }
  }

  /** Wait until the realtime channel reaches the SUBSCRIBED state. */
  private waitForSubscribed(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        // Don't reject — fall back to REST broadcast rather than failing
        // the call entirely. Increased from 5s → 10s for mobile data.
        resolve();
      }, 10000);
      this.channel.subscribe((status: string) => {
        if (settled) return;
        if (status === "SUBSCRIBED") {
          settled = true;
          clearTimeout(timeout);
          resolve();
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error(`Realtime ${status}`));
        }
      });
    });
  }

  /** Send a broadcast over the realtime channel. */
  private async broadcast(event: string, payload: any) {
    try {
      await this.channel?.send({ type: "broadcast", event, payload });
    } catch (_) {}
  }

  private async sendOfferNow() {
    if (this.answered || !this.pc?.localDescription) return;
    await this.broadcast("offer", {
      offer: this.pc.localDescription,
    });
  }

  private startOfferRetransmit() {
    this.stopOfferRetransmit();
    // First send immediately
    this.sendOfferNow().catch(() => {});
    let attempts = 0;
    this.offerRetransmitTimer = setInterval(() => {
      attempts++;
      if (this.answered || attempts > 20) {
        this.stopOfferRetransmit();
        return;
      }
      this.sendOfferNow().catch(() => {});
    }, 1500);
  }

  private stopOfferRetransmit() {
    if (this.offerRetransmitTimer) {
      clearInterval(this.offerRetransmitTimer);
      this.offerRetransmitTimer = null;
    }
  }

  // ── ICE Restart ──────────────────────────────────────────────────────────────

  private scheduleIceRestart(delayMs: number) {
    if (this.iceRestartInProgress) return;
    this.clearIceDisconnectedTimer();
    this.iceDisconnectedTimer = setTimeout(() => {
      this.attemptIceRestart().catch(() => {});
    }, delayMs);
  }

  private clearIceDisconnectedTimer() {
    if (this.iceDisconnectedTimer) {
      clearTimeout(this.iceDisconnectedTimer);
      this.iceDisconnectedTimer = null;
    }
  }

  private async attemptIceRestart() {
    if (!this.pc || this.iceRestartInProgress) return;
    if (this.iceRestartAttempts >= this.maxIceRestarts) {
      // Exhausted retries — the call is truly lost
      this.currentQuality = { ...this.currentQuality, quality: "disconnected" };
      this.onQualityChange?.(this.currentQuality);
      this.cleanup();
      this.onCallEnded?.();
      return;
    }

    this.iceRestartInProgress = true;
    this.iceRestartAttempts++;

    try {
      if (this.isCaller) {
        // Caller triggers the restart: create a new offer with iceRestart=true
        const offer = await this.pc.createOffer({ iceRestart: true });
        await this.pc.setLocalDescription(offer);
        await this.broadcast("offer", {
          offer: this.pc.localDescription,
          iceRestart: true,
        });
      } else {
        // Callee: signal the caller to restart (caller owns the renegotiation)
        await this.broadcast("request-ice-restart", {});
      }
    } catch {
      // If we can't renegotiate, schedule another attempt
      this.iceRestartInProgress = false;
      this.scheduleIceRestart(5000);
    }
  }

  // ── Adaptive Bitrate ─────────────────────────────────────────────────────────

  private async applyBandwidthTier(tier: BandwidthTier) {
    if (tier === this.currentBandwidthTier) return;
    this.currentBandwidthTier = tier;
    this.onBandwidthTierChange?.(tier);
    // Tell the remote peer so they can show an indicator
    this.broadcast("bandwidth-tier", { tier }).catch(() => {});
    // Apply constraints to video senders
    await applyTierToPeerConnection(this.pc, this.localStream, tier);
  }

  /**
   * Sample WebRTC stats every 2s to derive an accurate quality bucket from
   * RTT, jitter, and packet loss. Falls back to ICE state alone if the
   * browser/native shim doesn't expose `getStats`.
   */
  private startStatsMonitor() {
    if (this.statsTimer) return;
    if (!this.pc || typeof this.pc.getStats !== "function") return;
    this.statsTimer = setInterval(() => {
      this.sampleStats().catch(() => {});
    }, 2000);
    // Take an immediate sample so the indicator updates fast.
    this.sampleStats().catch(() => {});
  }

  private stopStatsMonitor() {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
    this.lastStatsSample = null;
  }

  private async sampleStats() {
    if (!this.pc) return;
    let report: any;
    try {
      report = await this.pc.getStats();
    } catch {
      return;
    }
    let rttMs: number | null = null;
    let jitterMs: number | null = null;
    let packetsLost = 0;
    let packetsReceived = 0;
    const iter = typeof report?.values === "function" ? report.values() : report;
    if (iter && typeof iter[Symbol.iterator] === "function") {
      for (const stat of iter as Iterable<any>) {
        if (!stat || typeof stat !== "object") continue;
        if (
          stat.type === "candidate-pair" &&
          (stat.state === "succeeded" || stat.nominated) &&
          typeof stat.currentRoundTripTime === "number"
        ) {
          rttMs = stat.currentRoundTripTime * 1000;
        }
        if (stat.type === "inbound-rtp" && !stat.isRemote) {
          if (typeof stat.jitter === "number") {
            const j = stat.jitter * 1000;
            jitterMs = jitterMs == null ? j : Math.max(jitterMs, j);
          }
          if (typeof stat.packetsLost === "number") {
            packetsLost += stat.packetsLost;
          }
          if (typeof stat.packetsReceived === "number") {
            packetsReceived += stat.packetsReceived;
          }
        }
        if (
          stat.type === "remote-inbound-rtp" &&
          typeof stat.roundTripTime === "number" &&
          rttMs == null
        ) {
          rttMs = stat.roundTripTime * 1000;
        }
      }
    }

    let packetLoss: number | null = null;
    const now = Date.now();
    if (this.lastStatsSample) {
      const dLost = packetsLost - this.lastStatsSample.packetsLost;
      const dRecv = packetsReceived - this.lastStatsSample.packetsReceived;
      const total = dLost + dRecv;
      if (total > 0) packetLoss = Math.max(0, dLost) / total;
    }
    this.lastStatsSample = { timestamp: now, packetsLost, packetsReceived };

    // Don't override an actively-degraded ICE state.
    const ice = this.currentQuality.iceState;
    if (ice === "disconnected") {
      this.currentQuality = {
        ...this.currentQuality,
        rttMs,
        jitterMs,
        packetLoss,
      };
      this.onQualityChange?.(this.currentQuality);
      return;
    }
    if (ice === "failed" || ice === "closed") return;

    // Bucket quality from measured metrics. Thresholds chosen for voice/video
    // calls: <150ms RTT + <2% loss feels excellent; >400ms or >8% loss is poor.
    let quality: CallQuality = "good";
    const lossPct = packetLoss == null ? 0 : packetLoss * 100;
    const rtt = rttMs ?? 0;
    const jit = jitterMs ?? 0;
    if (rtt < 150 && lossPct < 2 && jit < 30) quality = "excellent";
    else if (rtt < 300 && lossPct < 5 && jit < 60) quality = "good";
    else quality = "poor";

    // If we have no measurements yet (first sample after connect), prefer
    // "good" over a stale "connecting".
    if (
      rttMs == null &&
      packetLoss == null &&
      jitterMs == null &&
      this.currentQuality.quality === "connecting"
    ) {
      quality = "good";
    }

    const next: CallQualityStats = {
      quality,
      rttMs,
      packetLoss,
      jitterMs,
      iceState: ice,
    };
    const changed =
      next.quality !== this.currentQuality.quality ||
      next.rttMs !== this.currentQuality.rttMs ||
      next.packetLoss !== this.currentQuality.packetLoss ||
      next.jitterMs !== this.currentQuality.jitterMs;
    this.currentQuality = next;
    if (changed) this.onQualityChange?.(this.currentQuality);

    // ── Adaptive bitrate ─────────────────────────────────────────────────────
    // Only adapt video calls. Audio-only calls have no video to degrade.
    if (this.callType === "video") {
      const newTier = this.abrManager.sample(next, true);
      if (newTier) {
        this.applyBandwidthTier(newTier).catch(() => {});
      }
    }
  }

  getQuality(): CallQualityStats {
    return this.currentQuality;
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
    this.broadcast("end-call", {}).catch(() => {});
  }

  cleanup() {
    this.stopOfferRetransmit();
    this.stopStatsMonitor();
    this.clearIceDisconnectedTimer();
    this.abrManager.reset();
    this.localStream?.getTracks().forEach((t: any) => t.stop());
    this.pc?.close();
    this.channel?.unsubscribe();
    this.localStream = null;
    this.remoteStream = null;
    this.pc = null;
    this.channel = null;
    this.iceRestartInProgress = false;
    this.iceRestartAttempts = 0;
  }

  getBandwidthTier(): BandwidthTier { return this.currentBandwidthTier; }

  getLocalStream() {
    return this.localStream;
  }
  getRemoteStream() {
    return this.remoteStream;
  }
}

import { NativeModules, Platform, TurboModuleRegistry } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "@/lib/supabase";
import { isExpoGo } from "@/lib/expoEnvironment";

const SIGNAL_TIMEOUT_MS = 10_000;
const MAX_TRANSFER_BYTES = 250 * 1024 * 1024;
const CHUNK_SIZE = 16 * 1024;
const MAX_BUFFERED_AMOUNT = 512 * 1024;

type RtcBridge = {
  RTCPeerConnection: any;
  RTCSessionDescription: any;
  RTCIceCandidate: any;
};

export type LocalTransferInvite = {
  transferId: string;
  senderId: string;
  senderName: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: number;
};

export type LocalTransferProgress = {
  transferId: string;
  direction: "send" | "receive";
  status: "waiting" | "connecting" | "transferring" | "complete" | "failed" | "cancelled";
  fileName: string;
  fileSize: number;
  transferredBytes: number;
  peerName: string;
  localUri?: string;
  error?: string;
};

type TransferCallbacks = {
  onInvite: (invite: LocalTransferInvite) => void;
  onProgress: (progress: LocalTransferProgress) => void;
  onError: (message: string) => void;
};

type TransferSession = {
  transferId: string;
  direction: "send" | "receive";
  fileName: string;
  fileSize: number;
  mimeType: string;
  peerName: string;
  peerId: string;
  localUri?: string;
  peer: any;
  dataChannel: any;
  signalChannel: any;
  remoteDescriptionReady: boolean;
  pendingCandidates: any[];
  receivedBytes: number;
  writeQueue: Promise<void>;
  cleanedUp: boolean;
};

let rtc: RtcBridge | null | undefined;
let inboxChannel: any = null;
let inboxUserId: string | null = null;
let callbacks: TransferCallbacks = {
  onInvite: () => {},
  onProgress: () => {},
  onError: () => {},
};
const sessions = new Map<string, TransferSession>();

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function emitProgress(progress: LocalTransferProgress): void {
  try {
    callbacks.onProgress(progress);
  } catch {}
}

function detectRtc(): RtcBridge | null {
  if (rtc) return rtc;

  if (Platform.OS === "web") {
    const g = globalThis as any;
    if (!g.RTCPeerConnection) {
      return null;
    }
    rtc = {
      RTCPeerConnection: g.RTCPeerConnection,
      RTCSessionDescription: g.RTCSessionDescription,
      RTCIceCandidate: g.RTCIceCandidate,
    };
    return rtc;
  }

  if (isExpoGo()) {
    return null;
  }

  try {
    if (!NativeModules.WebRTCModule && TurboModuleRegistry?.get) {
      try {
        (NativeModules as any).WebRTCModule = TurboModuleRegistry.get("WebRTCModule");
      } catch {}
    }
    const webrtc = require("react-native-webrtc");
    if (!webrtc?.RTCPeerConnection) {
      return null;
    }
    rtc = {
      RTCPeerConnection: webrtc.RTCPeerConnection,
      RTCSessionDescription: webrtc.RTCSessionDescription,
      RTCIceCandidate: webrtc.RTCIceCandidate,
    };
  } catch {
    return null;
  }
  return rtc;
}

export function isLocalTransferAvailable(): boolean {
  return !!detectRtc();
}

function subscribe(channel: any, timeoutMs = SIGNAL_TIMEOUT_MS): Promise<void> {
  if (channel.state === "joined") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Nearby transfer signaling timed out")), timeoutMs);
    channel.subscribe((state: string) => {
      if (state === "SUBSCRIBED") {
        clearTimeout(timeout);
        resolve();
      } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") {
        clearTimeout(timeout);
        reject(new Error("Nearby transfer signaling is unavailable"));
      }
    });
  });
}

async function sendToUser(userId: string, event: string, payload: Record<string, unknown>): Promise<void> {
  const channel = supabase.channel(`user-file-transfer:${userId}`);
  try {
    await subscribe(channel);
    await channel.send({ type: "broadcast", event, payload });
  } finally {
    void supabase.removeChannel(channel);
  }
}

async function sendTransferSignal(
  transferId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const channel = supabase.channel(`file-transfer:${transferId}`);
  try {
    await subscribe(channel);
    await channel.send({ type: "broadcast", event, payload });
  } finally {
    void supabase.removeChannel(channel);
  }
}

async function flushCandidates(session: TransferSession): Promise<void> {
  if (!session.peer || !session.remoteDescriptionReady) return;
  const bridge = detectRtc();
  if (!bridge) return;
  const candidates = session.pendingCandidates.splice(0);
  for (const candidate of candidates) {
    try {
      await session.peer.addIceCandidate(new bridge.RTCIceCandidate(candidate));
    } catch {}
  }
}

function closeSession(session: TransferSession): void {
  if (session.cleanedUp) return;
  session.cleanedUp = true;
  try { session.dataChannel?.close?.(); } catch {}
  try { session.peer?.close?.(); } catch {}
  if (session.signalChannel) void supabase.removeChannel(session.signalChannel);
  sessions.delete(session.transferId);
}

function failSession(session: TransferSession, message: string): void {
  emitProgress({
    transferId: session.transferId,
    direction: session.direction,
    status: "failed",
    fileName: session.fileName,
    fileSize: session.fileSize,
    transferredBytes: session.receivedBytes,
    peerName: session.peerName,
    localUri: session.localUri,
    error: message,
  });
  callbacks.onError(message);
  closeSession(session);
}

function createSignalChannel(session: TransferSession): any {
  const bridge = detectRtc();
  if (!bridge) throw new Error("Nearby transfer is unavailable on this device.");

  const channel = supabase
    .channel(`file-transfer:${session.transferId}`, { config: { broadcast: { self: false } } })
    .on("broadcast", { event: "accept" }, async () => {
      if (session.direction !== "send" || !session.peer) return;
      try {
        emitProgress({
          transferId: session.transferId,
          direction: "send",
          status: "connecting",
          fileName: session.fileName,
          fileSize: session.fileSize,
          transferredBytes: 0,
          peerName: session.peerName,
        });
        const offer = await session.peer.createOffer({ offerToReceiveAudio: false });
        await session.peer.setLocalDescription(offer);
        await channel.send({ type: "broadcast", event: "offer", payload: { description: offer } });
      } catch {
        failSession(session, "Could not create the nearby transfer connection.");
      }
    })
    .on("broadcast", { event: "offer" }, async ({ payload }: any) => {
      if (session.direction !== "receive" || !session.peer || !payload?.description) return;
      try {
        await session.peer.setRemoteDescription(new bridge.RTCSessionDescription(payload.description));
        session.remoteDescriptionReady = true;
        await flushCandidates(session);
        const answer = await session.peer.createAnswer();
        await session.peer.setLocalDescription(answer);
        await channel.send({ type: "broadcast", event: "answer", payload: { description: answer } });
      } catch {
        failSession(session, "Could not accept the nearby transfer connection.");
      }
    })
    .on("broadcast", { event: "answer" }, async ({ payload }: any) => {
      if (session.direction !== "send" || !session.peer || !payload?.description) return;
      try {
        await session.peer.setRemoteDescription(new bridge.RTCSessionDescription(payload.description));
        session.remoteDescriptionReady = true;
        await flushCandidates(session);
      } catch {
        failSession(session, "Could not complete the nearby transfer connection.");
      }
    })
    .on("broadcast", { event: "ice" }, async ({ payload }: any) => {
      if (!session.peer || !payload?.candidate) return;
      if (!session.remoteDescriptionReady) {
        session.pendingCandidates.push(payload.candidate);
        return;
      }
      try {
        await session.peer.addIceCandidate(new bridge.RTCIceCandidate(payload.candidate));
      } catch {}
    })
    .on("broadcast", { event: "reject" }, () => {
      if (session.direction !== "send") return;
      emitProgress({
        transferId: session.transferId,
        direction: "send",
        status: "cancelled",
        fileName: session.fileName,
        fileSize: session.fileSize,
        transferredBytes: 0,
        peerName: session.peerName,
      });
      closeSession(session);
    })
    .on("broadcast", { event: "cancel" }, () => {
      if (session.cleanedUp) return;
      emitProgress({
        transferId: session.transferId,
        direction: session.direction,
        status: "cancelled",
        fileName: session.fileName,
        fileSize: session.fileSize,
        transferredBytes: session.receivedBytes,
        peerName: session.peerName,
        localUri: session.localUri,
      });
      closeSession(session);
    });
  return channel;
}

function wirePeer(session: TransferSession): void {
  session.peer.onicecandidate = (event: any) => {
    if (event?.candidate) {
      void session.signalChannel?.send({
        type: "broadcast",
        event: "ice",
        payload: { candidate: event.candidate.toJSON?.() ?? event.candidate },
      });
    }
  };
  session.peer.oniceconnectionstatechange = () => {
    const state = session.peer?.iceConnectionState;
    if (state === "failed" || state === "closed") {
      failSession(session, "The nearby device connection was lost.");
    }
  };
  session.peer.onconnectionstatechange = () => {
    const state = session.peer?.connectionState;
    if (state === "failed" || state === "closed") {
      failSession(session, "The nearby device connection was lost.");
    }
  };
}

function waitForDataChannelBuffer(channel: any): Promise<void> {
  if ((channel?.bufferedAmount ?? 0) <= MAX_BUFFERED_AMOUNT) return Promise.resolve();
  return new Promise((resolve) => {
    const check = () => {
      if ((channel?.bufferedAmount ?? 0) <= MAX_BUFFERED_AMOUNT || channel?.readyState !== "open") {
        resolve();
      } else {
        setTimeout(check, 40);
      }
    };
    check();
  });
}

async function sendFile(session: TransferSession): Promise<void> {
  if (!session.localUri || !session.dataChannel) return;
  try {
    const content = await FileSystem.readAsStringAsync(session.localUri, {
      encoding: (FileSystem as any).EncodingType?.Base64 ?? "base64",
    });
    const totalChunks = Math.ceil(content.length / CHUNK_SIZE);
    for (let index = 0; index < totalChunks; index++) {
      if (session.cleanedUp || session.dataChannel.readyState !== "open") return;
      await waitForDataChannelBuffer(session.dataChannel);
      const chunk = content.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
      session.dataChannel.send(`chunk:${index}:${chunk}`);
      const transferredBytes = Math.min(
        session.fileSize,
        Math.round(((index + 1) / Math.max(totalChunks, 1)) * session.fileSize),
      );
      session.receivedBytes = transferredBytes;
      emitProgress({
        transferId: session.transferId,
        direction: "send",
        status: "transferring",
        fileName: session.fileName,
        fileSize: session.fileSize,
        transferredBytes,
        peerName: session.peerName,
      });
    }
    session.dataChannel.send(JSON.stringify({ type: "file-complete" }));
  } catch {
    failSession(session, "The file could not be read for nearby transfer.");
  }
}

function wireSenderDataChannel(session: TransferSession, channel: any): void {
  session.dataChannel = channel;
  channel.onopen = () => {
    if (session.cleanedUp) return;
    channel.send(JSON.stringify({
      type: "file-header",
      fileName: session.fileName,
      fileSize: session.fileSize,
      mimeType: session.mimeType,
    }));
    void sendFile(session);
  };
  channel.onerror = () => failSession(session, "The nearby transfer connection failed.");
  channel.onclose = () => {
    if (!session.cleanedUp && session.receivedBytes < session.fileSize) {
      failSession(session, "The nearby device disconnected before the file finished.");
    }
  };
}

function wireReceiverDataChannel(session: TransferSession, channel: any): void {
  session.dataChannel = channel;
  channel.onmessage = (event: any) => {
    const value = typeof event?.data === "string" ? event.data : "";
    if (value.startsWith("{")) {
      let message: any;
      try { message = JSON.parse(value); } catch { return; }
      if (message.type === "file-header") {
        emitProgress({
          transferId: session.transferId,
          direction: "receive",
          status: "transferring",
          fileName: session.fileName,
          fileSize: session.fileSize,
          transferredBytes: 0,
          peerName: session.peerName,
          localUri: session.localUri,
        });
      } else if (message.type === "file-complete") {
        session.writeQueue = session.writeQueue
          .then(async () => {
            if (session.cleanedUp || !session.localUri) return;
            emitProgress({
              transferId: session.transferId,
              direction: "receive",
              status: "complete",
              fileName: session.fileName,
              fileSize: session.fileSize,
              transferredBytes: session.fileSize,
              peerName: session.peerName,
              localUri: session.localUri,
            });
            try {
              await session.signalChannel?.send({
                type: "broadcast",
                event: "complete",
                payload: { localUri: session.localUri },
              });
            } catch {}
            setTimeout(() => closeSession(session), 1000);
          })
          .catch(() => failSession(session, "The received file could not be saved."));
      }
      return;
    }

    if (!value.startsWith("chunk:") || !session.localUri) return;
    const separator = value.indexOf(":", 6);
    if (separator < 0) return;
    const chunk = value.slice(separator + 1);
    session.receivedBytes = Math.min(
      session.fileSize,
      session.receivedBytes + Math.round(chunk.length * 0.75),
    );
    session.writeQueue = session.writeQueue
      .then(() => FileSystem.writeAsStringAsync(session.localUri!, chunk, {
        encoding: (FileSystem as any).EncodingType?.Base64 ?? "base64",
        append: true,
      } as any))
      .then(() => {
        emitProgress({
          transferId: session.transferId,
          direction: "receive",
          status: "transferring",
          fileName: session.fileName,
          fileSize: session.fileSize,
          transferredBytes: session.receivedBytes,
          peerName: session.peerName,
          localUri: session.localUri,
        });
      })
      .catch(() => failSession(session, "The received file could not be saved."));
  };
  channel.onerror = () => failSession(session, "The nearby transfer connection failed.");
  channel.onclose = () => {
    if (!session.cleanedUp && session.receivedBytes < session.fileSize) {
      failSession(session, "The sending device disconnected before the file finished.");
    }
  };
}

function createPeer(session: TransferSession): void {
  const bridge = detectRtc();
  if (!bridge) throw new Error("Nearby transfer is unavailable on this device.");
  session.peer = new bridge.RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  wirePeer(session);
  if (session.direction === "receive") {
    session.peer.ondatachannel = (event: any) => {
      if (event?.channel) wireReceiverDataChannel(session, event.channel);
    };
  } else {
    wireSenderDataChannel(session, session.peer.createDataChannel("afuchat-file", { ordered: true }));
  }
}

export async function initializeLocalTransferInbox(
  userId: string,
  nextCallbacks: TransferCallbacks,
): Promise<() => void> {
  if (inboxChannel) void supabase.removeChannel(inboxChannel);
  inboxUserId = userId;
  callbacks = nextCallbacks;
  inboxChannel = supabase
    .channel(`user-file-transfer:${userId}`, { config: { broadcast: { self: false } } })
    .on("broadcast", { event: "file-transfer-invite" }, ({ payload }: any) => {
      if (!payload?.transferId || !payload?.senderId || payload.senderId === userId) return;
      callbacks.onInvite(payload as LocalTransferInvite);
    });
  try {
    await subscribe(inboxChannel);
  } catch {
    callbacks.onError("Nearby transfer invitations are unavailable.");
  }

  return () => {
    if (inboxUserId !== userId) return;
    inboxUserId = null;
    if (inboxChannel) void supabase.removeChannel(inboxChannel);
    inboxChannel = null;
    callbacks = { onInvite: () => {}, onProgress: () => {}, onError: () => {} };
    for (const session of sessions.values()) closeSession(session);
  };
}

export async function startLocalTransfer(params: {
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  file: { uri: string; name: string; size: number; mimeType?: string };
}): Promise<string> {
  if (!detectRtc()) throw new Error("Nearby transfer is unavailable on this device.");
  if (!params.file.uri || params.file.size > MAX_TRANSFER_BYTES) {
    throw new Error("This file is too large for a direct nearby transfer.");
  }

  const transferId = makeId("transfer");
  const session: TransferSession = {
    transferId,
    direction: "send",
    fileName: params.file.name,
    fileSize: params.file.size,
    mimeType: params.file.mimeType ?? "application/octet-stream",
    peerName: params.recipientName,
    peerId: params.recipientId,
    localUri: params.file.uri,
    peer: null,
    dataChannel: null,
    signalChannel: null,
    remoteDescriptionReady: false,
    pendingCandidates: [],
    receivedBytes: 0,
    writeQueue: Promise.resolve(),
    cleanedUp: false,
  };

  try {
    createPeer(session);
    session.signalChannel = createSignalChannel(session);
    sessions.set(transferId, session);
    await subscribe(session.signalChannel);
    await sendToUser(params.recipientId, "file-transfer-invite", {
      transferId,
      senderId: params.senderId,
      senderName: params.senderName,
      fileName: session.fileName,
      fileSize: session.fileSize,
      mimeType: session.mimeType,
      createdAt: Date.now(),
    });
    emitProgress({
      transferId,
      direction: "send",
      status: "waiting",
      fileName: session.fileName,
      fileSize: session.fileSize,
      transferredBytes: 0,
      peerName: session.peerName,
    });
    return transferId;
  } catch (error) {
    closeSession(session);
    throw error instanceof Error ? error : new Error("Could not start nearby transfer.");
  }
}

export async function acceptLocalTransfer(
  invite: LocalTransferInvite,
  receiverId: string,
): Promise<void> {
  if (!detectRtc()) throw new Error("Nearby transfer is unavailable on this device.");
  const directory = `${FileSystem.documentDirectory ?? ""}afuchat_transfers/`;
  if (!FileSystem.documentDirectory) throw new Error("Device file storage is unavailable.");

  const safeName = invite.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "received-file";
  const localUri = `${directory}${invite.transferId}_${safeName}`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  await FileSystem.writeAsStringAsync(localUri, "", {
    encoding: (FileSystem as any).EncodingType?.Base64 ?? "base64",
  } as any);

  const session: TransferSession = {
    transferId: invite.transferId,
    direction: "receive",
    fileName: invite.fileName,
    fileSize: invite.fileSize,
    mimeType: invite.mimeType,
    peerName: invite.senderName,
    peerId: invite.senderId,
    localUri,
    peer: null,
    dataChannel: null,
    signalChannel: null,
    remoteDescriptionReady: false,
    pendingCandidates: [],
    receivedBytes: 0,
    writeQueue: Promise.resolve(),
    cleanedUp: false,
  };

  try {
    createPeer(session);
    session.signalChannel = createSignalChannel(session);
    sessions.set(invite.transferId, session);
    await subscribe(session.signalChannel);
    await session.signalChannel.send({
      type: "broadcast",
      event: "accept",
      payload: { receiverId },
    });
    emitProgress({
      transferId: invite.transferId,
      direction: "receive",
      status: "connecting",
      fileName: invite.fileName,
      fileSize: invite.fileSize,
      transferredBytes: 0,
      peerName: invite.senderName,
      localUri,
    });
  } catch (error) {
    closeSession(session);
    throw error instanceof Error ? error : new Error("Could not accept nearby transfer.");
  }
}

export async function rejectLocalTransfer(invite: LocalTransferInvite): Promise<void> {
  await sendTransferSignal(invite.transferId, "reject", {});
}

export async function cancelLocalTransfer(transferId: string): Promise<void> {
  const session = sessions.get(transferId);
  if (session) {
    try {
      await session.signalChannel?.send({ type: "broadcast", event: "cancel", payload: {} });
    } catch {}
    closeSession(session);
  } else {
    await sendTransferSignal(transferId, "cancel", {});
  }
}
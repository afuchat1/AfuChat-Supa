import { File, Directory, Paths } from "expo-file-system";
import { NativeModules, Platform, TurboModuleRegistry } from "react-native";
import { isExpoGo } from "@/lib/expoEnvironment";

const MAX_TRANSFER_BYTES = 250 * 1024 * 1024;
const CHUNK_SIZE = 16 * 1024;
const MAX_BUFFERED_AMOUNT = 512 * 1024;
const ICE_GATHER_TIMEOUT_MS = 12_000;
const QR_PREFIX = "afuchat-transfer-v1:";

type RtcBridge = {
  RTCPeerConnection: any;
  RTCSessionDescription: any;
};

export type LocalTransferProgress = {
  transferId: string;
  direction: "send" | "receive";
  status:
    | "waiting"
    | "connecting"
    | "transferring"
    | "complete"
    | "failed"
    | "cancelled";
  fileName: string;
  fileSize: number;
  transferredBytes: number;
  peerName: string;
  localUri?: string;
  error?: string;
};

export type LocalTransferOffer = {
  transferId: string;
  senderId: string;
  senderName: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  checksum: string | null;
  createdAt: number;
  description: Record<string, unknown>;
};

export type LocalTransferAnswer = {
  transferId: string;
  receiverName: string;
  description: Record<string, unknown>;
};

type Session = {
  transferId: string;
  direction: "send" | "receive";
  fileName: string;
  fileSize: number;
  mimeType: string;
  checksum: string | null;
  peerName: string;
  localUri?: string;
  outputFile?: File;
  outputHandle?: any;
  peer: any;
  dataChannel: any;
  transferredBytes: number;
  cleanedUp: boolean;
};

let rtc: RtcBridge | null | undefined;
let callbacks: {
  onProgress: (progress: LocalTransferProgress) => void;
  onError: (message: string) => void;
} = {
  onProgress: () => {},
  onError: () => {},
};
const sessions = new Map<string, Session>();

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function detectRtc(): RtcBridge | null {
  if (rtc) return rtc;

  if (Platform.OS === "web" || isExpoGo()) {
    return null;
  }

  try {
    // react-native-webrtc v124 is a TurboModule in the New Architecture. The
    // package reads NativeModules during evaluation, so inject it first.
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
    };
  } catch {
    return null;
  }
  return rtc;
}

export function isLocalTransferAvailable(): boolean {
  return !!detectRtc();
}

export function subscribeToLocalTransfer(nextCallbacks: {
  onProgress: (progress: LocalTransferProgress) => void;
  onError: (message: string) => void;
}): () => void {
  callbacks = nextCallbacks;
  return () => {
    if (callbacks === nextCallbacks) {
      callbacks = { onProgress: () => {}, onError: () => {} };
    }
  };
}

function emitProgress(session: Session, status: LocalTransferProgress["status"], error?: string): void {
  try {
    callbacks.onProgress({
      transferId: session.transferId,
      direction: session.direction,
      status,
      fileName: session.fileName,
      fileSize: session.fileSize,
      transferredBytes: session.transferredBytes,
      peerName: session.peerName,
      localUri: session.localUri,
      ...(error ? { error } : {}),
    });
  } catch {}
}

function failSession(session: Session, message: string): void {
  if (session.cleanedUp) return;
  emitProgress(session, "failed", message);
  try {
    callbacks.onError(message);
  } catch {}
  closeSession(session);
}

function closeSession(session: Session): void {
  if (session.cleanedUp) return;
  session.cleanedUp = true;
  try {
    session.outputHandle?.close?.();
  } catch {}
  try {
    session.dataChannel?.close?.();
  } catch {}
  try {
    session.peer?.close?.();
  } catch {}
  sessions.delete(session.transferId);
}

function descriptionToJson(description: any): Record<string, unknown> {
  return (description?.toJSON?.() ?? {
    type: description?.type,
    sdp: description?.sdp,
  }) as Record<string, unknown>;
}

async function waitForIceGathering(peer: any): Promise<void> {
  if (peer.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    let finished = false;
    const complete = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(complete, ICE_GATHER_TIMEOUT_MS);
    peer.onicegatheringstatechange = () => {
      if (peer.iceGatheringState === "complete") complete();
    };
    // Some Android WebRTC builds report the candidates through
    // onicecandidate(null) without updating the state promptly.
    peer.onicecandidate = (event: any) => {
      if (!event?.candidate) complete();
    };
  });
}

function createPeer(session: Session): void {
  const bridge = detectRtc();
  if (!bridge) {
    throw new Error("Nearby transfer is unavailable on this device.");
  }

  // Host candidates are enough when both phones are on the same Wi-Fi or
  // hotspot. No STUN/TURN server is used, so file bytes stay local.
  session.peer = new bridge.RTCPeerConnection({
    iceServers: [],
    bundlePolicy: "max-bundle",
  });
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
  if ((channel?.bufferedAmount ?? 0) <= MAX_BUFFERED_AMOUNT) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const check = () => {
      if (
        (channel?.bufferedAmount ?? 0) <= MAX_BUFFERED_AMOUNT ||
        channel?.readyState !== "open"
      ) {
        resolve();
      } else {
        setTimeout(check, 40);
      }
    };
    check();
  });
}

function sendJson(channel: any, value: Record<string, unknown>): void {
  channel.send(JSON.stringify(value));
}

async function sendFile(session: Session): Promise<void> {
  if (!session.localUri || !session.dataChannel) return;
  const source = new File(session.localUri);
  let handle: any = null;
  try {
    handle = source.open();
    while (!session.cleanedUp && session.dataChannel.readyState === "open") {
      const bytes = handle.readBytes(CHUNK_SIZE);
      if (!bytes.byteLength) break;
      await waitForDataChannelBuffer(session.dataChannel);
      if (session.cleanedUp || session.dataChannel.readyState !== "open") return;
      session.dataChannel.send(bytes.buffer);
      session.transferredBytes = Math.min(
        session.fileSize,
        session.transferredBytes + bytes.byteLength,
      );
      emitProgress(session, "transferring");
    }
    if (!session.cleanedUp && session.dataChannel.readyState === "open") {
      sendJson(session.dataChannel, {
        type: "file-complete",
        checksum: session.checksum,
      });
    }
  } catch {
    failSession(session, "The file could not be read for nearby transfer.");
  } finally {
    try {
      handle?.close?.();
    } catch {}
  }
}

function bytesFromData(data: any): Uint8Array | null {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return null;
}

function wireSenderChannel(session: Session, channel: any): void {
  session.dataChannel = channel;
  channel.binaryType = "arraybuffer";
  channel.onopen = () => {
    if (session.cleanedUp) return;
    emitProgress(session, "transferring");
    sendJson(channel, {
      type: "file-header",
      fileName: session.fileName,
      fileSize: session.fileSize,
      mimeType: session.mimeType,
      checksum: session.checksum,
    });
    void sendFile(session);
  };
  channel.onerror = () => failSession(session, "The nearby transfer connection failed.");
  channel.onclose = () => {
    if (!session.cleanedUp && session.transferredBytes < session.fileSize) {
      failSession(session, "The nearby device disconnected before the file finished.");
    }
  };
}

function wireReceiverChannel(session: Session, channel: any): void {
  session.dataChannel = channel;
  channel.binaryType = "arraybuffer";
  let writeQueue = Promise.resolve();

  channel.onmessage = (event: any) => {
    const value = event?.data;
    if (typeof value === "string") {
      let message: any;
      try {
        message = JSON.parse(value);
      } catch {
        return;
      }

      if (message.type === "file-header") {
        if (
          message.fileName !== session.fileName ||
          Number(message.fileSize) !== session.fileSize
        ) {
          failSession(session, "The received file header did not match the pairing code.");
          return;
        }
        emitProgress(session, "transferring");
      } else if (message.type === "file-complete") {
        writeQueue = writeQueue
          .then(async () => {
            if (session.cleanedUp || !session.outputFile) return;
            try {
              session.outputHandle?.close?.();
              session.outputHandle = null;
              const receivedChecksum = session.outputFile.md5;
              if (
                session.checksum &&
                receivedChecksum &&
                session.checksum !== receivedChecksum
              ) {
                failSession(session, "The received file failed its integrity check.");
                return;
              }
              session.transferredBytes = session.fileSize;
              emitProgress(session, "complete");
              setTimeout(() => closeSession(session), 1200);
            } catch {
              failSession(session, "The received file could not be finalized.");
            }
          })
          .catch(() => failSession(session, "The received file could not be saved."));
      } else if (message.type === "transfer-cancelled") {
        emitProgress(session, "cancelled");
        closeSession(session);
      }
      return;
    }

    const bytes = bytesFromData(value);
    if (!bytes || !session.outputHandle) return;
    // The queue serializes native file writes while allowing WebRTC to keep
    // receiving packets. Bytes are never converted to base64 or held in RAM.
    const copy = new Uint8Array(bytes);
    writeQueue = writeQueue
      .then(() => {
        if (session.cleanedUp || !session.outputHandle) return;
        session.outputHandle.writeBytes(copy);
        session.transferredBytes = Math.min(
          session.fileSize,
          session.transferredBytes + copy.byteLength,
        );
        emitProgress(session, "transferring");
      })
      .catch(() => failSession(session, "The received file could not be saved."));
  };
  channel.onerror = () => failSession(session, "The nearby transfer connection failed.");
  channel.onclose = () => {
    if (!session.cleanedUp && session.transferredBytes < session.fileSize) {
      failSession(session, "The sending device disconnected before the file finished.");
    }
  };
}

function wireReceiverPeer(session: Session): void {
  session.peer.ondatachannel = (event: any) => {
    if (event?.channel) wireReceiverChannel(session, event.channel);
  };
}

function encodePayload(payload: LocalTransferOffer | LocalTransferAnswer): string {
  return QR_PREFIX + JSON.stringify(payload);
}

export function parseLocalTransferCode(raw: string): LocalTransferOffer | LocalTransferAnswer {
  if (!raw.startsWith(QR_PREFIX)) {
    throw new Error("That QR code is not an AfuChat nearby-transfer code.");
  }
  if (raw.length > 20_000) {
    throw new Error("That nearby-transfer code is too large or damaged.");
  }
  let payload: any;
  try {
    payload = JSON.parse(raw.slice(QR_PREFIX.length));
  } catch {
    throw new Error("The nearby-transfer QR code is damaged.");
  }
  if (
    !payload ||
    typeof payload.transferId !== "string" ||
    typeof payload.description !== "object"
  ) {
    throw new Error("The nearby-transfer QR code is incomplete.");
  }
  if (payload.description.type !== "offer" && payload.description.type !== "answer") {
    throw new Error("The nearby-transfer QR code has an unsupported connection type.");
  }
  return payload as LocalTransferOffer | LocalTransferAnswer;
}

export async function createLocalTransferOffer(params: {
  senderId: string;
  senderName: string;
  file: { uri: string; name: string; size: number; mimeType?: string };
}): Promise<{ transferId: string; code: string }> {
  if (!detectRtc()) {
    throw new Error("Nearby transfer is unavailable on this device.");
  }
  const source = new File(params.file.uri);
  const fileSize = Number.isFinite(params.file.size) && params.file.size > 0
    ? params.file.size
    : source.size;
  if (!params.file.uri || !Number.isFinite(fileSize) || fileSize <= 0) {
    throw new Error("This file has no readable size. Choose a file stored on the device.");
  }
  if (fileSize > MAX_TRANSFER_BYTES) {
    throw new Error("This file is too large for a direct nearby transfer. The limit is 250 MB.");
  }

  const transferId = makeId("transfer");
  const session: Session = {
    transferId,
    direction: "send",
    fileName: params.file.name,
    fileSize,
    mimeType: params.file.mimeType ?? source.type ?? "application/octet-stream",
    checksum: source.md5 ?? null,
    peerName: "Nearby device",
    localUri: params.file.uri,
    peer: null,
    dataChannel: null,
    transferredBytes: 0,
    cleanedUp: false,
  };

  try {
    createPeer(session);
    wireSenderChannel(
      session,
      session.peer.createDataChannel("afuchat-file", { ordered: true }),
    );
    sessions.set(transferId, session);
    const offer = await session.peer.createOffer({ offerToReceiveAudio: false });
    await session.peer.setLocalDescription(offer);
    await waitForIceGathering(session.peer);
    const description = descriptionToJson(session.peer.localDescription ?? offer);
    const payload: LocalTransferOffer = {
      transferId,
      senderId: params.senderId,
      senderName: params.senderName || "AfuChat user",
      fileName: session.fileName,
      fileSize: session.fileSize,
      mimeType: session.mimeType,
      checksum: session.checksum,
      createdAt: Date.now(),
      description,
    };
    emitProgress(session, "waiting");
    return { transferId, code: encodePayload(payload) };
  } catch (error) {
    closeSession(session);
    throw error instanceof Error
      ? error
      : new Error("Could not create the nearby transfer pairing code.");
  }
}

export async function acceptLocalTransferOffer(params: {
  code: string;
  receiverName: string;
}): Promise<{ transferId: string; code: string; localUri: string }> {
  if (!detectRtc()) {
    throw new Error("Nearby transfer is unavailable on this device.");
  }
  const parsed = parseLocalTransferCode(params.code);
  if (parsed.description.type !== "offer") {
    throw new Error("Scan the sender's offer QR code first.");
  }
  const offer = parsed as LocalTransferOffer;
  if (
    !offer.fileName ||
    !Number.isFinite(offer.fileSize) ||
    offer.fileSize <= 0 ||
    offer.fileSize > MAX_TRANSFER_BYTES
  ) {
    throw new Error("The sender offered an invalid or oversized file.");
  }
  if (!Paths.document?.uri) throw new Error("Permanent device storage is unavailable.");

  const directory = new Directory(Paths.document, "afuchat-transfers");
  directory.create({ idempotent: true, intermediates: true });
  const safeName =
    offer.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "received-file";
  const outputFile = directory.createFile(
    `${offer.transferId}_${safeName}`,
    offer.mimeType || "application/octet-stream",
  );
  const session: Session = {
    transferId: offer.transferId,
    direction: "receive",
    fileName: offer.fileName,
    fileSize: offer.fileSize,
    mimeType: offer.mimeType,
    checksum: offer.checksum ?? null,
    peerName: offer.senderName || "Nearby device",
    localUri: outputFile.uri,
    outputFile,
    outputHandle: null,
    peer: null,
    dataChannel: null,
    transferredBytes: 0,
    cleanedUp: false,
  };

  try {
    session.outputHandle = outputFile.open();
    const bridge = detectRtc();
    if (!bridge) throw new Error("WebRTC is unavailable in this build.");
    createPeer(session);
    wireReceiverPeer(session);
    await session.peer.setRemoteDescription(
      new bridge.RTCSessionDescription(offer.description),
    );
    const answer = await session.peer.createAnswer();
    await session.peer.setLocalDescription(answer);
    await waitForIceGathering(session.peer);
    sessions.set(session.transferId, session);
    const payload: LocalTransferAnswer = {
      transferId: offer.transferId,
      receiverName: params.receiverName || "Nearby device",
      description: descriptionToJson(session.peer.localDescription ?? answer),
    };
    emitProgress(session, "connecting");
    return {
      transferId: session.transferId,
      code: encodePayload(payload),
      localUri: outputFile.uri,
    };
  } catch (error) {
    closeSession(session);
    try {
      outputFile.delete();
    } catch {}
    throw error instanceof Error
      ? error
      : new Error("Could not accept the nearby transfer.");
  }
}

export async function completeLocalTransferAnswer(code: string): Promise<void> {
  const parsed = parseLocalTransferCode(code);
  if (parsed.description.type !== "answer") {
    throw new Error("Scan the receiver's answer QR code.");
  }
  const answer = parsed as LocalTransferAnswer;
  const session = sessions.get(answer.transferId);
  if (!session || session.direction !== "send") {
    throw new Error("This answer QR code belongs to an expired transfer.");
  }
  const bridge = detectRtc();
  if (!bridge) throw new Error("WebRTC is unavailable in this build.");
  try {
    session.peerName = answer.receiverName || "Nearby device";
    await session.peer.setRemoteDescription(
      new bridge.RTCSessionDescription(answer.description),
    );
    emitProgress(session, "connecting");
  } catch {
    failSession(session, "Could not complete the nearby device pairing.");
    throw new Error("Could not complete the nearby device pairing.");
  }
}

export async function cancelLocalTransfer(transferId: string): Promise<void> {
  const session = sessions.get(transferId);
  if (!session) return;
  try {
    if (session.dataChannel?.readyState === "open") {
      sendJson(session.dataChannel, { type: "transfer-cancelled" });
    }
  } catch {}
  emitProgress(session, "cancelled");
  closeSession(session);
}
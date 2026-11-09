import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { showToast } from "@/lib/toast";
import {
  acceptCall as engineAccept,
  addCallEngineListener,
  declineCall as engineDecline,
  endCall as engineEnd,
  getWebRTCAvailable,
  initCallEngine,
  startCall as engineStart,
  toggleMute as engineMute,
  toggleSpeaker as engineSpeaker,
  type CallInfo,
  type CallStatus,
  type IncomingCallNotice,
} from "@/lib/callEngine";

type CallContextValue = {
  status: CallStatus;
  callInfo: CallInfo | null;
  incomingNotice: IncomingCallNotice | null;
  isMuted: boolean;
  isSpeaker: boolean;
  isAvailable: boolean;
  startCall: (params: {
    calleeId: string;
    calleeName: string;
    calleeAvatar: string | null;
    chatId: string | null;
  }) => Promise<string>;
  acceptCall: () => Promise<void>;
  declineCall: () => void;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleSpeaker: () => void;
};

const noop: CallContextValue = {
  status: "idle",
  callInfo: null,
  incomingNotice: null,
  isMuted: false,
  isSpeaker: false,
  isAvailable: false,
  startCall: async () => "",
  acceptCall: async () => {},
  declineCall: () => {},
  endCall: async () => {},
  toggleMute: () => {},
  toggleSpeaker: () => {},
};

const CallContext = createContext<CallContextValue>(noop);

export function useCall() {
  return useContext(CallContext);
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const [status, setStatus] = useState<CallStatus>("idle");
  const [callInfo, setCallInfo] = useState<CallInfo | null>(null);
  const [incomingNotice, setIncomingNotice] = useState<IncomingCallNotice | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const userRef = useRef(user);
  const profileRef = useRef(profile);
  userRef.current = user;
  profileRef.current = profile;

  useEffect(() => {
    let disposed = false;
    const refreshAvailability = () => {
      if (!disposed) setIsAvailable(getWebRTCAvailable());
    };
    // Android can finish registering the native module just after the first
    // React effect. A transient false result must not disable calling for the
    // entire session.
    refreshAvailability();
    const retryTimers = [250, 1000, 2500].map((delay) =>
      setTimeout(refreshAvailability, delay),
    );
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") setTimeout(refreshAvailability, 100);
    });

    if (!user?.id) {
      setStatus("idle");
      setCallInfo(null);
      setIncomingNotice(null);
      return () => {
        disposed = true;
        retryTimers.forEach(clearTimeout);
        appStateSubscription.remove();
      };
    }

    const removeListener = addCallEngineListener((event) => {
      if (disposed) return;
      if (event.type === "status") {
        setStatus(event.status);
        setCallInfo(event.info);
        if (event.status === "idle" || event.status === "ended") {
          setIncomingNotice(null);
          setIsSpeaker(false);
        }
      } else if (event.type === "incoming") {
        setIncomingNotice(event.notice);
      } else if (event.type === "error") {
        showToast(event.message, { type: "error" });
      }
    });
    const cleanupPromise = initCallEngine(user.id);
    return () => {
      disposed = true;
      retryTimers.forEach(clearTimeout);
      appStateSubscription.remove();
      removeListener();
      cleanupPromise.then((cleanup) => cleanup()).catch(() => {});
    };
  }, [user?.id]);

  const startCall = useCallback(async (params: {
    calleeId: string;
    calleeName: string;
    calleeAvatar: string | null;
    chatId: string | null;
  }): Promise<string> => {
    const u = userRef.current;
    if (!u) throw new Error("Not signed in");
    const callId = typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      await engineStart({
        ...params,
        callId,
        myId: u.id,
        myName: profileRef.current?.display_name ?? "AfuChat user",
        myAvatar: profileRef.current?.avatar_url ?? null,
      });
      return callId;
    } catch {
      showToast("Could not start the call", { type: "error" });
      throw new Error("Could not start the call");
    }
  }, []);

  const acceptCall = useCallback(async () => {
    const notice = incomingNotice;
    const u = userRef.current;
    if (!notice || !u) return;
    try {
      await engineAccept(notice, {
        myId: u.id,
        myName: profileRef.current?.display_name ?? "AfuChat user",
        myAvatar: profileRef.current?.avatar_url ?? null,
      });
      setIncomingNotice(null);
    } catch {
      showToast("Could not connect the call", { type: "error" });
      throw new Error("Could not connect the call");
    }
  }, [incomingNotice]);

  const declineCall = useCallback(() => {
    if (incomingNotice) engineDecline(incomingNotice);
    setIncomingNotice(null);
  }, [incomingNotice]);

  const endCall = useCallback(async () => {
    await engineEnd();
  }, []);

  const toggleMute = useCallback(() => setIsMuted(engineMute()), []);
  const toggleSpeaker = useCallback(() => setIsSpeaker(engineSpeaker()), []);

  return (
    <CallContext.Provider value={{
      status,
      callInfo,
      incomingNotice,
      isMuted,
      isSpeaker,
      isAvailable,
      startCall,
      acceptCall,
      declineCall,
      endCall,
      toggleMute,
      toggleSpeaker,
    }}>
      {children}
    </CallContext.Provider>
  );
}
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";

import { IncomingCallModal } from "@/components/IncomingCallModal";
import { useAuth } from "@/context/AuthContext";
import {
  CallRecord,
  listenForIncomingCalls,
  updateCallStatus,
} from "@/lib/callSignaling";

// Track whether a call is currently active (answered) in this session.
// Only mark as missed when the app backgrounds while the call is still ringing
// (not yet answered). Active calls continue in background.
let _activeCallId: string | null = null;

export function setActiveCallId(id: string | null) {
  _activeCallId = id;
}

export function CallManager() {
  const { user } = useAuth();
  const [incomingCall, setIncomingCall] = useState<CallRecord | null>(null);
  const pendingCallIdRef = useRef<string | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = listenForIncomingCalls(user.id, (call) => {
      // Deduplicate — don't show if same call is already showing
      if (pendingCallIdRef.current === call.id) return;
      // Don't show if user is already in an active call
      if (_activeCallId) return;

      pendingCallIdRef.current = call.id;
      setIncomingCall(call);
    });

    return () => {
      unsubscribe();
    };
  }, [user?.id]);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const sub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;

      // App is going to background
      if (nextState === "background" && prev === "active") {
        const call = incomingCall;
        if (!call) return;

        // Only mark as missed if the call hasn't been answered yet
        // (i.e. no active call running in the call screen)
        if (_activeCallId !== call.id) {
          updateCallStatus(call.id, "missed").catch(() => {});
          setIncomingCall(null);
          pendingCallIdRef.current = null;
        }
        // If _activeCallId === call.id, the call is active — let it continue
      }
    });

    return () => sub.remove();
  }, [incomingCall]);

  function handleDismiss() {
    pendingCallIdRef.current = null;
    setIncomingCall(null);
  }

  return (
    <IncomingCallModal
      call={incomingCall}
      onDismiss={handleDismiss}
    />
  );
}

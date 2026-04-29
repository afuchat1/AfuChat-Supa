import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";

import { IncomingCallModal } from "@/components/IncomingCallModal";
import { useAuth } from "@/context/AuthContext";
import {
  CallRecord,
  listenForIncomingCalls,
  updateCallStatus,
} from "@/lib/callSignaling";

export function CallManager() {
  const { user } = useAuth();
  const [incomingCall, setIncomingCall] = useState<CallRecord | null>(null);
  const activeCallId = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = listenForIncomingCalls(user.id, (call) => {
      if (activeCallId.current === call.id) return;
      activeCallId.current = call.id;
      setIncomingCall(call);
    });

    return () => {
      unsubscribe();
    };
  }, [user?.id]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" && incomingCall) {
        updateCallStatus(incomingCall.id, "missed").catch(() => {});
        setIncomingCall(null);
        activeCallId.current = null;
      }
    });
    return () => sub.remove();
  }, [incomingCall]);

  function handleDismiss() {
    activeCallId.current = null;
    setIncomingCall(null);
  }

  return (
    <IncomingCallModal
      call={incomingCall}
      onDismiss={handleDismiss}
    />
  );
}

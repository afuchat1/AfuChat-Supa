import React, { useEffect, useRef } from "react";
import { View } from "react-native";
import type { BrowserControls, InternalBrowserViewProps } from "./InternalBrowserView.types";

export default function InternalBrowserView({
  url,
  onControlsReady,
  onNavigationStateChange,
  onLoadStart,
  onLoadEnd,
  onLoadProgress,
  onError,
}: InternalBrowserViewProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const controls: BrowserControls = {
      back: () => {
        try { frameRef.current?.contentWindow?.history.back(); } catch {}
      },
      forward: () => {
        try { frameRef.current?.contentWindow?.history.forward(); } catch {}
      },
      reload: () => {
        if (frameRef.current) frameRef.current.src = frameRef.current.src;
      },
      stop: () => {},
    };
    onControlsReady(controls);
    return () => onControlsReady(null);
  }, [onControlsReady]);

  useEffect(() => {
    onLoadStart();
    onLoadProgress(0.1);
    onNavigationStateChange({
      url,
      title: new URL(url).hostname,
      canGoBack: false,
      canGoForward: false,
    });
  }, [url, onLoadStart, onLoadProgress, onNavigationStateChange]);

  return (
    <View style={{ flex: 1, overflow: "hidden" }}>
      {React.createElement("iframe", {
        ref: frameRef,
        src: url,
        title: "AfuChat browser page",
        referrerPolicy: "strict-origin-when-cross-origin",
        sandbox: "allow-forms allow-scripts allow-same-origin",
        onLoad: () => {
          onLoadProgress(1);
          onLoadEnd();
        },
        onError: () => onError("The page could not be loaded."),
        style: {
          display: "block",
          width: "100%",
          height: "100%",
          border: 0,
          backgroundColor: "transparent",
        },
      })}
    </View>
  );
}

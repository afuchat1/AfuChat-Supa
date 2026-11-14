import React, { useEffect, useRef } from "react";
import WebView, { type WebViewProps } from "react-native-webview";
import type { BrowserControls, InternalBrowserViewProps } from "./InternalBrowserView.types";

const WEB_PROTOCOL = /^https?:\/\//i;
const EXTERNAL_PROTOCOL = /^(mailto|tel|sms|geo|afuchat|intent|market):/i;
const WebViewWithProps = WebView as unknown as React.ComponentType<
  WebViewProps & React.RefAttributes<WebView<{}>>
>;

export default function InternalBrowserView({
  url,
  onControlsReady,
  onNavigationStateChange,
  onLoadStart,
  onLoadEnd,
  onLoadProgress,
  onError,
  onOpenWindow,
  onExternalScheme,
}: InternalBrowserViewProps) {
  const webViewRef = useRef<WebView<{}>>(null);
  useEffect(() => {
    const controls: BrowserControls = {
      back: () => webViewRef.current?.goBack(),
      forward: () => webViewRef.current?.goForward(),
      reload: () => webViewRef.current?.reload(),
      stop: () => webViewRef.current?.stopLoading(),
    };
    onControlsReady(controls);
    return () => onControlsReady(null);
  }, [onControlsReady]);

  return (
      <WebViewWithProps
        ref={webViewRef}
        source={{ uri: url }}
        style={{ flex: 1, backgroundColor: "transparent" }}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        mixedContentMode="never"
        allowFileAccess={false}
        allowUniversalAccessFromFileURLs={false}
        onNavigationStateChange={(state) =>
          onNavigationStateChange({
            url: state.url,
            title: state.title,
            canGoBack: state.canGoBack,
            canGoForward: state.canGoForward,
          })
        }
        onLoadStart={onLoadStart}
        onLoadEnd={onLoadEnd}
        onLoadProgress={({ nativeEvent }) => onLoadProgress(nativeEvent.progress)}
        onError={({ nativeEvent }) => onError(nativeEvent.description || "The page could not be loaded.")}
        onOpenWindow={({ nativeEvent }) => onOpenWindow(nativeEvent.targetUrl)}
        onShouldStartLoadWithRequest={(request) => {
          if (request.url === "about:blank" || WEB_PROTOCOL.test(request.url)) return true;
          if (EXTERNAL_PROTOCOL.test(request.url)) onExternalScheme(request.url);
          return false;
        }}
      />
  );
}

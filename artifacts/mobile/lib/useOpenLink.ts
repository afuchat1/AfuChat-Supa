import { useCallback } from "react";
import { Linking, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useAdvancedFeatures } from "@/context/AdvancedFeaturesContext";

const WEB_SCHEMES = ["http://", "https://"];

function isWebUrl(url: string) {
  return WEB_SCHEMES.some((s) => url.startsWith(s));
}

export function useOpenLink() {
  const { features } = useAdvancedFeatures();
  const router = useRouter();

  return useCallback(
    (url: string) => {
      if (!url) return;
      const trimmed = url.trim();
      if (isWebUrl(trimmed) && Platform.OS !== "web" && features.in_app_browser) {
        router.push({ pathname: "/browser", params: { url: trimmed } });
      } else {
        Linking.openURL(trimmed).catch(() => {});
      }
    },
    [features.in_app_browser, router],
  );
}

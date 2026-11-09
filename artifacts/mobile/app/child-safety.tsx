import { useEffect } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import LegalPage from "@/components/web/LegalPage";

export default function ChildSafetyScreen() {
  useEffect(() => {
    if (Platform.OS === "web") return;
    WebBrowser.openBrowserAsync("https://afuchat.com/child-safety").catch(() => {});
    if (router.canGoBack()) router.back();
  }, []);

  if (Platform.OS === "web") {
    return <LegalPage kind="child-safety" />;
  }

  return null;
}
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { router, useNavigation } from "expo-router";
import { telegramShowBackButton, telegramHideBackButton, telegramOnBackButton, isTelegramMiniApp } from "@/lib/telegram";

export function TelegramBackButton() {
  if (Platform.OS !== "web") return null;
  if (!isTelegramMiniApp()) return null;

  return <TelegramBackButtonInner />;
}

function TelegramBackButtonInner() {
  const navigation = useNavigation();

  useEffect(() => {
    const canGoBack = navigation.canGoBack();

    if (canGoBack) {
      telegramShowBackButton();
    } else {
      telegramHideBackButton();
    }

    const off = telegramOnBackButton(() => {
      if (navigation.canGoBack()) {
        router.back();
      }
    });

    const unsubscribe = navigation.addListener("state", () => {
      if (navigation.canGoBack()) {
        telegramShowBackButton();
      } else {
        telegramHideBackButton();
      }
    });

    return () => {
      off();
      unsubscribe();
    };
  }, [navigation]);

  return null;
}

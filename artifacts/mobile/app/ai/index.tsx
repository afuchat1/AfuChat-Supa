import React, { useEffect } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { AFUAI_BOT_ID } from "@/lib/afuAiBot";
import { useTheme } from "@/hooks/useTheme";
import { AiRedirectSkeleton } from "@/components/ui/Skeleton";

const AI_CHAT_CACHE_KEY = "afuai_direct_chat_id";

function goToAiChat(chatId: string) {
  router.replace({
    pathname: "/chat/[id]",
    params: {
      id: chatId,
      otherName: "AfuAI",
      otherId: AFUAI_BOT_ID,
      isGroup: "false",
      isChannel: "false",
      chatName: "",
    },
  } as any);
}

export default function AiRedirect() {
  const { user } = useAuth();
  const { colors } = useTheme();

  useEffect(() => {
    if (!user) return;

    AsyncStorage.getItem(AI_CHAT_CACHE_KEY).then((cached) => {
      if (cached) {
        goToAiChat(cached);
      }
    });

    supabase
      .rpc("get_or_create_direct_chat", { other_user_id: AFUAI_BOT_ID })
      .then(({ data: chatId }) => {
        if (chatId) {
          AsyncStorage.setItem(AI_CHAT_CACHE_KEY, chatId).catch(() => {});
          goToAiChat(chatId);
        } else {
          router.back();
        }
      });
  }, [user]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AiRedirectSkeleton />
    </View>
  );
}

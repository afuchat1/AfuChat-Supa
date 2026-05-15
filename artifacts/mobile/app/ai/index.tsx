import React, { useEffect } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { AFUAI_BOT_ID } from "@/lib/afuAiBot";
import { useTheme } from "@/hooks/useTheme";
import { AiRedirectSkeleton } from "@/components/ui/Skeleton";

const AI_CHAT_CACHE_KEY = "afuai_direct_chat_id";

function goToAiChat(chatId: string, options?: { initialMessage?: string; lensIntro?: string }) {
  router.replace({
    pathname: "/chat/[id]",
    params: {
      id: chatId,
      otherName: "AfuAI",
      otherId: AFUAI_BOT_ID,
      isGroup: "false",
      isChannel: "false",
      chatName: "",
      ...(options?.initialMessage ? { initialMessage: options.initialMessage } : {}),
      ...(options?.lensIntro ? { lensIntro: options.lensIntro } : {}),
    },
  } as any);
}

export default function AiRedirect() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { q, lensIntro } = useLocalSearchParams<{ q?: string; lensIntro?: string }>();

  useEffect(() => {
    if (!user) return;

    const opts = q
      ? { initialMessage: q }
      : lensIntro
        ? { lensIntro }
        : undefined;

    async function openAiChat() {
      // 1. Try validated cache first — avoids an RPC round-trip on repeat visits
      const cached = await AsyncStorage.getItem(AI_CHAT_CACHE_KEY).catch(() => null);
      if (cached) {
        const { data: member } = await supabase
          .from("chat_members")
          .select("chat_id")
          .eq("chat_id", cached)
          .eq("user_id", user!.id)
          .maybeSingle();
        if (member) {
          // Cache is valid — navigate immediately, refresh cache silently in background
          goToAiChat(cached, opts);
          supabase
            .rpc("get_or_create_direct_chat", { other_user_id: AFUAI_BOT_ID })
            .then(({ data: chatId }) => {
              if (chatId && chatId !== cached) {
                AsyncStorage.setItem(AI_CHAT_CACHE_KEY, chatId).catch(() => {});
              }
            });
          return;
        }
        // Cache is stale — clear it
        await AsyncStorage.removeItem(AI_CHAT_CACHE_KEY).catch(() => {});
      }

      // 2. No valid cache — call the RPC and navigate once with the result
      const { data: chatId } = await supabase.rpc("get_or_create_direct_chat", { other_user_id: AFUAI_BOT_ID });
      if (chatId) {
        AsyncStorage.setItem(AI_CHAT_CACHE_KEY, chatId).catch(() => {});
        goToAiChat(chatId, opts);
      } else {
        router.back();
      }
    }

    openAiChat();
  }, [user]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AiRedirectSkeleton />
    </View>
  );
}

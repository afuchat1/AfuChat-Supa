import React, { useEffect } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { AFUAI_BOT_ID } from "@/lib/afuAiBot";
import { useTheme } from "@/hooks/useTheme";
import { AiRedirectSkeleton } from "@/components/ui/Skeleton";

export default function AiRedirect() {
  const { user } = useAuth();
  const { colors } = useTheme();

  useEffect(() => {
    if (!user) return;
    supabase
      .rpc("get_or_create_direct_chat", { other_user_id: AFUAI_BOT_ID })
      .then(({ data: chatId }) => {
        if (chatId) {
          router.replace(`/chat/${chatId}` as any);
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

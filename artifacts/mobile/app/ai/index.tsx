import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { AFUAI_BOT_ID } from "@/lib/afuAiBot";
import { useTheme } from "@/hooks/useTheme";

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
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
      <ActivityIndicator color="#00BCD4" size="large" />
    </View>
  );
}

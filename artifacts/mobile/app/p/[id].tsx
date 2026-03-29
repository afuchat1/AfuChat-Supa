import { useEffect } from "react";
import { useLocalSearchParams } from "expo-router";
import { router } from "expo-router";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import Colors from "@/constants/colors";

export default function PostShortLink() {
  const { id } = useLocalSearchParams<{ id: string }>();

  useEffect(() => {
    if (!id) return;
    router.replace({ pathname: "/post/[id]", params: { id } });
  }, [id]);

  return (
    <View style={styles.root}>
      <ActivityIndicator size="large" color={Colors.brand} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
});

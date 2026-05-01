import { useEffect } from "react";
import { router } from "expo-router";

export default function HelpRedirect() {
  useEffect(() => {
    router.replace("/support");
  }, []);
  return null;
}

import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { getAllPhonebookNames } from "@/lib/storage/localContacts";

/**
 * Returns a Map<userId, phonebookName> loaded from the local SQLite store.
 * Resolves instantly from the on-device cache — no network call needed.
 *
 * Usage:
 *   const phonebookNames = usePhonebookNames();
 *   const chatName = phonebookNames.get(otherId) ?? registeredName;
 *   const savedAs  = phonebookNames.get(userId);   // null if not in phone book
 */
export function usePhonebookNames(): Map<string, string> {
  const [names, setNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (Platform.OS === "web") return;
    getAllPhonebookNames().then(setNames).catch(() => {});
  }, []);

  return names;
}

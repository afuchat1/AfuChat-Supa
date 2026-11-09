import { useCallback, useEffect, useState } from "react";
import {
  getLocalPhoneContacts,
  type LocalPhoneContact,
} from "@/lib/storage/localPhoneContacts";
import { syncPhoneContacts } from "@/lib/phoneContacts";

export function usePhoneContacts(userId: string | undefined): {
  contacts: LocalPhoneContact[];
  permission: "idle" | "granted" | "denied" | "unavailable";
  refresh: () => Promise<void>;
} {
  const [contacts, setContacts] = useState<LocalPhoneContact[]>([]);
  const [permission, setPermission] = useState<
    "idle" | "granted" | "denied" | "unavailable"
  >("idle");

  const refresh = useCallback(async () => {
    const result = await syncPhoneContacts(
      userId,
      (deviceContacts) => setContacts(deviceContacts),
      (updatedContacts) => setContacts(updatedContacts),
    );
    setPermission(result);
  }, [userId]);

  useEffect(() => {
    let active = true;
    void getLocalPhoneContacts().then((cached) => {
      if (active) setContacts(cached);
    });
    void refresh();
    return () => {
      active = false;
    };
  }, [refresh]);

  return { contacts, permission, refresh };
}
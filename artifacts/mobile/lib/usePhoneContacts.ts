import { useCallback, useEffect, useRef, useState } from "react";
import {
  getLocalPhoneContacts,
  type LocalPhoneContact,
} from "@/lib/storage/localPhoneContacts";
import { syncPhoneContacts } from "@/lib/phoneContacts";

export function usePhoneContacts(userId: string | undefined, profileCountry?: string | null): {
  contacts: LocalPhoneContact[];
  permission: "idle" | "granted" | "denied" | "unavailable";
  refresh: () => Promise<"granted" | "denied" | "unavailable">;
} {
  const mountedRef = useRef(true);
  const [contacts, setContacts] = useState<LocalPhoneContact[]>([]);
  const [permission, setPermission] = useState<
    "idle" | "granted" | "denied" | "unavailable"
  >("idle");

  const refresh = useCallback(async () => {
    try {
      const result = await syncPhoneContacts(
        userId,
        profileCountry,
        (deviceContacts) => { if (mountedRef.current) setContacts(deviceContacts); },
        (updatedContacts) => { if (mountedRef.current) setContacts(updatedContacts); },
      );
      if (mountedRef.current) setPermission(result);
      return result;
    } catch {
      if (mountedRef.current) setPermission("unavailable");
      return "unavailable" as const;
    }
  }, [userId, profileCountry]);

  useEffect(() => {
    let active = true;
    mountedRef.current = true;
    void getLocalPhoneContacts()
      .then((cached) => { if (active) setContacts(cached); })
      .catch(() => { if (active) setPermission("unavailable"); });
    void refresh().then((result) => {
      if (active) setPermission(result);
    });
    return () => { active = false; mountedRef.current = false; };
  }, [refresh]);

  return { contacts, permission, refresh };
}
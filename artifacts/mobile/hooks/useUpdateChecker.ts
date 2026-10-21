import { useEffect, useState } from "react";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";

export interface UpdateInfo {
  hasUpdate: boolean;
  isMandatory: boolean;
  latestVersion: string;
  androidUrl: string;
}

const DEFAULT_ANDROID_URL = "https://play.google.com/store/apps/details?id=com.afuchat.mobile";

/** Compare semver strings. Returns >0 if b is newer than a. */
function semverCompare(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function useUpdateChecker(): UpdateInfo | null {
  const [info, setInfo] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const currentVersion =
          Constants.expoConfig?.version ??
          (Constants as any).manifest?.version ??
          "0.0.0";

        // The live app_settings table is a key/value store, not a
        // one-row settings record. Query only the three public update keys;
        // never select unrelated settings because this table also contains
        // server-side configuration.
        const { data, error } = await supabase
          .from("app_settings")
          .select("key, value")
          .in("key", ["LATEST_APP_VERSION", "MIN_APP_VERSION", "ANDROID_STORE_URL"]);

        if (cancelled || error) return;

        const settings = new Map(
          (data ?? []).map((row: { key: string; value: unknown }) => [
            row.key.toUpperCase(),
            typeof row.value === "string" ? row.value : "",
          ]),
        );
        const latest = settings.get("LATEST_APP_VERSION") || currentVersion;
        const minVer = settings.get("MIN_APP_VERSION") || currentVersion;
        const androidUrl = settings.get("ANDROID_STORE_URL") || DEFAULT_ANDROID_URL;

        const hasUpdate = semverCompare(currentVersion, latest) < 0;
        const isMandatory = semverCompare(currentVersion, minVer) < 0;

        if (hasUpdate || isMandatory) {
          setInfo({ hasUpdate: true, isMandatory, latestVersion: latest, androidUrl });
        }
      } catch {
        // Silent — update check is best-effort, never crash the app
      }
    }

    // Delay slightly so it doesn't compete with initial app load
    const timer = setTimeout(check, 3000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  return info;
}

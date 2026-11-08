import { supabase } from "@/lib/supabase";

export type FootballAction =
  | "live"
  | "fixtures"
  | "fixture"
  | "events"
  | "statistics"
  | "lineups"
  | "competitions"
  | "searchCompetitions"
  | "standings"
  | "teams"
  | "team"
  | "teamFixtures"
  | "searchTeams"
  | "searchPlayers";

export type FootballData<T = Record<string, unknown>> = {
  ok: true;
  response: T[];
  results: number;
  cachedAt: string;
  stale: boolean;
  source: "provider" | "shared-cache";
  warning?: string;
};

export type FootballFollow = {
  id: string;
  user_id: string;
  entity_type: "team" | "league";
  entity_id: string;
  entity_name: string;
  entity_logo: string | null;
  created_at: string;
};

export type FootballNotificationPreferences = {
  user_id: string;
  kickoff: boolean;
  goals: boolean;
  half_time: boolean;
  full_time: boolean;
  followed_teams: boolean;
  updated_at?: string;
};

export const DEFAULT_FOOTBALL_NOTIFICATION_PREFERENCES = {
  kickoff: true,
  goals: true,
  half_time: false,
  full_time: true,
  followed_teams: true,
};

export async function getFootballData<T = Record<string, unknown>>(
  action: FootballAction,
  params: Record<string, string | number | boolean | undefined> = {},
): Promise<FootballData<T>> {
  const { data, error } = await supabase.functions.invoke("football-data", {
    body: { action, params },
  });

  if (error) {
    let message = error.message || "Football data is temporarily unavailable.";
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === "function") {
      try {
        const details = await context.json();
        if (typeof details?.message === "string") message = details.message;
      } catch {
        // Keep the safe message returned by Supabase when the response is not JSON.
      }
    }
    throw new Error(message);
  }
  if (!data?.ok) {
    throw new Error(data?.message || "Football data is temporarily unavailable.");
  }
  return data as FootballData<T>;
}

export async function listFootballFollows(): Promise<FootballFollow[]> {
  const { data, error } = await supabase
    .from("football_follows")
    .select("id,user_id,entity_type,entity_id,entity_name,entity_logo,created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as FootballFollow[];
}

export async function toggleFootballFollow(
  follow: Pick<FootballFollow, "entity_type" | "entity_id" | "entity_name" | "entity_logo">,
  isFollowing: boolean,
): Promise<void> {
  const userResult = await supabase.auth.getUser();
  const userId = userResult.data.user?.id;
  if (userResult.error || !userId) throw new Error("Sign in to follow teams and competitions.");

  const query = supabase
    .from("football_follows")
    .delete()
    .eq("user_id", userId)
    .eq("entity_type", follow.entity_type)
    .eq("entity_id", follow.entity_id);

  if (isFollowing) {
    const { error } = await query;
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from("football_follows").upsert({
    user_id: userId,
    entity_type: follow.entity_type,
    entity_id: follow.entity_id,
    entity_name: follow.entity_name,
    entity_logo: follow.entity_logo,
  }, { onConflict: "user_id,entity_type,entity_id" });
  if (error) throw new Error(error.message);
}

export async function getFootballNotificationPreferences(): Promise<FootballNotificationPreferences | null> {
  const { data, error } = await supabase
    .from("football_notification_preferences")
    .select("user_id,kickoff,goals,half_time,full_time,followed_teams,updated_at")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FootballNotificationPreferences | null) ?? null;
}

export async function saveFootballNotificationPreferences(
  preferences: Omit<FootballNotificationPreferences, "user_id" | "updated_at">,
): Promise<void> {
  const userResult = await supabase.auth.getUser();
  const userId = userResult.data.user?.id;
  if (userResult.error || !userId) throw new Error("Sign in to save notification preferences.");

  const { error } = await supabase.from("football_notification_preferences").upsert({
    user_id: userId,
    ...preferences,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}

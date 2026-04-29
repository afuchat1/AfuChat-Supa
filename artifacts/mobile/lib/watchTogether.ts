import { supabase } from "@/lib/supabase";

export type WatchMatchStatus = "scheduled" | "live" | "ht" | "ft" | "postponed";

export type WatchMatch = {
  id: string;
  sport: string;
  league: string | null;
  home_team: string;
  away_team: string;
  home_logo: string | null;
  away_logo: string | null;
  home_score: number;
  away_score: number;
  status: WatchMatchStatus;
  minute: number | null;
  kickoff_at: string;
  venue: string | null;
  updated_at: string;
};

export type WatchRoom = {
  id: string;
  match_id: string;
  title: string;
  created_at: string;
};

export type WatchMessage = {
  id: string;
  room_id: string;
  user_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
  body: string;
  kind: "user" | "system";
  meta: Record<string, any> | null;
  created_at: string;
};

export type WatchReaction = {
  id: string;
  room_id: string;
  user_id: string | null;
  emoji: string;
  created_at: string;
};

export const REACTION_EMOJIS = ["⚽", "🔥", "👏", "😱", "😂", "😡", "🥶", "❤️"] as const;

export async function listMatches(): Promise<WatchMatch[]> {
  const { data, error } = await supabase
    .from("watch_matches")
    .select("*")
    .order("kickoff_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data || []) as WatchMatch[];
}

export async function getMatch(matchId: string): Promise<WatchMatch | null> {
  const { data, error } = await supabase
    .from("watch_matches")
    .select("*")
    .eq("id", matchId)
    .maybeSingle();
  if (error) throw error;
  return (data || null) as WatchMatch | null;
}

export async function getRoomForMatch(matchId: string): Promise<WatchRoom | null> {
  const { data, error } = await supabase
    .from("watch_rooms")
    .select("*")
    .eq("match_id", matchId)
    .maybeSingle();
  if (error) throw error;
  return (data || null) as WatchRoom | null;
}

export async function listRecentMessages(roomId: string, limit = 80): Promise<WatchMessage[]> {
  const { data, error } = await supabase
    .from("watch_messages")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data || []) as WatchMessage[]).reverse();
}

export async function sendMessage(args: {
  roomId: string;
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  body: string;
}): Promise<WatchMessage> {
  const { data, error } = await supabase
    .from("watch_messages")
    .insert({
      room_id: args.roomId,
      user_id: args.userId,
      display_name: args.displayName,
      avatar_url: args.avatarUrl ?? null,
      body: args.body.trim(),
      kind: "user",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as WatchMessage;
}

export async function sendReaction(args: {
  roomId: string;
  userId: string;
  emoji: string;
}): Promise<void> {
  const { error } = await supabase.from("watch_reactions").insert({
    room_id: args.roomId,
    user_id: args.userId,
    emoji: args.emoji,
  });
  if (error) throw error;
}

export function formatStatus(m: Pick<WatchMatch, "status" | "minute" | "kickoff_at">): string {
  if (m.status === "live") return m.minute != null ? `LIVE · ${m.minute}'` : "LIVE";
  if (m.status === "ht") return "Half-time";
  if (m.status === "ft") return "Full-time";
  if (m.status === "postponed") return "Postponed";
  const t = new Date(m.kickoff_at);
  const hh = String(t.getHours()).padStart(2, "0");
  const mm = String(t.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

import { router } from "expo-router";
import { supabase } from "@/lib/supabase";

export type UsernameTarget =
  | { kind: "profile"; id: string }
  | {
      kind: "channel";
      id: string;
      name: string;
      avatarUrl: string | null;
      handle: string;
      description: string | null;
    }
  | {
      kind: "group";
      id: string;
      name: string;
      handle: string;
    };

export type UsernameLoadingState = {
  handle: string;
};

type LoadingListener = (state: UsernameLoadingState | null) => void;

let loadingState: UsernameLoadingState | null = null;
let loadingListener: LoadingListener | null = null;

export function subscribeUsernameLoading(listener: LoadingListener): () => void {
  loadingListener = listener;
  listener(loadingState);
  return () => {
    if (loadingListener === listener) loadingListener = null;
  };
}

export function setUsernameLoading(handle: string | null): void {
  loadingState = handle ? { handle } : null;
  loadingListener?.(loadingState);
}

/**
 * Resolves the shared username namespace before navigation. Public chat
 * usernames are stored on both the chat/channel records and an immutable
 * reservation table, so the visible source records are checked directly.
 */
export async function resolveUsernameTarget(handle: string): Promise<UsernameTarget | null> {
  const cleanHandle = handle.replace(/^@/, "").trim().toLowerCase();
  if (!/^[a-z0-9_]{1,30}$/.test(cleanHandle)) return null;

  const [
    { data: profiles, error: profileError },
    { data: channels, error: channelError },
    { data: groups, error: groupError },
    { data: aliases, error: aliasError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id")
      .ilike("handle", cleanHandle)
      .limit(1),
    supabase
      .from("channels")
      .select("id, name, handle, description, avatar_url, is_public")
      .ilike("handle", cleanHandle)
      .eq("is_public", true)
      .limit(1),
    supabase
      .from("chats")
      .select("id, name, handle, is_group, is_channel")
      .ilike("handle", cleanHandle)
      .eq("is_group", true)
      .eq("is_channel", false)
      .limit(1),
    supabase
      .from("owned_usernames")
      .select("owner_id")
      .ilike("handle", cleanHandle)
      .limit(1),
  ]);

  const queryError = profileError || channelError || groupError || aliasError;
  if (queryError) {
    console.warn("[UsernameResolver] lookup failed:", queryError.message);
    throw queryError;
  }

  const profile = (profiles as any[] | null)?.[0];
  if (profile?.id) return { kind: "profile", id: profile.id };

  const channel = (channels as any[] | null)?.[0];
  if (channel?.id) {
    return {
      kind: "channel",
      id: channel.id,
      name: channel.name || "Channel",
      avatarUrl: channel.avatar_url || null,
      handle: channel.handle || cleanHandle,
      description: channel.description || null,
    };
  }

  const group = (groups as any[] | null)?.[0];
  if (group?.id) {
    return {
      kind: "group",
      id: group.id,
      name: group.name || "Group",
      handle: group.handle || cleanHandle,
    };
  }

  const alias = (aliases as any[] | null)?.[0];
  if (alias?.owner_id) {
    // A username reservation can outlive a deleted profile. Do not navigate
    // to an owner ID unless its profile still exists.
    const { data: aliasProfile, error: aliasProfileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", alias.owner_id)
      .maybeSingle();
    if (aliasProfileError) {
      console.warn("[UsernameResolver] owner lookup failed:", aliasProfileError.message);
      throw aliasProfileError;
    }
    if (aliasProfile?.id) return { kind: "profile", id: aliasProfile.id };
  }

  return null;
}

export function navigateToUsernameTarget(target: UsernameTarget): void {
  if (target.kind === "profile") {
    router.push({ pathname: "/contact/[id]", params: { id: target.id } } as any);
  } else if (target.kind === "channel") {
    router.push({
      pathname: "/channel/[id]",
      params: {
        id: target.id,
        isChannel: "true",
        chatName: target.name,
        chatAvatar: target.avatarUrl || "",
        channelHandle: target.handle,
        channelDescription: target.description || "",
      },
    } as any);
  } else {
    router.push({
      pathname: "/chat/[id]",
      params: {
        id: target.id,
        chatName: target.name,
        chatHandle: target.handle,
        isGroup: "true",
        isChannel: "false",
      },
    } as any);
  }
}
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image as RNImage,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Image from "@/components/ui/OptimizedImage";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useShareIntentContext } from "expo-share-intent";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useDataMode } from "@/context/DataModeContext";
import { supabase } from "@/lib/supabase";
import { safeRouter } from "@/lib/navUtils";
import { showAlert } from "@/lib/alert";
import { Avatar } from "@/components/ui/Avatar";
import { isOnline } from "@/lib/offlineStore";
import Colors from "@/constants/colors";
import { getLocalConversations, type LocalConversation } from "@/lib/storage/localConversations";
import { updateNativeShareShortcuts } from "@/lib/nativeShareShortcuts";

type Contact = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  /** Existing conversation ID. When present, sharing goes to this exact chat. */
  chatId?: string;
  lastMessageAt?: string | null;
  isGroup?: boolean;
  isChannel?: boolean;
  subtitle?: string;
};

function ContactRow({
  contact,
  onPress,
  disabled,
}: {
  contact: Contact;
  onPress: () => void;
  disabled: boolean;
}) {
  const { colors, accent } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.contactRow, { backgroundColor: colors.card }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.72}
    >
      <Avatar uri={contact.avatar_url} name={contact.display_name} size={42} />
      <View style={styles.contactInfo}>
        <Text style={[styles.contactName, { color: colors.text }]} numberOfLines={1}>{contact.display_name}</Text>
        <Text style={[styles.contactHandle, { color: colors.textMuted }]} numberOfLines={1}>
          {contact.subtitle || (contact.handle ? `@${contact.handle}` : "AfuChat conversation")}
        </Text>
      </View>
      {disabled ? (
        <ActivityIndicator size="small" color={accent} />
      ) : (
        <View style={[styles.sendIcon, { backgroundColor: accent }]}>
          <Ionicons name="paper-plane" size={16} color="#fff" />
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function ShareToAfuChatScreen() {
  const { shareIntent, resetShareIntent } = useShareIntentContext();
  const { user } = useAuth();
  const { colors, accent } = useTheme();
  const { isLowData } = useDataMode();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ chatId?: string; files?: string }>();
  const [showContacts, setShowContacts] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [recentChats, setRecentChats] = useState<Contact[]>([]);
  const [loadingRecentChats, setLoadingRecentChats] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [contactQuery, setContactQuery] = useState("");
  const autoShareChatRef = useRef<string | null>(null);
  const recentTargetsRef = useRef<Contact[]>([]);
  const exactTargetRef = useRef<Contact | null>(null);
  const exactTargetLoadingRef = useRef<string | null>(null);

  const localFiles = useMemo(() => {
    if (!params.files) return [];
    try {
      const parsed = JSON.parse(params.files as string);
      return Array.isArray(parsed)
        ? parsed.filter((file) => file?.path).map((file) => ({
            path: String(file.path),
            mimeType: file.mimeType ? String(file.mimeType) : undefined,
            fileName: file.name ? String(file.name) : undefined,
          }))
        : [];
    } catch {
      return [];
    }
  }, [params.files]);
  const sharedText = (shareIntent.text || shareIntent.webUrl || "").trim();
  const sharedFiles = useMemo(
    () => [...localFiles, ...(shareIntent.files ?? [])],
    [localFiles, shareIntent.files],
  );
  const imageFiles = useMemo(
    () => sharedFiles.filter((file) => file.mimeType?.startsWith("image/")),
    [sharedFiles],
  );
  const nonImageFiles = useMemo(
    () => sharedFiles.filter((file) => !file.mimeType?.startsWith("image/")),
    [sharedFiles],
  );
  const sharedImageUris = useMemo(
    () => imageFiles.map((file) => file.path).filter(Boolean).slice(0, 9),
    [imageFiles],
  );
  const firstImage = imageFiles[0]?.path;
  const title = shareIntent.meta?.title || (shareIntent.webUrl ? "Shared link" : "Shared content");

  function conversationToTarget(conversation: Partial<LocalConversation> & Record<string, any>): Contact | null {
    if (!conversation.id || conversation.kind === "notes") return null;
    const isGroup = !!conversation.is_group || !!conversation.is_channel;
    const label = isGroup
      ? (conversation.name || (conversation.is_channel ? "Channel" : "Group chat"))
      : (conversation.other_display_name || "Unknown");
    const avatar = isGroup ? conversation.avatar_url : conversation.other_avatar;
    const otherId = conversation.other_id || conversation.id;
    return {
      id: isGroup ? conversation.id : otherId,
      chatId: conversation.id,
      lastMessageAt: conversation.last_message_at,
      display_name: label,
      handle: conversation.other_handle || "",
      avatar_url: avatar || null,
      isGroup,
      isChannel: !!conversation.is_channel,
      subtitle: isGroup
        ? (conversation.is_channel ? "Channel" : "Group chat")
        : (conversation.other_handle ? `@${conversation.other_handle}` : "Recent chat"),
    };
  }

  function serverRowToTarget(row: any): Contact | null {
    return conversationToTarget({
      id: row.chat_id,
      name: row.chat_name,
      is_group: row.is_group,
      is_channel: row.is_channel,
      other_id: row.other_id,
      other_display_name: row.other_display_name,
      other_handle: row.other_handle,
      other_avatar: row.other_avatar,
      avatar_url: row.avatar_url,
       last_message_at: row.last_message_at || row.chat_updated_at,
    });
  }

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoadingRecentChats(true);

    (async () => {
      try {
        const cached = await getLocalConversations();
        const cachedTargets = cached
          .map((conversation) => conversationToTarget(conversation as any))
          .filter(Boolean) as Contact[];
        const uniqueCachedTargets = cachedTargets.filter(
          (target, index, list) =>
            list.findIndex((item) => item.chatId === target.chatId) === index,
        );
        if (!cancelled) {
          recentTargetsRef.current = uniqueCachedTargets;
           // A direct-share target is sent automatically below; it must not
           // displace genuinely recent chats in the visible/native list.
           setRecentChats(uniqueCachedTargets.slice(0, 8));
          updateNativeShareShortcuts(uniqueCachedTargets.map((chat) => ({
            chatId: chat.chatId!,
            label: chat.display_name,
            avatarUrl: chat.avatar_url,
             lastMessageAt: chat.lastMessageAt,
            isGroup: chat.isGroup,
            isChannel: chat.isChannel,
          })));
        }

        // Refresh recent chats in the background so a newly-created
        // conversation is available even before the chats tab is opened.
        const { data } = await supabase.rpc(
          "get_chat_list",
          { p_unread_excluded_ids: [] },
        );
        if (cancelled) return;
        const liveTargets = ((data ?? []) as any[])
           .filter((row) => !row.is_archived && row.last_message_at)
          .sort((a, b) => {
            const aTime = new Date(a.last_message_at || a.chat_updated_at || 0).getTime();
            const bTime = new Date(b.last_message_at || b.chat_updated_at || 0).getTime();
            return bTime - aTime;
          })
       .map(serverRowToTarget)
          .filter(Boolean) as Contact[];
        const uniqueTargets = liveTargets.filter(
          (target, index, list) =>
            list.findIndex((item) => item.chatId === target.chatId) === index,
        );
        recentTargetsRef.current = uniqueTargets;
         setRecentChats(uniqueTargets.slice(0, 8));
        updateNativeShareShortcuts(uniqueTargets.map((chat) => ({
          chatId: chat.chatId!,
          label: chat.display_name,
          avatarUrl: chat.avatar_url,
           lastMessageAt: chat.lastMessageAt,
          isGroup: chat.isGroup,
          isChannel: chat.isChannel,
        })));
      } catch {
        // The durable local conversation cache is enough to keep sharing usable.
      } finally {
        if (!cancelled) setLoadingRecentChats(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id, params.chatId]);

  // A direct-share shortcut can point to a chat outside the visible eight
  // recent rows, or to a chat that has not reached SQLite yet. Resolve that
  // exact membership before the one-tap send effect runs.
  useEffect(() => {
    const chatId = typeof params.chatId === "string" ? params.chatId : null;
    if (!chatId || !user || recentTargetsRef.current.some((target) => target.chatId === chatId)) return;
    if (exactTargetLoadingRef.current === chatId) return;
    exactTargetLoadingRef.current = chatId;
    let cancelled = false;

    (async () => {
      try {
        const { data: chat } = await supabase
          .from("chats")
          .select(`id, name, is_group, is_channel, avatar_url, chat_members(user_id, profiles(id, display_name, avatar_url, handle))`)
          .eq("id", chatId)
          .single();
        if (cancelled || !chat) return;
        const members = (chat.chat_members || []) as any[];
        const other = members.find((member) => member.user_id !== user.id);
        const target = conversationToTarget({
          id: chat.id,
          name: chat.name,
          is_group: chat.is_group,
          is_channel: chat.is_channel,
          avatar_url: chat.avatar_url,
          other_id: other?.profiles?.id || other?.user_id,
          other_display_name: other?.profiles?.display_name,
          other_handle: other?.profiles?.handle,
          other_avatar: other?.profiles?.avatar_url,
        });
        if (!target) return;
        // Keep a direct-share target separate. It may be valid but older than
        // the recent list, and must not be promoted into the eight visible
        // recent chats just because Android selected it.
        exactTargetRef.current = target;
        setRecentChats(recentTargetsRef.current.slice(0, 8));
      } catch {
        // The shortcut will remain available for a future retry if its chat
        // becomes visible through the normal chat-list refresh.
      }
    })();

    return () => { cancelled = true; };
  }, [params.chatId, user?.id, recentChats.length]);

  useEffect(() => {
    if (!showContacts || contacts.length > 0 || !user) return;
    setLoadingContacts(true);
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("follows")
          .select("following_id, profiles!follows_following_id_fkey(id, display_name, handle, avatar_url)")
          .eq("follower_id", user.id);
        if (cancelled) return;
        const next = (data ?? [])
          .map((row: any) => row.profiles)
          .filter(Boolean) as Contact[];
        next.sort((a, b) => a.display_name.localeCompare(b.display_name));
        setContacts(next);
      } catch {
        if (!cancelled) showAlert("Contacts unavailable", "We could not load your AfuChat contacts.");
      } finally {
        if (!cancelled) setLoadingContacts(false);
      }
    })();
    return () => { cancelled = true; };
  }, [showContacts, contacts.length, user]);

  function closeShare() {
    resetShareIntent();
    if (router.canGoBack()) router.back();
    else safeRouter.replace("/(tabs)/discover" as any);
  }

  function shareToFeed() {
    Keyboard.dismiss();
    resetShareIntent(false);
    safeRouter.replace({
      pathname: "/create-post",
      params: {
        prefill: sharedText,
        ...(sharedImageUris.length > 0
          ? { imageUrls: JSON.stringify(sharedImageUris) }
          : {}),
      },
    } as any);
  }

  function chatRouteParams(contact: Contact, chatId: string) {
    return {
      id: chatId,
      otherName: contact.isGroup ? "" : contact.display_name,
      otherAvatar: contact.isGroup ? "" : (contact.avatar_url || ""),
      otherId: contact.isGroup ? "" : contact.id,
      isGroup: contact.isGroup ? "true" : "false",
      isChannel: contact.isChannel ? "true" : "false",
      chatName: contact.isGroup ? contact.display_name : "",
      chatAvatar: contact.isGroup ? (contact.avatar_url || "") : "",
      ...(contact.handle ? { otherHandle: contact.handle } : {}),
    };
  }

  async function shareToContact(contact: Contact) {
    if (!user || sendingTo) return;
    if (!isOnline()) {
      showAlert("You're offline", "Reconnect to send shared content to a contact.");
      return;
    }
    setSendingTo(contact.id);
    try {
      let chatId: string | undefined = contact.chatId;
      let chatError: { message?: string } | null = null;
      if (!chatId) {
        const result = await supabase.rpc(
          "get_or_create_direct_chat",
          { other_user_id: contact.id },
        );
        chatId = result.data as string | undefined;
        chatError = result.error;
      }
      if (chatError || !chatId) throw new Error("Could not open the conversation.");

      // Text and links can be delivered immediately. Media is passed to the
      // composer so the user can review it before uploading and sending.
       if (sharedText && sharedFiles.length === 0) {
        const { error } = await supabase.from("messages").insert({
          chat_id: chatId,
          sender_id: user.id,
          encrypted_content: sharedText,
        });
        if (error) throw error;
        resetShareIntent(false);
        safeRouter.replace({
          pathname: "/chat/[id]",
          params: chatRouteParams(contact, chatId),
        } as any);
      } else {
        resetShareIntent(false);
        safeRouter.replace({
          pathname: "/chat/[id]",
          params: {
            ...chatRouteParams(contact, chatId),
            ...(sharedText ? { initialMessage: encodeURIComponent(sharedText) } : {}),
            ...(sharedFiles.length > 0
              ? {
                  sharedFilesJson: JSON.stringify(sharedFiles.map((file) => ({
                    path: file.path,
                    name: (file as any).fileName || (file as any).name || "Shared file",
                    mimeType: file.mimeType || "application/octet-stream",
                  })).filter((file) => file.path).slice(0, 6)),
                }
              : {}),
            ...(sharedFiles.length === 0 && nonImageFiles[0]?.path
                ? {
                    sharedFileUri: nonImageFiles[0].path,
                    sharedFileType: nonImageFiles[0].mimeType || "application/octet-stream",
                    sharedFileName:
                      (nonImageFiles[0] as any).fileName ||
                      (nonImageFiles[0] as any).name ||
                      "Shared file",
                  }
                : {}),
          },
        } as any);
      }
    } catch (error: any) {
      showAlert("Share failed", error?.message || "Could not send this content.");
    } finally {
      setSendingTo(null);
    }
  }

  // Android Direct Share launches this screen with the selected chat ID.
  // Send immediately so choosing a person in the system share sheet is a
  // true one-tap action, while still leaving the in-app recent-chat rows
  // available for people who open the share screen normally.
  useEffect(() => {
    const chatId = typeof params.chatId === "string" ? params.chatId : null;
    if (!chatId || !shareIntent || sendingTo) return;
    if (autoShareChatRef.current === chatId) return;
    const target = recentChats.find((chat) => chat.chatId === chatId)
      || recentTargetsRef.current.find((chat) => chat.chatId === chatId)
      || (exactTargetRef.current?.chatId === chatId ? exactTargetRef.current : null);
    if (!target) return;
    autoShareChatRef.current = chatId;
    const timer = setTimeout(() => { shareToContact(target); }, 0);
    return () => clearTimeout(timer);
  }, [params.chatId, recentChats, sendingTo, shareIntent, user?.id]);

  const visibleContacts = contactQuery.trim()
    ? contacts.filter((contact) =>
        `${contact.display_name} ${contact.handle}`.toLowerCase().includes(contactQuery.trim().toLowerCase()),
      )
    : contacts;

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.backgroundSecondary }]}>
        <TouchableOpacity onPress={closeShare} style={styles.headerButton} hitSlop={10}>
          <Ionicons name="close" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Share to AfuChat</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.previewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.previewBadge, { backgroundColor: accent + "20" }]}>
            <Ionicons name={shareIntent.type === "weburl" ? "link" : firstImage ? "image" : "share-social"} size={18} color={accent} />
          </View>
          <View style={styles.previewContent}>
            <Text style={[styles.previewTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
            {!!sharedText && <Text style={[styles.previewText, { color: colors.textMuted }]} numberOfLines={3}>{sharedText}</Text>}
            {!sharedText && !firstImage && (
              <Text style={[styles.previewText, { color: colors.textMuted }]}>Shared file ready to send</Text>
            )}
            {!!sharedFiles.length && (
              <Text style={[styles.previewMeta, { color: colors.textMuted }]}>
                {sharedFiles.length} {sharedFiles.length === 1 ? "file" : "files"} attached
              </Text>
            )}
          </View>
          {firstImage && !isLowData && (
            <Image source={{ uri: firstImage }} style={styles.previewImage} resizeMode="cover" />
          )}
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>CHOOSE WHERE TO SHARE</Text>
        <TouchableOpacity style={[styles.destinationCard, { backgroundColor: colors.card }]} onPress={shareToFeed} activeOpacity={0.78}>
          <View style={[styles.destinationIcon, { backgroundColor: "#007AFF20" }]}>
            <Ionicons name="globe-outline" size={24} color="#007AFF" />
          </View>
          <View style={styles.destinationText}>
            <Text style={[styles.destinationTitle, { color: colors.text }]}>Share to Feed</Text>
            <Text style={[styles.destinationSub, { color: colors.textMuted }]}>Post it for your followers to discover</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>

        <Text style={[styles.subsectionLabel, { color: colors.textMuted }]}>RECENT CHATS</Text>
        {loadingRecentChats && recentChats.length === 0 ? (
          <ActivityIndicator color={accent} style={{ marginVertical: 18 }} />
        ) : recentChats.length === 0 ? (
          <View style={[styles.emptyRecent, { backgroundColor: colors.card }]}>
            <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.textMuted} />
            <Text style={[styles.emptyRecentText, { color: colors.textMuted }]}>Your recent chats will appear here</Text>
          </View>
        ) : (
          <View style={styles.recentList}>
            {recentChats.map((chat) => (
              <ContactRow
                key={chat.chatId}
                contact={chat}
                disabled={sendingTo !== null}
                onPress={() => shareToContact(chat)}
              />
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[styles.destinationCard, { backgroundColor: colors.card }, showContacts && { borderColor: accent, borderWidth: 1 }]}
          onPress={() => setShowContacts((value) => !value)}
          activeOpacity={0.78}
        >
          <View style={[styles.destinationIcon, { backgroundColor: "#34C75920" }]}>
            <Ionicons name="chatbubbles-outline" size={24} color="#34C759" />
          </View>
          <View style={styles.destinationText}>
           <Text style={[styles.destinationTitle, { color: colors.text }]}>Find another contact</Text>
           <Text style={[styles.destinationSub, { color: colors.textMuted }]}>Search people you follow</Text>
          </View>
          <Ionicons name={showContacts ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
        </TouchableOpacity>

        {showContacts && (
          <View style={styles.contactsArea}>
            {loadingContacts ? (
              <ActivityIndicator color={accent} style={{ marginVertical: 28 }} />
            ) : contacts.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
                <Ionicons name="people-outline" size={30} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No contacts yet</Text>
                <Text style={[styles.emptySub, { color: colors.textMuted }]}>Follow people on AfuChat to send shared content to them.</Text>
              </View>
            ) : (
              <>
                <View style={[styles.searchBar, { backgroundColor: colors.card }]}>
                  <Ionicons name="search" size={17} color={colors.textMuted} />
                  <TextInput
                    value={contactQuery}
                    onChangeText={setContactQuery}
                    placeholder="Search contacts"
                    placeholderTextColor={colors.textMuted}
                    style={[styles.searchInput, { color: colors.text }]}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                {visibleContacts.map((contact) => (
                  <ContactRow
                    key={contact.id}
                    contact={contact}
                    disabled={sendingTo !== null}
                    onPress={() => shareToContact(contact)}
                  />
                ))}
              </>
            )}
          </View>
        )}
        <Text style={[styles.privacyNote, { color: colors.textMuted }]}>
          Shared content stays under your control. Review your post before publishing or sending.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  headerButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  previewCard: { flexDirection: "row", alignItems: "center", borderRadius: 20, borderWidth: 1, padding: 14, gap: 12, minHeight: 88 },
  previewBadge: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  previewContent: { flex: 1, minWidth: 0 },
  previewTitle: { fontSize: 14, fontFamily: "Inter_700Bold", marginBottom: 4 },
  previewText: { fontSize: 13, lineHeight: 18, fontFamily: "Inter_400Regular" },
  previewMeta: { fontSize: 11, marginTop: 5, fontFamily: "Inter_500Medium" },
  previewImage: { width: 58, height: 58, borderRadius: 12, backgroundColor: "#8882" },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8, marginTop: 24, marginBottom: 8, paddingHorizontal: 4 },
  destinationCard: { flexDirection: "row", alignItems: "center", borderRadius: 18, padding: 14, gap: 12, marginBottom: 9 },
  destinationIcon: { width: 48, height: 48, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  destinationText: { flex: 1, minWidth: 0 },
  destinationTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  destinationSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 3 },
  contactsArea: { gap: 8, marginTop: 1 },
  subsectionLabel: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8, marginTop: 20, marginBottom: 8, paddingHorizontal: 4 },
  recentList: { gap: 8 },
  emptyRecent: { minHeight: 58, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16 },
  emptyRecentText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  searchBar: { height: 42, borderRadius: 13, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 13, marginBottom: 2 },
  searchInput: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", outlineStyle: "none" as any },
  contactRow: { minHeight: 66, borderRadius: 16, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 11 },
  contactInfo: { flex: 1, minWidth: 0 },
  contactName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  contactHandle: { fontSize: 12, marginTop: 2, fontFamily: "Inter_400Regular" },
  sendIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  emptyCard: { borderRadius: 16, alignItems: "center", paddingHorizontal: 28, paddingVertical: 28, gap: 7 },
  emptyTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 12, lineHeight: 17, textAlign: "center", fontFamily: "Inter_400Regular" },
  privacyNote: { fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 22, paddingHorizontal: 20, fontFamily: "Inter_400Regular" },
});
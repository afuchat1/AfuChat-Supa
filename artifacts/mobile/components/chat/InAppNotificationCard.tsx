import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Avatar } from "@/components/ui/Avatar";
import { useTheme } from "@/hooks/useTheme";

export type NotificationActorProfile = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type NotificationMessageData = {
  id: string;
  message_id?: string | null;
  actor_id: string | null;
  actor: NotificationActorProfile | null;
  is_following: boolean;
  kind: string;
  title: string | null;
  body: string | null;
  cta_label: string | null;
  cta_route: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  read_at: string | null;
};

type Props = {
  notification: NotificationMessageData;
  sentAt: string;
  canOpenContent: boolean;
  followBusy: boolean;
  onPressActor: (actorId: string, notification: NotificationMessageData) => void;
  onFollowBack: (notification: NotificationMessageData) => void;
  onContentAction: (notification: NotificationMessageData) => void;
};

function getNotificationVerb(notification: NotificationMessageData): string {
  const metadata = notification.metadata ?? {};
  switch (notification.kind.toLowerCase()) {
    case "follow":
      return "started following you";
    case "like":
      if (metadata.story_id) return "liked your story";
      if (metadata.short_id) return "liked your music short";
      if (metadata.reply_id) return "liked your reply";
      return "liked your post";
    case "reply":
      return notification.title?.toLowerCase().includes("comment")
        ? "replied to your comment"
        : "replied to your post";
    case "reaction":
      return metadata.reply_id ? "liked your reply" : "reacted to your message";
    case "comment":
      return "commented on your music short";
    default:
      return "interacted with you";
  }
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function InAppNotificationCard({
  notification,
  sentAt,
  canOpenContent,
  followBusy,
  onPressActor,
  onFollowBack,
  onContentAction,
}: Props) {
  const { colors, accent } = useTheme();
  const actorId = notification.actor_id ?? notification.actor?.id ?? null;
  const actorHandle = notification.actor?.handle?.trim();
  const actorName = actorHandle
    ? `@${actorHandle}`
    : notification.actor?.display_name?.trim() || "AfuChat user";
  const isFollow = notification.kind.toLowerCase() === "follow";
  const canFollowBack = isFollow && !!actorId && !notification.is_following;
  const showFollowState = isFollow && !!actorId && notification.is_following;
  const showContentAction = !isFollow && !!notification.cta_label && canOpenContent;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.cardSurface,
          borderColor: notification.read_at ? colors.border : accent,
        },
      ]}
    >
      {!notification.read_at && <View style={[styles.unreadDot, { backgroundColor: accent }]} />}
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${actorName}'s profile`}
          disabled={!actorId}
          onPress={() => actorId && onPressActor(actorId, notification)}
          style={styles.actorTapTarget}
        >
          <Avatar
            uri={notification.actor?.avatar_url}
            name={notification.actor?.display_name || actorHandle || "AfuChat user"}
            size={46}
            userId={actorId}
          />
        </Pressable>

        <View style={styles.copy}>
          <Pressable
            accessibilityRole="button"
            disabled={!actorId}
            onPress={() => actorId && onPressActor(actorId, notification)}
          >
            <Text style={[styles.actorLine, { color: colors.text }]} numberOfLines={2}>
              <Text style={[styles.actorName, { color: colors.text }]}>{actorName}</Text>
              <Text> {getNotificationVerb(notification)}</Text>
            </Text>
          </Pressable>
          {!!notification.body?.trim() && (
            <Text style={[styles.body, { color: colors.textSecondary }]} numberOfLines={2}>
              {notification.body.trim()}
            </Text>
          )}
          <Text style={[styles.time, { color: colors.textMuted }]}>{formatTime(sentAt)}</Text>
        </View>

        {canFollowBack && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Follow back ${actorName}`}
            disabled={followBusy}
            onPress={() => actorId && onFollowBack(notification)}
            style={[
              styles.actionButton,
              styles.primaryAction,
              { backgroundColor: accent, opacity: followBusy ? 0.75 : 1 },
            ]}
          >
            {followBusy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryActionText}>Follow back</Text>
            )}
          </Pressable>
        )}

        {showFollowState && (
          <View style={[styles.actionButton, styles.secondaryAction, { borderColor: colors.border }]}>
            <Ionicons name="checkmark" size={14} color={colors.textSecondary} />
            <Text style={[styles.secondaryActionText, { color: colors.textSecondary }]}>Following</Text>
          </View>
        )}

        {showContentAction && (
          <Pressable
            accessibilityRole="button"
            onPress={() => onContentAction(notification)}
            style={[styles.actionButton, styles.secondaryAction, { borderColor: colors.border }]}
          >
            <Text style={[styles.secondaryActionText, { color: accent }]} numberOfLines={1}>
              {notification.cta_label}
            </Text>
            <Ionicons name="arrow-forward" size={13} color={accent} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "relative",
    marginHorizontal: 12,
    padding: 12,
    borderWidth: 1,
    borderRadius: 16,
  },
  unreadDot: {
    position: "absolute",
    top: 9,
    right: 9,
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  actorTapTarget: {
    alignSelf: "flex-start",
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  actorLine: {
    fontSize: 14,
    lineHeight: 19,
    fontFamily: "Inter_400Regular",
  },
  actorName: {
    fontFamily: "Inter_700Bold",
  },
  body: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: "Inter_400Regular",
  },
  time: {
    fontSize: 10,
    lineHeight: 14,
    fontFamily: "Inter_400Regular",
  },
  actionButton: {
    minHeight: 34,
    maxWidth: 104,
    paddingHorizontal: 9,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  primaryAction: {
    minWidth: 86,
  },
  primaryActionText: {
    color: "#FFFFFF",
    fontSize: 11,
    lineHeight: 14,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  secondaryAction: {
    borderWidth: 1,
    minWidth: 34,
  },
  secondaryActionText: {
    fontSize: 10,
    lineHeight: 13,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    flexShrink: 1,
  },
});

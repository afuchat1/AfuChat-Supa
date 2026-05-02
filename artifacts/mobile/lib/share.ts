import { Share, Platform } from "react-native";
import { showAlert } from "./alert";
import { encodeId } from "./shortId";

const APP_BASE_URL = "https://afuchat.com";
const WATERMARK = "AfuChat · Connect Everyone, Everywhere";

export function getPostUrl(postId: string): string {
  return `${APP_BASE_URL}/p/${encodeId(postId)}`;
}

export function getVideoUrl(postId: string): string {
  return `${APP_BASE_URL}/video/${encodeId(postId)}`;
}

export function getProfileUrl(handle: string): string {
  return `${APP_BASE_URL}/@${handle}`;
}

export async function sharePost(params: {
  postId: string;
  authorName: string;
  content: string;
}) {
  const url = getPostUrl(params.postId);
  const preview = params.content.length > 120 ? params.content.slice(0, 117) + "..." : params.content;
  const message =
    `${params.authorName} on AfuChat:\n"${preview}"\n\n${WATERMARK}\n${url}`;

  try {
    await Share.share(
      Platform.OS === "ios"
        ? { message: `${params.authorName} on AfuChat:\n"${preview}"\n\n${WATERMARK}`, url }
        : { message },
      { dialogTitle: "Share Post" }
    );
  } catch (e: any) {
    if (e?.message !== "User did not share") showAlert("Share failed", "Could not open share menu. Please try again.");
  }
}

export async function shareVideo(params: {
  postId: string;
  authorName: string;
  caption?: string;
}) {
  const url = getVideoUrl(params.postId);
  const preview = params.caption
    ? (params.caption.length > 120 ? params.caption.slice(0, 117) + "..." : params.caption)
    : "";
  const body = preview ? `\n"${preview}"` : "";
  const message = `${params.authorName} posted a video on AfuChat${body}\n\n${WATERMARK}\n${url}`;

  try {
    await Share.share(
      Platform.OS === "ios"
        ? { message: `${params.authorName} posted a video on AfuChat${body}\n\n${WATERMARK}`, url }
        : { message },
      { dialogTitle: "Share Video" }
    );
  } catch (e: any) {
    if (e?.message !== "User did not share") showAlert("Share failed", "Could not open share menu. Please try again.");
  }
}

export async function shareProfile(params: {
  handle: string;
  displayName: string;
  bio?: string | null;
}) {
  const url = getProfileUrl(params.handle);
  const intro = params.bio
    ? `${params.displayName} on AfuChat:\n"${params.bio.slice(0, 100)}"`
    : `Check out ${params.displayName} on AfuChat`;
  const message = `${intro}\n\n${WATERMARK}\n${url}`;

  try {
    await Share.share(
      Platform.OS === "ios"
        ? { message: intro + `\n\n${WATERMARK}`, url }
        : { message },
      { dialogTitle: "Share Profile" }
    );
  } catch (e: any) {
    if (e?.message !== "User did not share") showAlert("Share failed", "Could not open share menu. Please try again.");
  }
}

export async function shareArticle(params: {
  postId: string;
  authorName: string;
  title: string;
  excerpt?: string;
}) {
  const url = getPostUrl(params.postId);
  const body = params.excerpt
    ? `"${params.excerpt.slice(0, 120)}${params.excerpt.length > 120 ? "..." : ""}"`
    : "";
  const message = `${params.authorName} wrote: ${params.title}${body ? "\n" + body : ""}\n\nRead on AfuChat · ${WATERMARK}\n${url}`;

  try {
    await Share.share(
      Platform.OS === "ios"
        ? { message: `${params.title}${body ? "\n" + body : ""}\nRead on AfuChat`, url }
        : { message },
      { dialogTitle: "Share Article" }
    );
  } catch (e: any) {
    if (e?.message !== "User did not share") showAlert("Share failed", "Could not open share menu. Please try again.");
  }
}

export async function shareStory(params: {
  userName: string;
  userId: string;
}) {
  const url = `${APP_BASE_URL}/stories/${encodeId(params.userId)}`;
  const message = `Watch ${params.userName}'s story on AfuChat\n\n${WATERMARK}\n${url}`;

  try {
    await Share.share(
      Platform.OS === "ios"
        ? { message: `Watch ${params.userName}'s story on AfuChat\n\n${WATERMARK}`, url }
        : { message },
      { dialogTitle: "Share Story" }
    );
  } catch (e: any) {
    if (e?.message !== "User did not share") showAlert("Share failed", "Could not open share menu. Please try again.");
  }
}

export async function shareRedEnvelope(params: {
  envelopeId: string;
  senderName: string;
}) {
  const url = `${APP_BASE_URL}/red-envelope/${encodeId(params.envelopeId)}`;
  const message = `🧧 ${params.senderName} sent you a Red Envelope on AfuChat!\n\nOpen it before time runs out!\n\n${WATERMARK}\n${url}`;

  try {
    await Share.share(
      Platform.OS === "ios"
        ? { message: `🧧 ${params.senderName} sent you a Red Envelope on AfuChat! Open it before time runs out!`, url }
        : { message },
      { dialogTitle: "Share Red Envelope" }
    );
  } catch (e: any) {
    if (e?.message !== "User did not share") showAlert("Share failed", "Could not open share menu. Please try again.");
  }
}

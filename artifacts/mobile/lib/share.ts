import { Share, Platform } from "react-native";
import { showAlert } from "./alert";
import { encodeId } from "./shortId";

const APP_BASE_URL = "https://afuchat.com";

export function getPostUrl(postId: string): string {
  return `${APP_BASE_URL}/p/${encodeId(postId)}`;
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
  const preview = params.content.length > 100 ? params.content.slice(0, 97) + "..." : params.content;
  const message = `${params.authorName} on AfuChat: "${preview}"`;

  try {
    await Share.share(
      Platform.OS === "ios"
        ? { message, url }
        : { message: `${message}\n${url}` },
      { dialogTitle: "Share Post" }
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
  const message = params.bio
    ? `Check out ${params.displayName} on AfuChat: "${params.bio.slice(0, 80)}"`
    : `Check out ${params.displayName} on AfuChat`;

  try {
    await Share.share(
      Platform.OS === "ios"
        ? { message, url }
        : { message: `${message}\n${url}` },
      { dialogTitle: "Share Profile" }
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
  const message = `Check out ${params.userName}'s story on AfuChat`;

  try {
    await Share.share(
      Platform.OS === "ios"
        ? { message, url }
        : { message: `${message}\n${url}` },
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
  const message = `${params.senderName} sent you a Red Envelope on AfuChat!`;

  try {
    await Share.share(
      Platform.OS === "ios"
        ? { message, url }
        : { message: `${message}\n${url}` },
      { dialogTitle: "Share Red Envelope" }
    );
  } catch (e: any) {
    if (e?.message !== "User did not share") showAlert("Share failed", "Could not open share menu. Please try again.");
  }
}

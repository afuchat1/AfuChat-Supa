export async function autoDownloadAttachment(
  _messageId: string,
  _url: string,
  _attachmentType: string,
  _conversationId?: string,
  _autoDownloadPref?: "always" | "wifi_only" | "never",
): Promise<string | null> {
  return null;
}

export async function getDownloadedAttachmentUri(_url: string): Promise<string | null> {
  return null;
}

export async function deleteDownloadedAttachment(_url: string): Promise<void> {}

export async function clearAllDownloadedAttachments(): Promise<void> {}

export async function getTotalDownloadedSize(): Promise<number> {
  return 0;
}

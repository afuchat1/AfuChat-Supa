export type StoryMediaDraft = {
  uri: string;
  mediaType: "image" | "video";
  mimeType: string | null;
  durationSeconds?: number;
};

let draft: StoryMediaDraft | null = null;

export function setStoryMediaDraft(next: StoryMediaDraft): void {
  draft = next;
}

export function consumeStoryMediaDraft(): StoryMediaDraft | null {
  const current = draft;
  draft = null;
  return current;
}
import type { AfuMusicTrack } from "@/modules/afumusic";

const MIME_EXTENSIONS: Record<string, string> = {
  "audio/aac": "aac",
  "audio/flac": "flac",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "audio/x-m4a": "m4a",
  "audio/x-wav": "wav",
};

function getExtension(track: AfuMusicTrack, uri: string) {
  const mime = track.mimeType?.split(";")[0]?.trim().toLowerCase();
  if (mime && MIME_EXTENSIONS[mime]) return MIME_EXTENSIONS[mime];
  const path = track.storagePath || uri.split("?")[0];
  const match = path.match(/\.([a-z0-9]{2,5})$/i);
  const extension = match?.[1]?.toLowerCase();
  return extension && ["aac", "flac", "m4a", "mp3", "ogg", "wav", "webm"].includes(extension)
    ? extension
    : "mp3";
}

export function getMusicDownloadFilename(track: AfuMusicTrack, uri = track.storagePath || track.audioUrl || "") {
  const base = (track.title || "AfuMusic track")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100) || "AfuMusic track";
  return `${base}.${getExtension(track, uri)}`;
}

export async function downloadMusicFile(
  track: AfuMusicTrack,
  uri: string,
  filename = getMusicDownloadFilename(track, uri),
) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Device downloads are available from a web browser.");
  }
  if (!uri) throw new Error("The audio file is not available.");

  let objectUrl: string | null = null;
  if (!track.storagePath) {
    try {
      const response = await fetch(uri, { mode: "cors", credentials: "omit" });
      if (response.ok) {
        const file = await response.blob();
        if (file.size) objectUrl = URL.createObjectURL(file);
      }
    } catch {
      // Fall back to the original URL; some public legacy audio hosts block CORS.
    }
  }
  const link = document.createElement("a");
  link.href = objectUrl || uri;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl!), 60_000);
}

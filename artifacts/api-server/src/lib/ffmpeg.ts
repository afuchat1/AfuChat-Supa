import { spawn } from "node:child_process";
import { logger } from "./logger";

export type Codec = "h264" | "av1";

/** Adaptive resolutions we encode to. Heights above source are skipped. */
export const RENDITION_HEIGHTS = [360, 720, 1080] as const;
export type RenditionHeight = (typeof RENDITION_HEIGHTS)[number];

export interface EncodeOptions {
  inputPath: string;
  outputPath: string;
  codec: Codec;
  height: RenditionHeight;
}

export interface EncodeResult {
  bitrateKbps: number;
  width: number;
  height: number;
}

export interface ProbeResult {
  durationSeconds: number;
  width: number;
  height: number;
  sizeBytes: number;
}

function runProcess(
  cmd: string,
  args: string[],
  opts: { timeoutMs?: number } = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let killed = false;

    const timer = opts.timeoutMs
      ? setTimeout(() => {
          killed = true;
          child.kill("SIGKILL");
        }, opts.timeoutMs)
      : null;

    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (killed) {
        reject(new Error(`${cmd} timed out after ${opts.timeoutMs}ms`));
        return;
      }
      resolve({ stdout, stderr, code: code ?? -1 });
    });
  });
}

/** Probe a media file for duration, dimensions, and size. */
export async function probe(filePath: string): Promise<ProbeResult> {
  const { stdout, code, stderr } = await runProcess(
    "ffprobe",
    [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries",
      "stream=width,height:format=duration,size",
      "-of", "json",
      filePath,
    ],
    { timeoutMs: 30_000 },
  );
  if (code !== 0) {
    throw new Error(`ffprobe failed (${code}): ${stderr.slice(-400)}`);
  }
  const parsed = JSON.parse(stdout) as {
    streams?: Array<{ width?: number; height?: number }>;
    format?: { duration?: string; size?: string };
  };
  const stream = parsed.streams?.[0];
  return {
    durationSeconds: Number(parsed.format?.duration ?? 0) || 0,
    width: stream?.width ?? 0,
    height: stream?.height ?? 0,
    sizeBytes: Number(parsed.format?.size ?? 0) || 0,
  };
}

/** Extract a poster JPEG from an arbitrary timestamp (default 1s). */
export async function extractPoster(
  inputPath: string,
  outputPath: string,
  atSeconds = 1,
): Promise<void> {
  const { code, stderr } = await runProcess(
    "ffmpeg",
    [
      "-y",
      "-ss", String(atSeconds),
      "-i", inputPath,
      "-frames:v", "1",
      "-vf", "scale='min(1080,iw)':-2",
      "-q:v", "3",
      outputPath,
    ],
    { timeoutMs: 60_000 },
  );
  if (code !== 0) {
    throw new Error(`poster extract failed (${code}): ${stderr.slice(-400)}`);
  }
}

/**
 * Target video bitrate (kbps) for a given height. Conservative defaults
 * tuned for short social-feed clips. AV1 gets ~40% of H.264 budget for the
 * same perceived quality.
 */
function targetBitrateKbps(codec: Codec, height: RenditionHeight): number {
  // Tuned for social-feed short clips: smallest file that still looks great.
  // 360p → ~4 MB/min on cellular (was 700, now 550 = saves 21%)
  // 720p → ~13 MB/min on WiFi  (was 2200, now 1800 = saves 18%)
  // AV1 gets 60% of H.264 budget — same perceived quality at 40% less bandwidth
  const h264Map: Record<RenditionHeight, number> = {
    360: 550,
    720: 1800,
    1080: 4000,
  };
  const base = h264Map[height];
  return codec === "av1" ? Math.round(base * 0.6) : base;
}

/**
 * Build the ffmpeg argv for an encode job. We use:
 *   - libx264 + faststart MP4 for H.264 (universal compatibility)
 *   - libsvtav1 inside MP4 for AV1 (broad modern browser/device support)
 *
 * Both encoders are CRF-controlled with a maxrate cap so file sizes stay
 * predictable for the streaming feed.
 */
export function buildEncodeArgs(
  inputPath: string,
  outputPath: string,
  codec: Codec,
  height: RenditionHeight,
): string[] {
  const bitrateKbps = targetBitrateKbps(codec, height);
  const maxrate = `${Math.round(bitrateKbps * 1.5)}k`;
  const bufsize = `${bitrateKbps * 2}k`;

  // scale=-2:H keeps even width and preserves aspect ratio.
  const vf = `scale=trunc(oh*a/2)*2:${height}`;

  const common = [
    "-y",
    "-i", inputPath,
    "-vf", vf,
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-an" /* placeholder, replaced below */,
  ];
  // Drop the placeholder.
  common.pop();

  if (codec === "h264") {
    return [
      ...common,
      "-c:v", "libx264",
      "-preset", "faster",
      "-profile:v", "main",
      "-level", "4.0",
      "-crf", "24",
      "-maxrate", maxrate,
      "-bufsize", bufsize,
      "-g", "48",
      "-keyint_min", "48",
      "-sc_threshold", "0",
      "-c:a", "aac",
      // 96 kbps is indistinguishable from 128 kbps for speech/music at 360p/720p
      "-b:a", height <= 360 ? "80k" : "96k",
      "-ac", "2",
      outputPath,
    ];
  }

  // AV1 via SVT-AV1 — preset 8 is a good speed/quality tradeoff for short
  // social videos on CPU. CRF 32 ≈ visually similar to H.264 CRF 23.
  return [
    ...common,
    "-c:v", "libsvtav1",
    "-preset", "8",
    "-crf", "32",
    "-maxrate", maxrate,
    "-bufsize", bufsize,
    "-g", "48",
    "-svtav1-params", "tune=0:fast-decode=1",
    "-c:a", "libopus",
    "-b:a", "96k",
    "-ac", "2",
    outputPath,
  ];
}

/** Run a single encoding job and return the produced rendition's metadata. */
export async function encode(opts: EncodeOptions): Promise<EncodeResult> {
  const args = buildEncodeArgs(
    opts.inputPath,
    opts.outputPath,
    opts.codec,
    opts.height,
  );
  const start = Date.now();
  const { code, stderr } = await runProcess("ffmpeg", args, {
    // Generous ceiling: 1080p AV1 of a 90s clip can take a few minutes on CPU.
    timeoutMs: 30 * 60 * 1000,
  });
  if (code !== 0) {
    throw new Error(
      `ffmpeg ${opts.codec}/${opts.height}p failed (${code}): ${stderr.slice(-600)}`,
    );
  }
  const elapsed = Date.now() - start;
  const probed = await probe(opts.outputPath);
  const bitrateKbps =
    probed.durationSeconds > 0
      ? Math.round((probed.sizeBytes * 8) / probed.durationSeconds / 1000)
      : targetBitrateKbps(opts.codec, opts.height);
  logger.info(
    {
      codec: opts.codec,
      height: opts.height,
      elapsedMs: elapsed,
      sizeBytes: probed.sizeBytes,
      bitrateKbps,
    },
    "ffmpeg encode complete",
  );
  return { bitrateKbps, width: probed.width, height: probed.height };
}

/** Verify ffmpeg + svtav1 + libx264 are present at startup. */
export async function checkFfmpegEncoders(): Promise<{
  ok: boolean;
  hasH264: boolean;
  hasAv1: boolean;
}> {
  try {
    const { stdout, code } = await runProcess(
      "ffmpeg",
      ["-hide_banner", "-encoders"],
      { timeoutMs: 5_000 },
    );
    if (code !== 0) return { ok: false, hasH264: false, hasAv1: false };
    const hasH264 = /libx264/.test(stdout);
    const hasAv1 = /libsvtav1/.test(stdout);
    return { ok: true, hasH264, hasAv1 };
  } catch {
    return { ok: false, hasH264: false, hasAv1: false };
  }
}

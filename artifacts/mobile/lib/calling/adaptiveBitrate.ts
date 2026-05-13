// ─── Adaptive Bitrate Manager ──────────────────────────────────────────────────
// Monitors quality stats and progressively degrades video resolution / FPS
// to preserve audio quality on weak networks.
//
// Degradation ladder (per spec):
//   Tier 0 — HD:        1280×720 @ 24fps  (default video call start)
//   Tier 1 — SD:         848×480 @ 20fps
//   Tier 2 — LD:         426×240 @ 15fps
//   Tier 3 — Audio only: stop video tracks entirely
//
// Upgrade is conservative (needs several consecutive "good" samples).
// Downgrade is aggressive (triggered after 2 consecutive "poor" samples).

import { CallQualityStats } from "../callSignaling";

export type BandwidthTier = "hd" | "sd" | "ld" | "audio_only";

export interface TierConfig {
  width: number;
  height: number;
  frameRate: number;
  maxBitrateBps: number;
}

export const TIER_CONFIGS: Record<BandwidthTier, TierConfig> = {
  hd:         { width: 1280, height: 720,  frameRate: 24, maxBitrateBps: 1_500_000 },
  sd:         { width: 848,  height: 480,  frameRate: 20, maxBitrateBps:   600_000 },
  ld:         { width: 426,  height: 240,  frameRate: 15, maxBitrateBps:   200_000 },
  audio_only: { width: 0,    height: 0,    frameRate: 0,  maxBitrateBps:        0  },
};

// Consecutive poor samples before downgrade
const DOWNGRADE_THRESHOLD = 2;
// Consecutive good/excellent samples before upgrade
const UPGRADE_THRESHOLD = 5;

export class AdaptiveBitrateManager {
  private currentTier: BandwidthTier = "hd";
  private poorCount = 0;
  private goodCount = 0;

  public onTierChange?: (tier: BandwidthTier) => void;

  /** Feed the latest quality sample. Returns new tier if changed, null if stable. */
  sample(stats: CallQualityStats, isVideoCall: boolean): BandwidthTier | null {
    if (!isVideoCall) return null;

    const q = stats.quality;

    if (q === "poor" || q === "reconnecting" || q === "disconnected") {
      this.poorCount++;
      this.goodCount = 0;

      if (this.poorCount >= DOWNGRADE_THRESHOLD) {
        return this.tryDowngrade();
      }
    } else if (q === "excellent" || q === "good") {
      this.goodCount++;
      this.poorCount = 0;

      if (this.goodCount >= UPGRADE_THRESHOLD) {
        return this.tryUpgrade();
      }
    }

    return null;
  }

  private tryDowngrade(): BandwidthTier | null {
    const next = DOWNGRADE_MAP[this.currentTier];
    if (!next || next === this.currentTier) return null;
    this.poorCount = 0;
    this.currentTier = next;
    this.onTierChange?.(this.currentTier);
    return this.currentTier;
  }

  private tryUpgrade(): BandwidthTier | null {
    const next = UPGRADE_MAP[this.currentTier];
    if (!next || next === this.currentTier) return null;
    this.goodCount = 0;
    this.currentTier = next;
    this.onTierChange?.(this.currentTier);
    return this.currentTier;
  }

  getTier(): BandwidthTier { return this.currentTier; }

  reset() {
    this.currentTier = "hd";
    this.poorCount = 0;
    this.goodCount = 0;
  }
}

const DOWNGRADE_MAP: Record<BandwidthTier, BandwidthTier> = {
  hd:         "sd",
  sd:         "ld",
  ld:         "audio_only",
  audio_only: "audio_only",
};

const UPGRADE_MAP: Record<BandwidthTier, BandwidthTier> = {
  audio_only: "ld",
  ld:         "sd",
  sd:         "hd",
  hd:         "hd",
};

// ── Apply a tier to a live RTCPeerConnection sender ────────────────────────────

/**
 * Apply video constraints to all active video senders on the peer connection.
 * For `audio_only`, video tracks are disabled (not stopped — so they can
 * recover if the connection improves).
 */
export async function applyTierToPeerConnection(
  pc: any,
  localStream: any,
  tier: BandwidthTier,
): Promise<void> {
  if (!pc || !localStream) return;
  const config = TIER_CONFIGS[tier];
  const isAudioOnly = tier === "audio_only";

  // Toggle video track enabled state
  const videoTracks: any[] = localStream.getVideoTracks?.() ?? [];
  for (const track of videoTracks) {
    track.enabled = !isAudioOnly;
  }

  if (isAudioOnly) return;

  // Apply encoding parameters to each video sender
  try {
    const senders: any[] = pc.getSenders?.() ?? [];
    for (const sender of senders) {
      if (!sender.track || sender.track.kind !== "video") continue;

      // Apply constraints to the track itself (works on react-native-webrtc)
      try {
        await sender.track.applyConstraints?.({
          width:     { ideal: config.width },
          height:    { ideal: config.height },
          frameRate: { ideal: config.frameRate },
        });
      } catch {
        // applyConstraints not available on all platforms
      }

      // Apply RTP encoding parameters (works on Chrome/browsers)
      try {
        const params = sender.getParameters?.();
        if (params?.encodings?.length) {
          for (const enc of params.encodings) {
            enc.maxBitrate = config.maxBitrateBps;
            if (typeof enc.scaleResolutionDownBy !== "undefined") {
              // Compute scale factor from target height (base 720)
              enc.scaleResolutionDownBy = Math.max(1, 720 / config.height);
            }
          }
          await sender.setParameters?.(params);
        }
      } catch {
        // setParameters not available on all platforms
      }
    }
  } catch {
    // getSenders not available
  }
}

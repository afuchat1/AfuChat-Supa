export type PrestigeTier = {
  id: string;
  label: string;
  minAcoin: number;
  color: string;
  ringColors: [string, string];
  glowColor: string;
  emoji: string;
  description: string;
  perks: string[];
};

export const PRESTIGE_TIERS: PrestigeTier[] = [
  {
    id: "bronze",
    label: "Bronze",
    minAcoin: 0,
    color: "#CD7F32",
    ringColors: ["#CD7F32", "#8B4513"],
    glowColor: "#CD7F32",
    emoji: "🥉",
    description: "Just getting started",
    perks: ["Basic profile badge"],
  },
  {
    id: "silver",
    label: "Silver",
    minAcoin: 500,
    color: "#C0C0C0",
    ringColors: ["#E8E8E8", "#A0A0A0"],
    glowColor: "#C0C0C0",
    emoji: "🥈",
    description: "Making a name for yourself",
    perks: ["Silver profile ring", "Status badge on messages"],
  },
  {
    id: "gold",
    label: "Gold",
    minAcoin: 2000,
    color: "#D4A853",
    ringColors: ["#FFD700", "#B8860B"],
    glowColor: "#FFD700",
    emoji: "🥇",
    description: "You know how to play",
    perks: ["Gold profile ring", "Priority in search", "Gold badge"],
  },
  {
    id: "diamond",
    label: "Diamond",
    minAcoin: 10000,
    color: "#B9F2FF",
    ringColors: ["#B9F2FF", "#4FC3F7"],
    glowColor: "#4FC3F7",
    emoji: "💎",
    description: "Rare and valuable",
    perks: ["Diamond ring + ice glow", "Exclusive Diamond frame", "Featured in Rich List"],
  },
  {
    id: "obsidian",
    label: "Obsidian",
    minAcoin: 50000,
    color: "#7B2FBE",
    ringColors: ["#7B2FBE", "#1A0030"],
    glowColor: "#AF52DE",
    emoji: "⬛",
    description: "Dark power",
    perks: ["Obsidian dark ring", "Exclusive Obsidian title", "Rich List Top 100"],
  },
  {
    id: "legend",
    label: "Legend",
    minAcoin: 200000,
    color: "#FF9500",
    ringColors: ["#FF9500", "#AF52DE"],
    glowColor: "#FF9500",
    emoji: "👑",
    description: "The upper 1% of AfuChat",
    perks: ["Rainbow Legend ring", "👑 Legend crown badge", "Rich List Top 10", "Exclusive Legend showcase"],
  },
];

export function getPrestigeTier(acoin: number): PrestigeTier {
  const sorted = [...PRESTIGE_TIERS].reverse();
  return sorted.find((t) => acoin >= t.minAcoin) ?? PRESTIGE_TIERS[0];
}

export function getNextPrestigeTier(acoin: number): PrestigeTier | null {
  const current = getPrestigeTier(acoin);
  const idx = PRESTIGE_TIERS.findIndex((t) => t.id === current.id);
  return PRESTIGE_TIERS[idx + 1] ?? null;
}

export function prestigeProgress(acoin: number): number {
  const current = getPrestigeTier(acoin);
  const next = getNextPrestigeTier(acoin);
  if (!next) return 1;
  return (acoin - current.minAcoin) / (next.minAcoin - current.minAcoin);
}

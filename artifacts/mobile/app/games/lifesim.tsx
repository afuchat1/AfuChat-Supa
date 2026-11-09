/**
 * KAMPALA HUSTLE: Pro Edition
 * Fully native React Native life-sim set in Kampala, Uganda.
 * Saves to `life_earth_saves` · Leaderboard via `life_earth_leaderboard`
 * Awards ACoin on education, milestones, and retirement.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { Avatar } from "@/components/ui/Avatar";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import * as Haptics from "@/lib/haptics";
import { showAlert } from "@/lib/alert";
import { router } from "expo-router";
import { GlassHeader } from "@/components/ui/GlassHeader";

// ─── Game Data ─────────────────────────────────────────────────────────────────

const HUSTLES = [
  { id: "rolex",    name: "Rolex Maker",          baseSalary: 1_200_000,  reqEdu: 0, reqSkill: 0,  burnout: 15, emoji: "🍳", risk: 0.10, desc: "Setup shop near Makerere. High physical hustle, good cash flow. Watch the dust!" },
  { id: "boda",     name: "Boda Rider",            baseSalary: 2_400_000,  reqEdu: 0, reqSkill: 15, burnout: 25, emoji: "🏍️", risk: 0.35, desc: "Dodge traffic along Jinja Road. Incredible cash but high danger and daily police checks." },
  { id: "guide",    name: "Jinja Safari Guide",    baseSalary: 4_800_000,  reqEdu: 1, reqSkill: 35, burnout: 10, emoji: "🦁", risk: 0.15, desc: "Lead rafting tours on the Nile. Requires a Vocational Cert. High tourist tips." },
  { id: "banker",   name: "Junior Banker",         baseSalary: 8_400_000,  reqEdu: 2, reqSkill: 55, burnout: 20, emoji: "🏦", risk: 0.05, desc: "Wear crisp suits in Kololo. Low physical risk but high taxes and massive mental burnout." },
  { id: "dev",      name: "FinTech App Developer", baseSalary: 18_000_000, reqEdu: 2, reqSkill: 75, burnout: 35, emoji: "💻", risk: 0.00, desc: "Build crypto & payment apps. Remote work with heavy pay, high stress but tax audit targets." },
  { id: "exporter", name: "Coffee Farm Exporter",  baseSalary: 36_000_000, reqEdu: 3, reqSkill: 90, burnout: 15, emoji: "☕", risk: 0.08, desc: "Dominate central robusta trades. The gold standard. Outstanding yields." },
];

const EDUCATION = [
  { id: "vocational", name: "Vocational Cert",          cost: 1_500_000,  level: 1, skillGain: 20, desc: "Specialist electrical & hospitality training at Nakawa Voc. Institute." },
  { id: "degree",     name: "Makerere Business Degree", cost: 6_000_000,  level: 2, skillGain: 35, desc: "Study economics or IT at the prestigious Ivory Tower." },
  { id: "masters",    name: "Management MBA",           cost: 12_000_000, level: 3, skillGain: 40, desc: "Accelerated management course to dominate corporate KLA." },
];

const WEALTH = [
  { id: "boda_bike",      name: "Boxer Motorcycle",         cost: 5_000_000,   passive: 600_000,  mood: 15, stress: 5,   desc: "Boosts Boda Rider payout. Generates daily transport business." },
  { id: "sacco",          name: "Community SACCO",          cost: 3_000_000,   passive: 450_000,  mood: 5,  stress: 10,  desc: "High-yielding community fund. Watch out for potential fund flight!" },
  { id: "mukono_plot",    name: "Mukono Plot of Land",      cost: 18_000_000,  passive: 1_800_000, mood: 20, stress: 0,  desc: "Secure land deed. Reliable agricultural rentals. Extremely safe." },
  { id: "coffee_estate",  name: "Commercial Coffee Estate", cost: 50_000_000,  passive: 8_000_000, mood: 35, stress: 15, desc: "Buy high-yield coffee plantations in Luweero. Massive export gains." },
  { id: "muyenga_villa",  name: "Muyenga Skyline Villa",   cost: 150_000_000, passive: 0,         mood: 65, stress: -20, desc: "Ultimate security and luxury comfort away from toxic smoke." },
];

const LIFESTYLES = [
  { id: "res_muzigo",  cat: "res",  name: "Rent a Muzigo (1-Room)", cost: 480_000,   health: -5,  mood: 0,   emoji: "🏠", desc: "Basic single room in Kamwokya. Noisy environment." },
  { id: "res_flat",    cat: "res",  name: "Rented Modern Flat",     cost: 2_400_000, health: 5,   mood: 15,  emoji: "🏢", desc: "Secure compound in Naalya with running water." },
  { id: "res_owned",   cat: "res",  name: "Own Property Home",      cost: 0,         health: 15,  mood: 30,  emoji: "🏰", desc: "Free accommodation! (Requires Muyenga Skyline Villa)." },
  { id: "diet_kikomando", cat: "diet", name: "Beans & Kikomando",   cost: 200_000,   health: -15, mood: -10, emoji: "🫘", desc: "Street food staple. Heavy digestion stress." },
  { id: "diet_matooke",   cat: "diet", name: "Fresh Matooke & G-Nuts", cost: 900_000, health: 12, mood: 15,  emoji: "🍌", desc: "Fresh local nutritional balance." },
  { id: "diet_kololo",    cat: "diet", name: "Café Dining in Kololo",  cost: 3_600_000, health: 10, mood: 35, emoji: "☕", desc: "Expensive coffees, pizzas, and premium health eats." },
];

const HACKS = [
  { id: "bribe",     name: "Pay Traffic Cop Bribe",  cost: 100_000, gain: "Safe passage",          desc: "Settle police stops with cash. Zero hassle." },
  { id: "betting",   name: "Sports Betting Slip",    cost: 150_000, gain: "High-risk yield",        desc: "Wager at local Nabugabo betting shops." },
  { id: "nightlife", name: "Enjoy Club Nightlife",   cost: 400_000, gain: "Boost connections & mood", desc: "Buy rounds for influencers in Kabalagala." },
];

type CrisisOption = { text: string; cost?: number; resolve: (s: KHState) => string };
type Crisis = {
  id: string; title: string; desc: string; emoji: string;
  trigger: (s: KHState) => boolean;
  options: CrisisOption[];
};

// ─── State ─────────────────────────────────────────────────────────────────────

type KHState = {
  age: number;
  cashWallet: number;
  momoWallet: number;
  bankWallet: number;
  health: number;
  happiness: number;
  stress: number;
  connections: number;
  educationLevel: number;
  skills: number;
  activeJobId: string | null;
  ownedAssetIds: string[];
  residenceId: string;
  dietId: string;
  inflation: number;
  logs: string[];
  awardedMilestones: string[];
};

function freshState(): KHState {
  return {
    age: 18,
    cashWallet: 50_000,
    momoWallet: 100_000,
    bankWallet: 0,
    health: 100,
    happiness: 80,
    stress: 10,
    connections: 1,
    educationLevel: 0,
    skills: 15,
    activeJobId: null,
    ownedAssetIds: [],
    residenceId: "res_muzigo",
    dietId: "diet_kikomando",
    inflation: 1.0,
    logs: ["Welcome to Kampala! Find high-yielding gigs, upskill, and dodge taxes to retire rich! 🏙️"],
    awardedMilestones: [],
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getTotalMoney(s: KHState) { return s.cashWallet + s.momoWallet + s.bankWallet; }

function addMoney(s: KHState, amt: number): KHState {
  return {
    ...s,
    cashWallet: s.cashWallet + Math.floor(amt * 0.4),
    momoWallet: s.momoWallet + Math.floor(amt * 0.4),
    bankWallet: s.bankWallet + Math.floor(amt * 0.2),
  };
}

function deductMoney(s: KHState, amt: number): KHState {
  let cash = s.cashWallet, momo = s.momoWallet, bank = s.bankWallet;
  if (cash >= amt) { cash -= amt; }
  else {
    const r1 = amt - cash; cash = 0;
    if (momo >= r1) { momo -= r1; }
    else { const r2 = r1 - momo; momo = 0; bank = Math.max(0, bank - r2); }
  }
  return { ...s, cashWallet: cash, momoWallet: momo, bankWallet: bank };
}

function formatUGX(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.floor(n / 1_000)}k`;
  return `${n}`;
}

function getYearlyIncome(s: KHState): number {
  let sum = 0;
  const job = HUSTLES.find(h => h.id === s.activeJobId);
  if (job) {
    sum += job.baseSalary;
    if (job.id === "boda" && s.ownedAssetIds.includes("boda_bike")) sum += 1_500_000;
  }
  s.ownedAssetIds.forEach(id => {
    const asset = WEALTH.find(w => w.id === id);
    if (asset) sum += asset.passive;
  });
  return sum;
}

function getYearlyExpenses(s: KHState): number {
  const res = LIFESTYLES.find(l => l.id === s.residenceId);
  const diet = LIFESTYLES.find(l => l.id === s.dietId);
  return Math.floor(((res?.cost ?? 0) + (diet?.cost ?? 0)) * s.inflation);
}

function getActiveJob(s: KHState) { return HUSTLES.find(h => h.id === s.activeJobId) ?? null; }

function computeScore(s: KHState): number {
  const net = getTotalMoney(s);
  return Math.round(
    (net / 10_000) +
    s.connections * 50 +
    s.happiness * 5 +
    s.educationLevel * 200 -
    s.stress * 2 +
    (s.age - 18) * 10
  );
}

function getTitle(s: KHState): string {
  const net = getTotalMoney(s);
  if (net > 100_000_000) return "Muyenga Tycoon 🏰";
  if (net > 40_000_000) return "Enterprise Mogul 📈";
  const job = getActiveJob(s);
  if (job) return `Experienced ${job.name}`;
  return "Struggling High School Leaver";
}

// ─── Crises ────────────────────────────────────────────────────────────────────

const CRISES: Crisis[] = [
  {
    id: "ura_audit", title: "URA Tax Audit! 🏛️",
    desc: "The Uganda Revenue Authority notices your growing assets. They demand back-taxes and compliance audits!",
    emoji: "🏛️", trigger: (s) => getTotalMoney(s) > 15_000_000,
    options: [
      {
        text: "Pay compliance settlement (UGX 2.5M)", cost: 2_500_000,
        resolve: (s) => { Object.assign(s, deductMoney(s, 2_500_000)); s.stress = Math.max(0, s.stress - 15); return "Paid official taxes. URA flagged you as fully compliant! ✅"; }
      },
      {
        text: "Use Connections (Needs 2)",
        resolve: (s) => {
          if (s.connections >= 2) { s.connections -= 2; return "Called an influential uncle in the ministry. The tax file vanished! 🤝"; }
          Object.assign(s, deductMoney(s, 5_000_000)); s.health -= 25; s.stress = 100;
          return "Not enough connections! URA froze your Stanbic bank and charged UGX 5M in fines. 💸";
        }
      },
    ],
  },
  {
    id: "boda_robbery", title: "Street Ambush! 🕵️",
    desc: "While riding home through Kansanga, street boys try to seize your wallet and phone.",
    emoji: "🕵️", trigger: () => true,
    options: [
      {
        text: "Run & shout (risk injury)",
        resolve: (s) => {
          if (Math.random() < 0.6) {
            s.health -= 35; s.stress = Math.min(100, s.stress + 30);
            return "Fought back but took blows. Lost hard cash and ended up in a clinic. 🏥";
          }
          s.connections += 1; return "Outran them smoothly! Local youths praised your speed (+1 Connection). 💨";
        }
      },
      {
        text: "Pay them off (UGX 300,000)", cost: 300_000,
        resolve: (s) => { Object.assign(s, deductMoney(s, 300_000)); return "Calmly offered cash. They took 300k and let you pass safely. 🤝"; }
      },
    ],
  },
  {
    id: "sacco_collapse", title: "SACCO Fund Freeze! 📉",
    desc: "Rumors spread that SACCO directors are planning to vanish to Entebbe with the savings.",
    emoji: "📉", trigger: (s) => s.ownedAssetIds.includes("sacco"),
    options: [
      {
        text: "Withdraw immediately (30% penalty)",
        resolve: (s) => {
          s.ownedAssetIds = s.ownedAssetIds.filter(id => id !== "sacco");
          s.cashWallet += 2_100_000;
          return "Pulled out early. Took a minor loss but recovered UGX 2.1M before the bubble burst. 💰";
        }
      },
      {
        text: "Wait it out",
        resolve: (s) => {
          if (Math.random() < 0.7) {
            s.ownedAssetIds = s.ownedAssetIds.filter(id => id !== "sacco");
            s.happiness = Math.max(0, s.happiness - 30);
            return "Disaster! The SACCO folded overnight. Your savings were totally lost. 😭";
          }
          return "The rumors were fake! The SACCO posted record-high dividends this year. 🎉";
        }
      },
    ],
  },
  {
    id: "malaria", title: "Severe Malaria Attack! 🤒",
    desc: "Burning fever. Doctors confirm a high Malaria parasite load. You cannot work efficiently.",
    emoji: "🤒", trigger: () => true,
    options: [
      {
        text: "Buy cheap local drugs (UGX 80,000)", cost: 80_000,
        resolve: (s) => { Object.assign(s, deductMoney(s, 80_000)); s.health -= 20; s.stress = Math.min(100, s.stress + 15); return "Low-cost pills took days to kick in. You survived but remain fatigued. 😓"; }
      },
      {
        text: "Admit to Kololo Clinic (UGX 500,000)", cost: 500_000,
        resolve: (s) => { Object.assign(s, deductMoney(s, 500_000)); s.health = Math.min(100, s.health + 30); s.stress = Math.max(0, s.stress - 20); return "Top-tier medical care. Fully cured and back to maximum strength! 💪"; }
      },
    ],
  },
];

// ─── Supabase Persistence ──────────────────────────────────────────────────────

async function loadSave(userId: string): Promise<KHState | null> {
  const { data, error } = await supabase
    .from("life_earth_saves")
    .select("state, current_age")
    .eq("user_id", userId)
    .single();
  if (error || !data?.state) return null;
  const saved = data.state as Partial<KHState>;
  // Validate it's a Kampala Hustle save (has cashWallet)
  if (typeof saved.cashWallet !== "number") return null;
  return { ...freshState(), ...saved, age: data.current_age ?? saved.age ?? 18 };
}

async function persistSave(userId: string, s: KHState, displayName: string, handle: string): Promise<void> {
  const score = computeScore(s);
  const job = getActiveJob(s);
  await supabase.from("life_earth_saves").upsert({
    user_id: userId,
    state: s as unknown as Record<string, unknown>,
    legacy_score: score,
    current_age: s.age,
    career: job?.name ?? "Unemployed",
    country: "Uganda",
    family_class: getTitle(s),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
}

async function loadLeaderboard() {
  const { data } = await supabase
    .from("life_earth_leaderboard")
    .select("handle, display_name, avatar_url, legacy_score, current_age, career, country")
    .order("legacy_score", { ascending: false })
    .limit(30);
  return data ?? [];
}

async function awardACoin(userId: string, amount: number, reason: string) {
  try {
    await supabase.rpc("credit_acoin", { p_user_id: userId, p_amount: amount, p_reason: reason });
  } catch {}
}

// ─── Tab Types ─────────────────────────────────────────────────────────────────

type TabId = "hustle" | "study" | "wealth" | "living";

// ─── Main Component ────────────────────────────────────────────────────────────

export default function KampalaHustleGame() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors, accent } = useTheme();

  const [phase, setPhase] = useState<"loading" | "playing" | "leaderboard">("loading");
  const [gs, setGs] = useState<KHState>(freshState());
  const [tab, setTab] = useState<TabId>("hustle");
  const [crisis, setCrisis] = useState<Crisis | null>(null);
  const [crisisVisible, setCrisisVisible] = useState(false);
  const [endVisible, setEndVisible] = useState(false);
  const [endReason, setEndReason] = useState<"health" | "retirement">("retirement");
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [lbLoading, setLbLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ text: string; good: boolean } | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;

  // ── Boot ──────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    loadSave(user.id).then(saved => {
      if (saved) setGs(saved);
      setPhase("playing");
    });
  }, [user]);

  // ── Auto-save ─────────────────────────────────────────────────────────────────

  const scheduleSave = useCallback((state: KHState) => {
    if (!user) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaving(true);
      persistSave(
        user.id, state,
        (user as any).display_name ?? "Player",
        (user as any).handle ?? "",
      ).finally(() => setSaving(false));
    }, 1200);
  }, [user]);

  // ── Toast ─────────────────────────────────────────────────────────────────────

  const showToast = useCallback((text: string, good: boolean) => {
    setToast({ text, good });
    toastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToast(null));
  }, [toastAnim]);

  // ── Mutate helper ─────────────────────────────────────────────────────────────

  const mutate = useCallback((updater: (s: KHState) => KHState | void) => {
    setGs(prev => {
      const draft = { ...prev };
      const result = updater(draft);
      const next = result ?? draft;
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  // ── Milestone ACoin rewards ────────────────────────────────────────────────────

  const checkMilestones = useCallback((s: KHState) => {
    if (!user) return s;
    const awarded = [...s.awardedMilestones];
    const net = getTotalMoney(s);

    const milestones: [string, number, string, number][] = [
      ["net_1m",   1_000_000,  "First million! 🎉",    5],
      ["net_10m",  10_000_000, "Reached 10M UGX! 💰",  10],
      ["net_50m",  50_000_000, "Reached 50M UGX! 🚀",  20],
      ["net_100m", 100_000_000,"Tycoon milestone! 🏰", 30],
    ];
    for (const [id, threshold, msg, coins] of milestones) {
      if (net >= threshold && !awarded.includes(id)) {
        awarded.push(id);
        awardACoin(user.id, coins, `kampala_hustle_${id}`);
        showToast(`${msg} +${coins} ACoins rewarded!`, true);
      }
    }
    return { ...s, awardedMilestones: awarded };
  }, [user, showToast]);

  // ── Actions ───────────────────────────────────────────────────────────────────

  function applyJob(jobId: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    mutate(s => {
      const job = HUSTLES.find(h => h.id === jobId);
      if (!job) return;
      if (s.educationLevel < job.reqEdu || s.skills < job.reqSkill) return;
      s.activeJobId = job.id;
      s.logs = [`💼 Job Secured: ${job.name}. Earning UGX ${formatUGX(job.baseSalary)}/yr.`, ...s.logs.slice(0, 49)];
      return s;
    });
  }

  function resignJob() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    mutate(s => {
      const job = getActiveJob(s);
      s.logs = [`💼 Resigned from ${job?.name ?? "job"}.`, ...s.logs.slice(0, 49)];
      s.activeJobId = null;
      return s;
    });
  }

  function buyEducation(eduId: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    mutate(s => {
      const edu = EDUCATION.find(e => e.id === eduId);
      if (!edu) return;
      if (getTotalMoney(s) < edu.cost) { showToast("Not enough funds! 💸", false); return; }
      if (s.educationLevel !== edu.level - 1) { showToast("Complete previous level first!", false); return; }
      const next = deductMoney(s, edu.cost);
      Object.assign(s, next);
      s.educationLevel = edu.level;
      s.skills = Math.min(100, s.skills + edu.skillGain);
      s.connections += 1;
      s.logs = [`🎓 Graduated: ${edu.name}! Skill +${edu.skillGain}% · +1 Connection`, ...s.logs.slice(0, 49)];
      if (user) awardACoin(user.id, edu.level * 5, `kampala_hustle_edu_${edu.id}`);
      showToast(`🎓 ${edu.name} earned! +${edu.level * 5} ACoins`, true);
      return s;
    });
  }

  function buyAsset(assetId: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    mutate(s => {
      const asset = WEALTH.find(w => w.id === assetId);
      if (!asset) return;
      if (getTotalMoney(s) < asset.cost) { showToast("Not enough funds! 💸", false); return; }
      const next = deductMoney(s, asset.cost);
      Object.assign(s, next);
      s.ownedAssetIds = [...s.ownedAssetIds, asset.id];
      s.happiness = Math.min(100, s.happiness + asset.mood);
      s.stress = Math.max(0, s.stress + (asset.stress ?? 0));
      if (asset.id === "muyenga_villa") s.residenceId = "res_owned";
      s.logs = [`🏡 Acquired: ${asset.name}. Lifestyle boosted.`, ...s.logs.slice(0, 49)];
      return s;
    });
  }

  function sellAsset(assetId: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    mutate(s => {
      const idx = s.ownedAssetIds.indexOf(assetId);
      if (idx === -1) return;
      const asset = WEALTH.find(w => w.id === assetId)!;
      const payout = Math.floor(asset.cost * 0.7);
      s.cashWallet += payout;
      s.ownedAssetIds = [...s.ownedAssetIds];
      s.ownedAssetIds.splice(idx, 1);
      s.happiness = Math.max(0, s.happiness - asset.mood);
      if (assetId === "muyenga_villa" && s.residenceId === "res_owned") s.residenceId = "res_muzigo";
      s.logs = [`💸 Sold: ${asset.name} for UGX ${formatUGX(payout)}.`, ...s.logs.slice(0, 49)];
      return s;
    });
  }

  function executeHack(hackId: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    mutate(s => {
      const hack = HACKS.find(h => h.id === hackId);
      if (!hack) return;
      if (getTotalMoney(s) < hack.cost) { showToast("Not enough funds! 💸", false); return; }
      const next = deductMoney(s, hack.cost);
      Object.assign(s, next);
      if (hack.id === "bribe") {
        s.connections += 1;
        s.logs = ["🤝 Paid cop bribe: Avoided traffic stress (+1 Connection)", ...s.logs.slice(0, 49)];
      } else if (hack.id === "betting") {
        if (Math.random() < 0.3) {
          const win = hack.cost * 4;
          s.cashWallet += win;
          s.happiness = Math.min(100, s.happiness + 20);
          s.logs = [`⚽ Nabugabo Win! Hit the bet! +UGX ${formatUGX(win)}`, ...s.logs.slice(0, 49)];
        } else {
          s.happiness = Math.max(0, s.happiness - 15);
          s.logs = ["⚽ Nabugabo Loss: Your slip lost in the 90th minute.", ...s.logs.slice(0, 49)];
        }
      } else if (hack.id === "nightlife") {
        s.happiness = Math.min(100, s.happiness + 25);
        s.stress = Math.max(0, s.stress - 20);
        s.connections += 2;
        s.logs = ["🍻 Kabalagala: Shared drinks with tech managers. +2 connections, mood lifted.", ...s.logs.slice(0, 49)];
      }
      return s;
    });
  }

  function setResidence(id: string) {
    mutate(s => { s.residenceId = id; s.logs = ["🏠 Accommodation updated.", ...s.logs.slice(0, 49)]; return s; });
  }

  function setDiet(id: string) {
    mutate(s => { s.dietId = id; s.logs = ["🍽️ Nutrition standard updated.", ...s.logs.slice(0, 49)]; return s; });
  }

  // ── Advance Year ──────────────────────────────────────────────────────────────

  function advanceYear() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setGs(prev => {
      let s = { ...prev };

      // Income / expenses
      const inc = getYearlyIncome(s);
      const exp = getYearlyExpenses(s);
      const net = inc - exp;
      if (net >= 0) {
        s = addMoney(s, net);
        s.logs = [`💰 Net year gain: +UGX ${formatUGX(net)}`, ...s.logs.slice(0, 49)];
      } else {
        s = deductMoney(s, Math.abs(net));
        s.logs = [`⚠️ Cost of living deficit: -UGX ${formatUGX(Math.abs(net))}`, ...s.logs.slice(0, 49)];
      }

      // Age
      s.age += 1;

      // Health/mood from lifestyle
      const res = LIFESTYLES.find(l => l.id === s.residenceId);
      const diet = LIFESTYLES.find(l => l.id === s.dietId);
      if (res)  { s.health = Math.min(100, Math.max(0, s.health + res.health)); s.happiness = Math.min(100, Math.max(0, s.happiness + res.mood)); }
      if (diet) { s.health = Math.min(100, Math.max(0, s.health + diet.health)); s.happiness = Math.min(100, Math.max(0, s.happiness + diet.mood)); }

      // Job stress
      const job = getActiveJob(s);
      if (job) {
        s.stress = Math.min(100, s.stress + Math.floor(job.burnout * 0.5));
        if (s.stress > 60) { s.health = Math.max(0, s.health - 12); s.logs = ["🔥 Burnout: extreme stress is damaging vitals.", ...s.logs.slice(0, 49)]; }
      } else {
        s.stress = Math.max(0, s.stress - 15);
      }

      // Inflation
      s.inflation = +(0.8 + Math.random() * 0.9).toFixed(2);

      // Milestones check
      s = checkMilestones(s);

      // Crisis (55% chance)
      if (Math.random() < 0.55) {
        const valid = CRISES.filter(c => c.trigger(s));
        if (valid.length > 0) {
          const picked = valid[Math.floor(Math.random() * valid.length)];
          setCrisis(picked);
          setCrisisVisible(true);
        }
      }

      // End game checks (health or retirement age)
      if (s.health <= 0) {
        setEndReason("health");
        setEndVisible(true);
      } else if (s.age >= 75) {
        setEndReason("retirement");
        setEndVisible(true);
        if (user) awardACoin(user.id, 20, "kampala_hustle_retired");
      }

      scheduleSave(s);
      return s;
    });
  }

  // ── Crisis resolution ─────────────────────────────────────────────────────────

  function resolveCrisis(optionIdx: number) {
    if (!crisis) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setGs(prev => {
      const s = { ...prev };
      const msg = crisis.options[optionIdx].resolve(s);
      s.logs = [msg, ...s.logs.slice(0, 49)];
      showToast(msg, !msg.includes("lost") && !msg.includes("Disaster") && !msg.includes("froze"));
      scheduleSave(s);
      return s;
    });
    setCrisisVisible(false);
    setCrisis(null);
  }

  // ── New Game ──────────────────────────────────────────────────────────────────

  function newGame() {
    const s = freshState();
    setGs(s);
    setEndVisible(false);
    setTab("hustle");
    if (user) persistSave(user.id, s, (user as any).display_name ?? "Player", (user as any).handle ?? "");
  }

  // ── Leaderboard ───────────────────────────────────────────────────────────────

  async function openLeaderboard() {
    setPhase("leaderboard");
    setLbLoading(true);
    const data = await loadLeaderboard();
    setLeaderboard(data);
    setLbLoading(false);
  }

  // ─── Render: Loading ──────────────────────────────────────────────────────────

  if (phase === "loading") {
    return (
      <View style={[st.root, { backgroundColor: "#0a0f1e" }]}>
        <ActivityIndicator color="#f59e0b" size="large" />
        <Text style={st.loadingText}>Loading your hustle...</Text>
      </View>
    );
  }

  // ─── Render: Leaderboard ──────────────────────────────────────────────────────

  if (phase === "leaderboard") {
    return (
      <View style={[st.root, { backgroundColor: "#0a0f1e" }]}>
        <GlassHeader title="Kampala Leaderboard 🏆" showBack onBack={() => setPhase("playing")} />
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {lbLoading ? (
            <ActivityIndicator color="#f59e0b" style={{ marginTop: 40 }} />
          ) : leaderboard.length === 0 ? (
            <View style={st.emptyLb}>
              <Text style={{ fontSize: 40 }}>🏙️</Text>
              <Text style={[st.emptyLbText, { color: "rgba(255,255,255,0.5)" }]}>No rankings yet. Be the first!</Text>
            </View>
          ) : leaderboard.map((entry, i) => (
            <View key={entry.handle ?? i} style={st.lbRow}>
              <Text style={st.lbRank}>#{i + 1}</Text>
              <Avatar uri={entry.avatar_url} name={entry.display_name ?? "Player"} size={38} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={st.lbName}>{entry.display_name ?? "Unknown"}</Text>
                <Text style={st.lbSub}>Age {entry.current_age} · {entry.career ?? "Unemployed"}</Text>
              </View>
              <View style={st.lbScore}>
                <Text style={st.lbScoreVal}>{(entry.legacy_score ?? 0).toLocaleString()}</Text>
                <Text style={st.lbScoreLbl}>pts</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  // ─── Render: Game ─────────────────────────────────────────────────────────────

  const totalMoney = getTotalMoney(gs);
  const income = getYearlyIncome(gs);
  const expenses = getYearlyExpenses(gs);
  const activeJob = getActiveJob(gs);
  const charName = (user as any)?.display_name ?? "Kato Arthur";
  const charAvatar = (user as any)?.avatar_url ?? null;

  return (
    <View style={[st.root, { backgroundColor: "#0a0f1e" }]}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={[st.header, { paddingTop: insets.top + 4 }]}>
        {/* Back */}
        <TouchableOpacity onPress={() => router.back()} style={st.headerBack} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color="#f59e0b" />
        </TouchableOpacity>

        {/* Identity */}
        <View style={st.headerIdentity}>
          <Avatar uri={charAvatar} name={charName} size={36} />
          <View style={{ marginLeft: 8, flex: 1 }}>
            <Text style={st.charName} numberOfLines={1}>{charName}</Text>
            <Text style={st.charTitle} numberOfLines={1}>{getTitle(gs)}</Text>
          </View>
          <View style={st.ageBadge}>
            <Text style={st.ageBadgeText}>Age {gs.age}</Text>
          </View>
        </View>

        {/* Leaderboard button */}
        <TouchableOpacity onPress={openLeaderboard} hitSlop={8} style={st.lbBtn}>
          <Ionicons name="trophy" size={20} color="#f59e0b" />
        </TouchableOpacity>
      </View>

      {/* ── Wallet Row ──────────────────────────────────────────────────────── */}
      <View style={st.walletRow}>
        <WalletCard emoji="💵" label="Cash" value={`UGX ${formatUGX(gs.cashWallet)}`} color="#f59e0b" />
        <WalletCard emoji="📱" label="MoMo" value={`UGX ${formatUGX(gs.momoWallet)}`} color="#facc15" />
        <WalletCard emoji="🏛️" label="Bank" value={`UGX ${formatUGX(gs.bankWallet)}`} color="#34d399" taxFlag={totalMoney > 15_000_000} />
      </View>

      {/* ── Vitals ──────────────────────────────────────────────────────────── */}
      <View style={st.vitalsRow}>
        <VitalBar label="❤️" value={gs.health}   color="#f87171" />
        <VitalBar label="😊" value={gs.happiness} color="#60a5fa" />
        <VitalBar label="🔥" value={gs.stress}    color="#fbbf24" invert />
      </View>

      {/* ── Cash flow strip ─────────────────────────────────────────────────── */}
      <View style={st.cashFlowStrip}>
        <View style={st.cashFlowLeft}>
          <Text style={st.cashFlowLabel}>JOB:</Text>
          <Text style={st.cashFlowJob} numberOfLines={1}>{activeJob?.emoji ?? "😴"} {activeJob?.name ?? "Unemployed"}</Text>
        </View>
        <View style={st.cashFlowRight}>
          <Text style={st.cashIn}>+{formatUGX(income)}</Text>
          <Text style={st.cashOut}>-{formatUGX(expenses)}</Text>
          <View style={st.inflationBadge}>
            <Text style={st.inflationText}>⚡{gs.inflation.toFixed(1)}x</Text>
          </View>
        </View>
      </View>

      {/* ── Tab nav ─────────────────────────────────────────────────────────── */}
      <View style={st.tabBar}>
        {([ ["hustle","💼","Hustle"], ["study","🎓","Study"], ["wealth","📈","Wealth"], ["living","🏖️","Living"] ] as [TabId,string,string][]).map(([id,emoji,label]) => (
          <TouchableOpacity key={id} style={[st.tabBtn, tab === id && st.tabBtnActive]} onPress={() => setTab(id)}>
            <Text style={st.tabEmoji}>{emoji}</Text>
            <Text style={[st.tabLabel, tab === id && st.tabLabelActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 110, gap: 10 }}
        showsVerticalScrollIndicator={false}
      >
        {tab === "hustle" && (
          <>
            <SectionLabel text="💼 ACTIVE CAREERS" sub="Requres skill + edu to unlock" />
            {HUSTLES.map(job => {
              const isCurrent = gs.activeJobId === job.id;
              const meetsEdu = gs.educationLevel >= job.reqEdu;
              const meetsSkill = gs.skills >= job.reqSkill;
              const allowed = meetsEdu && meetsSkill;
              return (
                <View key={job.id} style={[st.card, isCurrent && { borderColor: "#f59e0b80" }]}>
                  <View style={st.cardTop}>
                    <Text style={{ fontSize: 30 }}>{job.emoji}</Text>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={st.cardTitle}>{job.name}</Text>
                      <Text style={st.cardGreen}>+UGX {formatUGX(job.baseSalary)} / year</Text>
                    </View>
                    {isCurrent && <View style={st.activeBadge}><Text style={st.activeBadgeText}>ACTIVE</Text></View>}
                  </View>
                  <Text style={st.cardDesc}>{job.desc}</Text>
                  <View style={st.cardFooter}>
                    <View>
                      <Text style={[st.cardMeta, { color: meetsSkill ? "#34d399" : "#f87171" }]}>Skill: {job.reqSkill}+</Text>
                      <Text style={[st.cardMeta, { color: job.risk > 0.2 ? "#f87171" : "#fbbf24" }]}>Risk: {(job.risk * 100).toFixed(0)}%</Text>
                    </View>
                    {isCurrent
                      ? <TouchableOpacity style={st.btnDanger} onPress={resignJob}><Text style={st.btnDangerText}>Resign</Text></TouchableOpacity>
                      : <TouchableOpacity style={[st.btnPrimary, !allowed && st.btnDisabled]} disabled={!allowed} onPress={() => applyJob(job.id)}>
                          <Text style={[st.btnPrimaryText, !allowed && { color: "#64748b" }]}>Apply</Text>
                        </TouchableOpacity>
                    }
                  </View>
                </View>
              );
            })}
            <SectionLabel text="🔧 STREET HACKS" sub="Quick one-off plays" />
            {HACKS.map(h => (
              <View key={h.id} style={st.card}>
                <View style={st.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.cardTitle}>{h.name}</Text>
                    <Text style={st.cardDesc}>{h.desc}</Text>
                  </View>
                  <Text style={st.cardGold}>UGX {formatUGX(h.cost)}</Text>
                </View>
                <View style={st.cardFooter}>
                  <Text style={st.cardMeta2}>Gain: {h.gain}</Text>
                  <TouchableOpacity
                    style={[st.btnIndigo, getTotalMoney(gs) < h.cost && st.btnDisabled]}
                    disabled={getTotalMoney(gs) < h.cost}
                    onPress={() => executeHack(h.id)}
                  >
                    <Text style={st.btnIndigoText}>Run Hack</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}

        {tab === "study" && (
          <>
            <SectionLabel text="🎓 SELF UPGRADES" sub="Nakawa & Makerere" />
            {EDUCATION.map(edu => {
              const done = gs.educationLevel >= edu.level;
              const canPay = getTotalMoney(gs) >= edu.cost;
              const isNext = gs.educationLevel === edu.level - 1;
              return (
                <View key={edu.id} style={[st.card, done && { borderColor: "#6366f180" }]}>
                  <View style={st.cardTop}>
                    <Text style={{ fontSize: 28 }}>🎓</Text>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={st.cardTitle}>{edu.name}</Text>
                      <Text style={st.cardIndigo}>Tuition: UGX {formatUGX(edu.cost)}</Text>
                    </View>
                    {done && <View style={st.earnedBadge}><Text style={st.earnedBadgeText}>EARNED</Text></View>}
                  </View>
                  <Text style={st.cardDesc}>{edu.desc}</Text>
                  <View style={st.cardFooter}>
                    <Text style={st.cardGreen}>+{edu.skillGain}% Skill · +5 ACoins</Text>
                    {done
                      ? <Text style={st.cardMeta}>Completed ✅</Text>
                      : <TouchableOpacity
                          style={[st.btnPrimary, (!canPay || !isNext) && st.btnDisabled]}
                          disabled={!canPay || !isNext}
                          onPress={() => buyEducation(edu.id)}
                        >
                          <Text style={[st.btnPrimaryText, (!canPay || !isNext) && { color: "#64748b" }]}>Enroll</Text>
                        </TouchableOpacity>
                    }
                  </View>
                </View>
              );
            })}
            {/* Skills progress */}
            <View style={[st.card, { gap: 10 }]}>
              <Text style={st.cardTitle}>📊 Your Progress</Text>
              <StatBar label="Skills" value={gs.skills} color="#6366f1" />
              <StatBar label="Connections" value={Math.min(100, gs.connections * 10)} color="#0ea5e9" />
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={st.cardMeta}>Education Level: {["High School","Vocational","Degree","MBA"][gs.educationLevel]}</Text>
                <Text style={st.cardGold}>Score: {computeScore(gs).toLocaleString()}</Text>
              </View>
            </View>
          </>
        )}

        {tab === "wealth" && (
          <>
            <SectionLabel text="📈 ASSETS & INVESTMENTS" sub="Build your portfolio" />
            {WEALTH.map(asset => {
              const count = gs.ownedAssetIds.filter(id => id === asset.id).length;
              const canPay = getTotalMoney(gs) >= asset.cost;
              return (
                <View key={asset.id} style={[st.card, count > 0 && { borderColor: "#34d39980" }]}>
                  <View style={st.cardTop}>
                    <Text style={{ fontSize: 28 }}>🏡</Text>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={st.cardTitle}>{asset.name}</Text>
                      <Text style={st.cardGreen}>Price: UGX {formatUGX(asset.cost)}</Text>
                    </View>
                    {count > 0 && <View style={st.ownedBadge}><Text style={st.ownedBadgeText}>×{count}</Text></View>}
                  </View>
                  <Text style={st.cardDesc}>{asset.desc}</Text>
                  <View style={st.cardFooter}>
                    <View>
                      {asset.passive > 0 && <Text style={st.cardGreen}>+UGX {formatUGX(asset.passive)}/yr</Text>}
                      <Text style={st.cardMeta}>Mood +{asset.mood}%</Text>
                    </View>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {count > 0 && (
                        <TouchableOpacity style={st.btnDanger} onPress={() => sellAsset(asset.id)}>
                          <Text style={st.btnDangerText}>Sell</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[st.btnPrimary, !canPay && st.btnDisabled]}
                        disabled={!canPay}
                        onPress={() => buyAsset(asset.id)}
                      >
                        <Text style={[st.btnPrimaryText, !canPay && { color: "#64748b" }]}>Buy</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {tab === "living" && (
          <>
            <SectionLabel text="🏠 HOUSING" sub="Where you lay your head" />
            {LIFESTYLES.filter(l => l.cat === "res").map(item => {
              if (item.id === "res_owned" && !gs.ownedAssetIds.includes("muyenga_villa")) return null;
              const isCurrent = gs.residenceId === item.id;
              return (
                <View key={item.id} style={[st.card, isCurrent && { borderColor: "#f59e0b80" }]}>
                  <View style={st.cardTop}>
                    <Text style={{ fontSize: 26 }}>{item.emoji}</Text>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={st.cardTitle}>{item.name}</Text>
                      <Text style={st.cardMeta}>{item.cost === 0 ? "FREE" : `UGX ${formatUGX(item.cost)}/yr`}</Text>
                    </View>
                    {isCurrent && <View style={st.activeBadge}><Text style={st.activeBadgeText}>CHOSEN</Text></View>}
                  </View>
                  <Text style={st.cardDesc}>{item.desc}</Text>
                  {!isCurrent && (
                    <View style={{ alignItems: "flex-end", marginTop: 8 }}>
                      <TouchableOpacity style={st.btnSecondary} onPress={() => setResidence(item.id)}>
                        <Text style={st.btnSecondaryText}>Select</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}

            <SectionLabel text="🍽️ NUTRITION" sub="What fuels your hustle" />
            {LIFESTYLES.filter(l => l.cat === "diet").map(item => {
              const isCurrent = gs.dietId === item.id;
              return (
                <View key={item.id} style={[st.card, isCurrent && { borderColor: "#6366f180" }]}>
                  <View style={st.cardTop}>
                    <Text style={{ fontSize: 26 }}>{item.emoji}</Text>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={st.cardTitle}>{item.name}</Text>
                      <Text style={st.cardMeta}>UGX {formatUGX(item.cost)}/yr</Text>
                    </View>
                    {isCurrent && <View style={[st.activeBadge, { backgroundColor: "#6366f130", borderColor: "#6366f1" }]}><Text style={[st.activeBadgeText, { color: "#818cf8" }]}>CHOSEN</Text></View>}
                  </View>
                  <Text style={st.cardDesc}>{item.desc}</Text>
                  <View style={st.cardFooter}>
                    <View>
                      <Text style={[st.cardMeta, { color: item.health >= 0 ? "#34d399" : "#f87171" }]}>Health {item.health > 0 ? "+" : ""}{item.health}%</Text>
                      <Text style={[st.cardMeta, { color: item.mood >= 0 ? "#60a5fa" : "#f87171" }]}>Mood {item.mood > 0 ? "+" : ""}{item.mood}%</Text>
                    </View>
                    {!isCurrent && (
                      <TouchableOpacity style={st.btnSecondary} onPress={() => setDiet(item.id)}>
                        <Text style={st.btnSecondaryText}>Select</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}

            {/* Event log */}
            <SectionLabel text="📋 KAMPALA ALERT FEED" sub="" />
            <View style={st.logBox}>
              {gs.logs.slice(0, 8).map((log, i) => (
                <View key={i} style={[st.logItem, {
                  borderLeftColor: log.includes("lost") || log.includes("Deficit") || log.includes("Disaster") ? "#f87171"
                    : log.includes("Earned") || log.includes("Secured") || log.includes("Win") ? "#34d399"
                    : "#6366f1"
                }]}>
                  <Text style={st.logText}>{log}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* ── Bottom action bar ────────────────────────────────────────────────── */}
      <View style={[st.bottomBar, { paddingBottom: insets.bottom + 6 }]}>
        <TouchableOpacity style={st.advanceBtn} onPress={advanceYear} activeOpacity={0.85}>
          <LinearGradient colors={["#f59e0b", "#eab308"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.advanceBtnGrad}>
            <Text style={st.advanceBtnText}>⏩  ADVANCE YEAR (HUSTLE!)</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* ── Toast ───────────────────────────────────────────────────────────── */}
      {toast && (
        <Animated.View style={[st.toast, { opacity: toastAnim, top: insets.top + 70, borderColor: toast.good ? "#34d399" : "#f87171" }]}>
          <Text style={[st.toastText, { color: toast.good ? "#34d399" : "#f87171" }]}>{toast.text}</Text>
        </Animated.View>
      )}

      {/* ── Saving indicator ────────────────────────────────────────────────── */}
      {saving && (
        <View style={[st.savingDot, { top: insets.top + 10 }]}>
          <ActivityIndicator size={10} color="#f59e0b" />
        </View>
      )}

      {/* ── Crisis Modal ─────────────────────────────────────────────────────── */}
      <Modal visible={crisisVisible} transparent animationType="slide">
        <View style={st.crisisOverlay}>
          <View style={st.crisisPanel}>
            <View style={st.crisisHandle} />
            {crisis && (
              <>
                <View style={st.crisisHeader}>
                  <View style={st.crisisTagBadge}><Text style={st.crisisTag}>⚠️ KAMPALA CRISIS</Text></View>
                  <Text style={{ fontSize: 36 }}>{crisis.emoji}</Text>
                </View>
                <Text style={st.crisisTitle}>{crisis.title}</Text>
                <Text style={st.crisisDesc}>{crisis.desc}</Text>
                <View style={{ gap: 10, marginTop: 8 }}>
                  {crisis.options.map((opt, idx) => (
                    <TouchableOpacity key={idx} style={st.crisisOption} onPress={() => resolveCrisis(idx)} activeOpacity={0.8}>
                      <Text style={st.crisisOptionText}>{opt.text}</Text>
                      <Ionicons name="chevron-forward" size={16} color="#f59e0b" />
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── End Game Modal ────────────────────────────────────────────────────── */}
      <Modal visible={endVisible} transparent animationType="fade">
        <View style={st.endOverlay}>
          <View style={st.endPanel}>
            <LinearGradient colors={["#f59e0b", "#d97706"]} style={st.endIcon}>
              <Text style={{ fontSize: 32 }}>{endReason === "health" ? "💀" : "👴🏽"}</Text>
            </LinearGradient>
            <Text style={st.endTitle}>{endReason === "health" ? "VITALS FAILURE" : "HUSTLE COMPLETED"}</Text>
            <Text style={st.endSub}>{endReason === "health" ? "You collapsed under the pressure of Kampala life." : `Congratulations! You hustled to age ${gs.age}.`}</Text>

            <View style={st.endGrid}>
              <EndStat label="Net Worth"     value={`UGX ${formatUGX(totalMoney)}`}  color="#34d399" />
              <EndStat label="Final Age"     value={`${gs.age}`}                      color="#f8fafc" />
              <EndStat label="Education"     value={["High School","Vocational","Degree","MBA"][gs.educationLevel]}  color="#818cf8" />
              <EndStat label="Connections"   value={`${gs.connections}`}              color="#60a5fa" />
              <EndStat label="Hustle Score"  value={computeScore(gs).toLocaleString()} color="#f59e0b" />
              <EndStat label="Career"        value={activeJob?.name ?? "None"}        color="#fbbf24" />
            </View>

            {endReason === "retirement" && (
              <View style={st.endAcoin}>
                <Text style={st.endAcoinText}>🎉 Retired! +20 ACoins awarded to your wallet!</Text>
              </View>
            )}

            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity style={[st.endBtn, { flex: 1, backgroundColor: "#1e293b" }]} onPress={() => { setEndVisible(false); openLeaderboard(); }}>
                <Text style={[st.endBtnText, { color: "#f59e0b" }]}>🏆 Rankings</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.endBtn, { flex: 1, backgroundColor: "#f59e0b" }]} onPress={newGame}>
                <Text style={[st.endBtnText, { color: "#0a0f1e" }]}>Hustle Again</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function WalletCard({ emoji, label, value, color, taxFlag }: { emoji: string; label: string; value: string; color: string; taxFlag?: boolean }) {
  return (
    <View style={st.walletCard}>
      {taxFlag && <View style={st.taxFlag} />}
      <Text style={st.walletEmoji}>{emoji}</Text>
      <Text style={st.walletLabel}>{label}</Text>
      <Text style={[st.walletValue, { color }]}>{value}</Text>
    </View>
  );
}

function VitalBar({ label, value, color, invert }: { label: string; value: number; color: string; invert?: boolean }) {
  const pct = Math.min(100, Math.max(0, value));
  const displayPct = invert ? pct : pct;
  return (
    <View style={st.vitalItem}>
      <Text style={st.vitalLabel}>{label} {pct}%</Text>
      <View style={st.vitalTrack}>
        <View style={[st.vitalFill, { width: `${displayPct}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={st.cardMeta}>{label}</Text>
        <Text style={[st.cardMeta, { color }]}>{value}%</Text>
      </View>
      <View style={st.vitalTrack}>
        <View style={[st.vitalFill, { width: `${Math.min(100, value)}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function SectionLabel({ text, sub }: { text: string; sub?: string }) {
  return (
    <View style={st.sectionLabel}>
      <Text style={st.sectionLabelText}>{text}</Text>
      {sub ? <Text style={st.sectionLabelSub}>{sub}</Text> : null}
    </View>
  );
}

function EndStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={st.endStatCell}>
      <Text style={st.endStatLabel}>{label}</Text>
      <Text style={[st.endStatValue, { color }]}>{value}</Text>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { color: "rgba(255,255,255,0.5)", fontFamily: "Inter_400Regular", marginTop: 12, fontSize: 13 },

  // Header
  header: { flexDirection: "row", alignItems: "center", backgroundColor: "#060d1a", paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.06)", width: "100%" },
  headerBack: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerIdentity: { flex: 1, flexDirection: "row", alignItems: "center", marginHorizontal: 8 },
  charName: { fontFamily: "Inter_700Bold", fontSize: 13, color: "#f8fafc" },
  charTitle: { fontFamily: "Inter_400Regular", fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 1 },
  ageBadge: { backgroundColor: "#1e293b", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 0.5, borderColor: "#f59e0b40" },
  ageBadgeText: { fontFamily: "Inter_700Bold", fontSize: 9, color: "#f59e0b" },
  lbBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },

  // Wallets
  walletRow: { flexDirection: "row", gap: 6, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "#060d1a", width: "100%" },
  walletCard: { flex: 1, backgroundColor: "#0f172a", borderRadius: 10, padding: 8, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.06)", position: "relative" },
  walletEmoji: { fontSize: 11 },
  walletLabel: { fontFamily: "Inter_700Bold", fontSize: 7, color: "rgba(255,255,255,0.4)", marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 },
  walletValue: { fontFamily: "Inter_700Bold", fontSize: 10, marginTop: 3 },
  taxFlag: { position: "absolute", top: 4, right: 4, width: 6, height: 6, borderRadius: 3, backgroundColor: "#f87171" },

  // Vitals
  vitalsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 10, paddingBottom: 8, backgroundColor: "#060d1a", width: "100%" },
  vitalItem: { flex: 1 },
  vitalLabel: { fontFamily: "Inter_600SemiBold", fontSize: 8, color: "rgba(255,255,255,0.45)", marginBottom: 3, textTransform: "uppercase" },
  vitalTrack: { height: 4, backgroundColor: "#1e293b", borderRadius: 2, overflow: "hidden" },
  vitalFill: { height: "100%", borderRadius: 2 },

  // Cash flow strip
  cashFlowStrip: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#060d1a", paddingHorizontal: 12, paddingBottom: 8, borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.06)", width: "100%" },
  cashFlowLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  cashFlowLabel: { fontFamily: "Inter_600SemiBold", fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" },
  cashFlowJob: { fontFamily: "Inter_700Bold", fontSize: 10, color: "#f8fafc", maxWidth: 140 },
  cashFlowRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  cashIn: { fontFamily: "Inter_700Bold", fontSize: 10, color: "#34d399" },
  cashOut: { fontFamily: "Inter_700Bold", fontSize: 10, color: "#f87171" },
  inflationBadge: { backgroundColor: "#f59e0b20", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  inflationText: { fontFamily: "Inter_700Bold", fontSize: 8, color: "#f59e0b" },

  // Tab bar
  tabBar: { flexDirection: "row", backgroundColor: "#0f172a", paddingHorizontal: 8, paddingVertical: 6, gap: 4, borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.06)", width: "100%" },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 10 },
  tabBtnActive: { backgroundColor: "#1e293b" },
  tabEmoji: { fontSize: 14 },
  tabLabel: { fontFamily: "Inter_600SemiBold", fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 2 },
  tabLabelActive: { color: "#f59e0b" },

  // Cards
  card: { backgroundColor: "#0f172a", borderRadius: 16, padding: 14, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.06)", gap: 8 },
  cardTop: { flexDirection: "row", alignItems: "center" },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 13, color: "#f8fafc" },
  cardDesc: { fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 16 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 0.5, borderTopColor: "rgba(255,255,255,0.06)", paddingTop: 8 },
  cardGreen: { fontFamily: "Inter_700Bold", fontSize: 10, color: "#34d399", marginTop: 2 },
  cardGold: { fontFamily: "Inter_700Bold", fontSize: 10, color: "#f59e0b" },
  cardIndigo: { fontFamily: "Inter_700Bold", fontSize: 10, color: "#818cf8", marginTop: 2 },
  cardMeta: { fontFamily: "Inter_600SemiBold", fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" },
  cardMeta2: { fontFamily: "Inter_600SemiBold", fontSize: 9, color: "#818cf8", textTransform: "uppercase" },

  // Badges
  activeBadge: { backgroundColor: "#f59e0b30", borderWidth: 0.5, borderColor: "#f59e0b", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  activeBadgeText: { fontFamily: "Inter_700Bold", fontSize: 8, color: "#f59e0b", textTransform: "uppercase" },
  earnedBadge: { backgroundColor: "#6366f130", borderWidth: 0.5, borderColor: "#6366f1", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  earnedBadgeText: { fontFamily: "Inter_700Bold", fontSize: 8, color: "#818cf8", textTransform: "uppercase" },
  ownedBadge: { backgroundColor: "#34d39930", borderWidth: 0.5, borderColor: "#34d399", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  ownedBadgeText: { fontFamily: "Inter_700Bold", fontSize: 8, color: "#34d399", textTransform: "uppercase" },

  // Buttons
  btnPrimary: { backgroundColor: "#f59e0b", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  btnPrimaryText: { fontFamily: "Inter_700Bold", fontSize: 11, color: "#0a0f1e", textTransform: "uppercase" },
  btnDanger: { backgroundColor: "#f8717120", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 0.5, borderColor: "#f87171" },
  btnDangerText: { fontFamily: "Inter_700Bold", fontSize: 11, color: "#f87171", textTransform: "uppercase" },
  btnIndigo: { backgroundColor: "#6366f1", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  btnIndigoText: { fontFamily: "Inter_700Bold", fontSize: 11, color: "#fff", textTransform: "uppercase" },
  btnSecondary: { backgroundColor: "#1e293b", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  btnSecondaryText: { fontFamily: "Inter_700Bold", fontSize: 11, color: "#f8fafc" },
  btnDisabled: { backgroundColor: "#1e293b" },

  // Bottom bar
  bottomBar: { backgroundColor: "#060d1a", paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: "rgba(255,255,255,0.06)", width: "100%" },
  advanceBtn: { borderRadius: 14, overflow: "hidden" },
  advanceBtnGrad: { paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  advanceBtnText: { fontFamily: "Inter_700Bold", fontSize: 12, color: "#0a0f1e", letterSpacing: 1, textTransform: "uppercase" },

  // Log
  sectionLabel: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 2 },
  sectionLabelText: { fontFamily: "Inter_700Bold", fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.5 },
  sectionLabelSub: { fontFamily: "Inter_400Regular", fontSize: 9, color: "rgba(255,255,255,0.25)" },
  logBox: { gap: 6 },
  logItem: { backgroundColor: "#0f172a", borderRadius: 8, padding: 10, borderLeftWidth: 2 },
  logText: { fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.7)", lineHeight: 16 },

  // Toast
  toast: { position: "absolute", left: 16, right: 16, backgroundColor: "#0f172a", borderRadius: 12, padding: 12, borderWidth: 1, zIndex: 99 },
  toastText: { fontFamily: "Inter_600SemiBold", fontSize: 12, textAlign: "center" },
  savingDot: { position: "absolute", right: 50 },

  // Crisis modal
  crisisOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  crisisPanel: { backgroundColor: "#0f172a", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 12, borderTopWidth: 0.5, borderColor: "rgba(255,255,255,0.1)" },
  crisisHandle: { width: 40, height: 4, backgroundColor: "#334155", borderRadius: 2, alignSelf: "center", marginBottom: 4 },
  crisisHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  crisisTagBadge: { backgroundColor: "#f8717120", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  crisisTag: { fontFamily: "Inter_700Bold", fontSize: 9, color: "#f87171", textTransform: "uppercase", letterSpacing: 0.5 },
  crisisTitle: { fontFamily: "Inter_700Bold", fontSize: 17, color: "#f8fafc" },
  crisisDesc: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 20 },
  crisisOption: { backgroundColor: "#1e293b", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)", borderRadius: 14, padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  crisisOptionText: { fontFamily: "Inter_500Medium", fontSize: 13, color: "#f8fafc", flex: 1 },

  // End modal
  endOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.88)", justifyContent: "center", padding: 20 },
  endPanel: { backgroundColor: "#0f172a", borderRadius: 28, padding: 24, gap: 16, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)" },
  endIcon: { width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  endTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: "#f8fafc", textAlign: "center", textTransform: "uppercase", letterSpacing: 2 },
  endSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.5)", textAlign: "center", lineHeight: 18 },
  endGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  endStatCell: { width: "47%", backgroundColor: "#1e293b", borderRadius: 12, padding: 10, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.06)" },
  endStatLabel: { fontFamily: "Inter_600SemiBold", fontSize: 8, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 3 },
  endStatValue: { fontFamily: "Inter_700Bold", fontSize: 12 },
  endAcoin: { backgroundColor: "#f59e0b15", borderRadius: 12, padding: 12, borderWidth: 0.5, borderColor: "#f59e0b40" },
  endAcoinText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#f59e0b", textAlign: "center" },
  endBtn: { padding: 14, borderRadius: 14, alignItems: "center" },
  endBtnText: { fontFamily: "Inter_700Bold", fontSize: 13, textTransform: "uppercase" },

  // Leaderboard
  emptyLb: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyLbText: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center" },
  lbRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#0f172a", borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.06)" },
  lbRank: { fontFamily: "Inter_700Bold", fontSize: 13, color: "#f59e0b", width: 28 },
  lbName: { fontFamily: "Inter_700Bold", fontSize: 13, color: "#f8fafc" },
  lbSub: { fontFamily: "Inter_400Regular", fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 },
  lbScore: { alignItems: "flex-end" },
  lbScoreVal: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#f59e0b" },
  lbScoreLbl: { fontFamily: "Inter_400Regular", fontSize: 8, color: "rgba(255,255,255,0.35)" },
});

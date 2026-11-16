import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const screen = readFileSync(path.join(here, "../app/achievements.tsx"), "utf8");
const migration = readFileSync(
  path.join(here, "../supabase/migrations/20261116000000_idempotent_achievement_rewards.sql"),
  "utf8",
);

function appRewardMap() {
  const rewards = new Map();
  for (const line of screen.split("\n")) {
    const match = line.match(/mk\("([^"]+)".*?"(?:common|rare|epic|legendary)",\s*([\d_]+),/);
    if (match) rewards.set(match[1], Number(match[2].replaceAll("_", "")));
  }
  return rewards;
}

function migrationRewardMap() {
  const rewards = new Map();
  for (const match of migration.matchAll(/\('([^']+)',\s*([\d_]+),\s*(?:true|false|[\s\S]*?)\),/g)) {
    rewards.set(match[1], Number(match[2].replaceAll("_", "")));
  }
  return rewards;
}

test("server reward registry matches every achievement reward shown in the app", () => {
  const appRewards = appRewardMap();
  const serverRewards = migrationRewardMap();

  assert.ok(appRewards.size > 0, "achievement definitions should be parsed");
  assert.deepEqual(
    [...serverRewards].sort(([a], [b]) => a.localeCompare(b)),
    [...appRewards].sort(([a], [b]) => a.localeCompare(b)),
  );
});

test("achievement claims are authenticated, unique, and credited to the XP ledger", () => {
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(migration, /PRIMARY KEY \(user_id, achievement_id\)/);
  assert.match(migration, /ON CONFLICT \(user_id, achievement_id\) DO NOTHING/);
  assert.match(migration, /INSERT INTO public\.xp_activity_log/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.claim_achievement_rewards\(\) FROM PUBLIC, anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.claim_achievement_rewards\(\) TO authenticated/);
});

test("post achievements count posts using their authoritative author_id", () => {
  assert.match(screen, /\.from\("posts"\)[\s\S]*?\.eq\("author_id", userId\)/);
  assert.match(migration, /FROM public\.posts AS post\s+WHERE post\.author_id = v_user_id/);
});

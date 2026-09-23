import type { Context } from "hono";
import type { Env } from "../types";
import { extractBearerToken } from "./auth";
import { getUserWithSupabaseAccessToken, type SupabaseAuthUser } from "./supabase-auth";

export async function getSupabaseUser(c: Context<{ Bindings: Env }>): Promise<SupabaseAuthUser | null> {
  const token = extractBearerToken(c.req.header("Authorization") ?? null);
  if (!token) return null;
  return getUserWithSupabaseAccessToken(c.env, token);
}

export function bearerToken(c: Context<{ Bindings: Env }>): string | null {
  return extractBearerToken(c.req.header("Authorization") ?? null);
}
import { supabase } from "@/lib/supabase";
import { normalizeSearchTerm } from "@/lib/searchNormalization";

export type RankedSearchTerm = {
  term: string;
  score: number;
  growth: number;
  engagementRate: number;
  exactMatch: boolean;
};

export type SearchProfileSuggestion = {
  profile_id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  is_verified: boolean;
  is_organization_verified: boolean;
};

export type SearchSubmissionResult = {
  analytics_enabled: boolean;
  indexed: boolean;
  deduplicated?: boolean;
  rate_limited?: boolean;
};

type CacheEntry<T> = { expiresAt: number; value: T };

const TERM_CACHE_TTL_MS = 8_000;
const PROFILE_CACHE_TTL_MS = 3_000;
const MAX_CACHE_ENTRIES = 128;
const termCache = new Map<string, CacheEntry<RankedSearchTerm[]>>();
const profileCache = new Map<string, CacheEntry<SearchProfileSuggestion[]>>();

function readCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

function writeCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number,
) {
  cache.delete(key);
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

function coreLength(query: string): number {
  return query.replace(/^[#@]+/, "").length;
}

function parseRankedTerms(data: unknown): RankedSearchTerm[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((row: any) => ({
      term: String(row?.term || ""),
      score: Number(row?.score) || 0,
      growth: Number(row?.growth) || 0,
      engagementRate: Number(row?.engagement_rate) || 0,
      exactMatch: Boolean(row?.exact_match),
    }))
    .filter((row) => row.term.length > 0);
}

export async function getRankedSearchSuggestions(
  query: string,
  limit = 6,
  includeSimilar = false,
): Promise<RankedSearchTerm[]> {
  const normalized = normalizeSearchTerm(query);
  if (normalized && coreLength(normalized) < 2) return [];

  const safeLimit = Math.max(1, Math.min(10, Math.floor(limit)));
  const cacheKey = `${normalized}|${safeLimit}|${includeSimilar ? 1 : 0}`;
  const cached = readCache(termCache, cacheKey);
  if (cached) return cached;

  const { data, error } = await supabase.rpc("get_ranked_search_suggestions", {
    p_query: normalized,
    p_limit: safeLimit,
    p_include_similar: includeSimilar,
  });
  if (error) throw error;

  const rows = parseRankedTerms(data);
  writeCache(termCache, cacheKey, rows, TERM_CACHE_TTL_MS);
  return rows;
}

export function getSimilarSearchTerms(
  query: string,
  limit = 10,
): Promise<RankedSearchTerm[]> {
  return getRankedSearchSuggestions(query, limit, true);
}

export async function getSearchProfileSuggestions(
  query: string,
  userId: string | undefined,
  limit = 4,
): Promise<SearchProfileSuggestion[]> {
  if (!userId) return [];

  const normalized = normalizeSearchTerm(query);
  if (!normalized || normalized.startsWith("#") || coreLength(normalized) < 2) return [];

  const safeLimit = Math.max(1, Math.min(8, Math.floor(limit)));
  const cacheKey = `${userId}|${normalized}|${safeLimit}`;
  const cached = readCache(profileCache, cacheKey);
  if (cached) return cached;

  const { data, error } = await supabase.rpc("get_search_profile_suggestions", {
    p_query: normalized,
    p_limit: safeLimit,
  });
  if (error) throw error;

  const rows = Array.isArray(data)
    ? data.map((row: any) => ({
        profile_id: String(row?.profile_id || ""),
        handle: String(row?.handle || ""),
        display_name: String(row?.display_name || ""),
        avatar_url: row?.avatar_url ? String(row.avatar_url) : null,
        is_verified: Boolean(row?.is_verified),
        is_organization_verified: Boolean(row?.is_organization_verified),
      })).filter((row) => row.profile_id && row.handle)
    : [];
  writeCache(profileCache, cacheKey, rows, PROFILE_CACHE_TTL_MS);
  return rows;
}

export async function recordSearchSubmission(
  query: string,
  resultCount: number,
): Promise<SearchSubmissionResult> {
  const { data, error } = await supabase.rpc("record_search_submission", {
    p_query: query,
    p_result_count: Math.max(0, Math.floor(resultCount)),
  });
  if (error) throw error;

  termCache.clear();
  return (data || { analytics_enabled: false, indexed: false }) as SearchSubmissionResult;
}

export async function recordSearchResultEngagement(query: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("record_search_result_engagement", {
    p_query: query,
  });
  if (error) throw error;

  if (data) termCache.clear();
  return data === true;
}


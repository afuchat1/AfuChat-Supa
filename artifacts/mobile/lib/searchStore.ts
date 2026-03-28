import AsyncStorage from "@react-native-async-storage/async-storage";

const HISTORY_KEY = "@afuchat_search_history";
const SAVED_KEY = "@afuchat_saved_searches";
const PINNED_KEY = "@afuchat_pinned_results";

export interface SavedSearch {
  id: string;
  query: string;
  category: string;
  createdAt: string;
}

export interface PinnedResult {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  avatar?: string;
  pinnedAt: string;
  routePath?: string;
}

export async function getSearchHistory(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function addToHistory(term: string): Promise<string[]> {
  const history = await getSearchHistory();
  const filtered = history.filter(h => h.toLowerCase() !== term.toLowerCase());
  const updated = [term, ...filtered].slice(0, 30);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  return updated;
}

export async function removeFromHistory(term: string): Promise<string[]> {
  const history = await getSearchHistory();
  const updated = history.filter(h => h !== term);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  return updated;
}

export async function clearHistory(): Promise<void> {
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify([]));
}

export async function getSavedSearches(): Promise<SavedSearch[]> {
  try {
    const raw = await AsyncStorage.getItem(SAVED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveSearch(query: string, category: string): Promise<SavedSearch[]> {
  const saved = await getSavedSearches();
  if (saved.some(s => s.query.toLowerCase() === query.toLowerCase())) return saved;
  const entry: SavedSearch = {
    id: Date.now().toString(36),
    query,
    category,
    createdAt: new Date().toISOString(),
  };
  const updated = [entry, ...saved].slice(0, 20);
  await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(updated));
  return updated;
}

export async function removeSavedSearch(id: string): Promise<SavedSearch[]> {
  const saved = await getSavedSearches();
  const updated = saved.filter(s => s.id !== id);
  await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(updated));
  return updated;
}

export async function getPinnedResults(): Promise<PinnedResult[]> {
  try {
    const raw = await AsyncStorage.getItem(PINNED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function pinResult(result: Omit<PinnedResult, "pinnedAt">): Promise<PinnedResult[]> {
  const pinned = await getPinnedResults();
  if (pinned.some(p => p.id === result.id && p.type === result.type)) return pinned;
  const entry: PinnedResult = { ...result, pinnedAt: new Date().toISOString() };
  const updated = [entry, ...pinned].slice(0, 50);
  await AsyncStorage.setItem(PINNED_KEY, JSON.stringify(updated));
  return updated;
}

export async function unpinResult(id: string, type: string): Promise<PinnedResult[]> {
  const pinned = await getPinnedResults();
  const updated = pinned.filter(p => !(p.id === id && p.type === type));
  await AsyncStorage.setItem(PINNED_KEY, JSON.stringify(updated));
  return updated;
}

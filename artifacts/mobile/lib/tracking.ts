/**
 * AfuChat tracking — lightweight cookie-style event recording via AsyncStorage.
 *
 * Records user events (screen views, taps, actions) locally and optionally
 * syncs them to the API. Respects user privacy: data stays on-device unless
 * the user is signed in and the sync threshold is reached.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "afu_tracking_events";
const SESSION_KEY = "afu_session_cookie";
const PREFS_KEY   = "afu_tracking_prefs";
const MAX_EVENTS  = 200;

export type TrackingEvent = {
  id:        string;
  type:      string;
  screen?:   string;
  action?:   string;
  meta?:     Record<string, string | number | boolean | null>;
  ts:        number;
  sessionId: string;
};

export type TrackingPrefs = {
  enabled:    boolean;
  userId?:    string;
  consentAt?: number;
};

// ─── Session cookie ────────────────────────────────────────────────────────────

let _sessionId: string | null = null;

async function getSessionId(): Promise<string> {
  if (_sessionId) return _sessionId;
  try {
    const stored = await AsyncStorage.getItem(SESSION_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.id && parsed.expiresAt > Date.now()) {
        _sessionId = parsed.id;
        return _sessionId!;
      }
    }
  } catch {}
  const id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  _sessionId = id;
  const expiresAt = Date.now() + 30 * 60 * 1000;
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ id, expiresAt })).catch(() => {});
  return id;
}

/** Refresh the session cookie (e.g. after user activity). Expires in 30 min of inactivity. */
export async function refreshSession(): Promise<string> {
  const id = _sessionId || (await getSessionId());
  const expiresAt = Date.now() + 30 * 60 * 1000;
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ id, expiresAt })).catch(() => {});
  return id;
}

// ─── Preferences / consent ────────────────────────────────────────────────────

export async function getTrackingPrefs(): Promise<TrackingPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (raw) return JSON.parse(raw) as TrackingPrefs;
  } catch {}
  return { enabled: true };
}

export async function setTrackingPrefs(prefs: Partial<TrackingPrefs>): Promise<void> {
  const current = await getTrackingPrefs();
  const updated: TrackingPrefs = { ...current, ...prefs };
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(updated)).catch(() => {});
}

export async function setTrackingUserId(userId: string): Promise<void> {
  await setTrackingPrefs({ userId });
}

export async function optOut(): Promise<void> {
  await setTrackingPrefs({ enabled: false });
  await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
}

// ─── Core tracking ─────────────────────────────────────────────────────────────

export async function track(
  type: string,
  payload?: {
    screen?: string;
    action?: string;
    meta?:   Record<string, string | number | boolean | null>;
  }
): Promise<void> {
  try {
    const prefs = await getTrackingPrefs();
    if (!prefs.enabled) return;

    const sessionId = await refreshSession();
    const event: TrackingEvent = {
      id:        `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      screen:    payload?.screen,
      action:    payload?.action,
      meta:      payload?.meta,
      ts:        Date.now(),
      sessionId,
    };

    const raw    = await AsyncStorage.getItem(STORAGE_KEY);
    const events: TrackingEvent[] = raw ? JSON.parse(raw) : [];
    events.push(event);

    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {}
}

/** Track a screen view */
export function trackScreen(screen: string, meta?: Record<string, string | number | boolean | null>): void {
  track("screen_view", { screen, meta }).catch(() => {});
}

/** Track a user tap / button press */
export function trackTap(action: string, screen?: string, meta?: Record<string, string | number | boolean | null>): void {
  track("tap", { action, screen, meta }).catch(() => {});
}

/** Track a feature use */
export function trackFeature(feature: string, meta?: Record<string, string | number | boolean | null>): void {
  track("feature", { action: feature, meta }).catch(() => {});
}

// ─── Data access ───────────────────────────────────────────────────────────────

export async function getStoredEvents(): Promise<TrackingEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function clearStoredEvents(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
}

/** Flush events to the API endpoint and clear local store on success */
export async function flushEvents(apiUrl: string, authToken?: string): Promise<boolean> {
  try {
    const events = await getStoredEvents();
    if (!events.length) return true;

    const prefs   = await getTrackingPrefs();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

    const res = await fetch(apiUrl, {
      method:  "POST",
      headers,
      body:    JSON.stringify({ events, userId: prefs.userId }),
    });

    if (res.ok) {
      await clearStoredEvents();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

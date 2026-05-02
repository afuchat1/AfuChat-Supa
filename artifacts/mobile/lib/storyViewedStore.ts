/**
 * Module-level store that tracks which userId story groups have been fully
 * viewed in the current session. StoriesBar subscribes to refresh the ring
 * immediately instead of waiting for the next focusEffect cycle.
 */

const _viewedUserIds = new Set<string>();
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((fn) => fn());
}

export function markStoriesViewed(userId: string): void {
  if (!_viewedUserIds.has(userId)) {
    _viewedUserIds.add(userId);
    notify();
  }
}

export function getViewedUserIds(): ReadonlySet<string> {
  return _viewedUserIds;
}

export function subscribeStoryViewed(fn: () => void): () => void {
  _listeners.add(fn);
  return () => {
    _listeners.delete(fn);
  };
}

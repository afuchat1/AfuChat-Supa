export type StoryUploadState = {
  progress: number;
  caption: string;
  done: boolean;
  failed: boolean;
};

let _state: StoryUploadState | null = null;
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((fn) => fn());
}

export function getStoryUploadState(): StoryUploadState | null {
  return _state;
}

export function subscribeStoryUpload(fn: () => void): () => void {
  _listeners.add(fn);
  return () => {
    _listeners.delete(fn);
  };
}

export function startStoryUpload(caption: string): void {
  _state = { progress: 0.05, caption, done: false, failed: false };
  notify();
}

export function updateStoryProgress(progress: number): void {
  if (!_state) return;
  _state = { ..._state, progress };
  notify();
}

export function finishStoryUpload(): void {
  if (!_state) return;
  _state = { ..._state, progress: 1, done: true };
  notify();
  setTimeout(() => {
    _state = null;
    notify();
  }, 4000);
}

export function failStoryUpload(): void {
  if (!_state) return;
  _state = { ..._state, failed: true };
  notify();
  setTimeout(() => {
    _state = null;
    notify();
  }, 6000);
}

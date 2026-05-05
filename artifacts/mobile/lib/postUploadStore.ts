export type PostUploadType = "video" | "post";

export type PostUploadState = {
  type: PostUploadType;
  progress: number;
  label: string;
  done: boolean;
  failed: boolean;
  errorMessage?: string;
};

let _state: PostUploadState | null = null;
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((fn) => fn());
}

export function getPostUploadState(): PostUploadState | null {
  return _state;
}

export function subscribePostUpload(fn: () => void): () => void {
  _listeners.add(fn);
  return () => {
    _listeners.delete(fn);
  };
}

export function startPostUpload(type: PostUploadType, label: string): void {
  _state = { type, progress: 0.05, label, done: false, failed: false };
  notify();
}

export function updatePostProgress(progress: number): void {
  if (!_state) return;
  _state = { ..._state, progress };
  notify();
}

export function finishPostUpload(): void {
  if (!_state) return;
  _state = { ..._state, progress: 1, done: true };
  notify();
  setTimeout(() => {
    _state = null;
    notify();
  }, 4000);
}

export function failPostUpload(errorMessage?: string): void {
  if (!_state) return;
  _state = { ..._state, failed: true, errorMessage };
  notify();
  setTimeout(() => {
    _state = null;
    notify();
  }, 8000);
}

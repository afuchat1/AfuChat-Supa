export type BrowserNavigationState = {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
};

export type BrowserControls = {
  back: () => void;
  forward: () => void;
  reload: () => void;
  stop: () => void;
};

export type InternalBrowserViewProps = {
  url: string;
  onControlsReady: (controls: BrowserControls | null) => void;
  onNavigationStateChange: (state: BrowserNavigationState) => void;
  onLoadStart: () => void;
  onLoadEnd: () => void;
  onLoadProgress: (progress: number) => void;
  onError: (message: string) => void;
  onOpenWindow: (url: string) => void;
  onExternalScheme: (url: string) => void;
};

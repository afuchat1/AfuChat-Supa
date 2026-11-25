export type BackNavigationAdapter = {
  canGoBack: () => boolean;
  back: () => void;
  replace: (href: string) => void;
};

/**
 * Run the common back behavior used by app back controls:
 * return through the existing stack, otherwise replace with a supplied
 * screen-specific destination. Without an explicit destination, defer to the
 * router's global back handler so it can select the app-wide fallback.
 */
export function performBackNavigation(
  navigation: BackNavigationAdapter,
  fallback?: string,
): void {
  if (navigation.canGoBack()) {
    navigation.back();
    return;
  }

  if (fallback) {
    navigation.replace(fallback);
    return;
  }

  navigation.back();
}

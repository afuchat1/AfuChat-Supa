/**
 * Silent route fallback.
 *
 * Expo Router sends only unresolved URLs here. Registered screens (including
 * dynamic routes) are resolved by the router before this component is used.
 * Never expose a 404 / "Page not found" screen inside AfuChat: send the user
 * directly to the appropriate app entry instead.
 */
import { useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { safeRouter } from "@/lib/navUtils";

export default function NotFoundScreen() {
  const { session, user, loading } = useAuth();
  const redirected = useRef(false);

  useEffect(() => {
    if (redirected.current || loading) return;

    redirected.current = true;
    const isAuthenticated = Boolean(session?.user?.id || user?.id);
    safeRouter.replace(isAuthenticated ? "/(tabs)/chats" : "/welcome");
  }, [loading, session?.user?.id, user?.id]);

  // Keep the unresolved route invisible while the fallback navigation occurs.
  return null;
}

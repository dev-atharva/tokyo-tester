const CLIENT_ID_KEY = "cots_client_id";
const USER_ID_KEY = "cots_user_id";

/**
 * TEMPORARY: Default user for development
 * Replace with actual auth system later
 */
const DEFAULT_DEV_USER_ID = "dev-user-default";

/**
 * Get or create a client ID (device/browser identifier)
 * This is unique per browser/device
 */
export function getOrCreateClientId(): string {
  if (typeof window === "undefined") {
    return "ssr-client-" + Date.now();
  }

  try {
    let clientId = localStorage.getItem(CLIENT_ID_KEY);
    if (!clientId) {
      clientId = `client-${Date.now()}-${crypto.randomUUID()}`;
      localStorage.setItem(CLIENT_ID_KEY, clientId);
      console.log("[ClientID] Generated new client ID:", clientId);
    }
    return clientId;
  } catch (error) {
    console.error("[ClientID] Error accessing localStorage:", error);
    return "fallback-client-" + Date.now();
  }
}

/**
 * Get the user ID
 * For now, returns a default dev user
 * Later: Replace with actual authentication
 */
export function getUserId(): string {
  if (typeof window === "undefined") {
    return DEFAULT_DEV_USER_ID;
  }

  try {
    // Check if there's an authenticated user
    const userId = localStorage.getItem(USER_ID_KEY);
    if (userId) {
      return userId;
    }

    // For development: use default user
    console.warn(
      "[Auth] No authenticated user, using default dev user:",
      DEFAULT_DEV_USER_ID,
    );
    return DEFAULT_DEV_USER_ID;
  } catch (error) {
    console.error("[Auth] Error getting user ID:", error);
    return DEFAULT_DEV_USER_ID;
  }
}

/**
 * Set the authenticated user ID
 * Call this after successful login
 */
export function setUserId(userId: string): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(USER_ID_KEY, userId);
    console.log("[Auth] User authenticated:", userId);
  } catch (error) {
    console.error("[Auth] Error setting user ID:", error);
  }
}

/**
 * Clear authentication (logout)
 */
export function clearAuth(): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(USER_ID_KEY);
    console.log("[Auth] User logged out");
  } catch (error) {
    console.error("[Auth] Error clearing auth:", error);
  }
}

/**
 * Clear client ID (rarely needed)
 */
export function clearClientId(): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(CLIENT_ID_KEY);
    console.log("[ClientID] Client ID cleared");
  } catch (error) {
    console.error("[ClientID] Error clearing client ID:", error);
  }
}

/**
 * Get current client ID without creating
 */
export function getClientId(): string | null {
  if (typeof window === "undefined") return null;

  try {
    return localStorage.getItem(CLIENT_ID_KEY);
  } catch (error) {
    return null;
  }
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  const userId = getUserId();
  return userId !== DEFAULT_DEV_USER_ID;
}

/**
 * Get authentication info for debugging
 */
export function getAuthInfo() {
  return {
    userId: getUserId(),
    clientId: getOrCreateClientId(),
    isAuthenticated: isAuthenticated(),
    isDevMode: getUserId() === DEFAULT_DEV_USER_ID,
  };
}

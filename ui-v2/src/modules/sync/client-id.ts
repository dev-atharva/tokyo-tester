import {
  getCurrentSessionUserId,
  setCurrentSessionUserId,
} from "@/modules/auth/session-user";

const CLIENT_ID_KEY = "cots_client_id";
const USER_ID_KEY = "cots_user_id";

/**
 * Get or create a client ID (device/browser identifier)
 * This is unique per browser/device
 */
export function getOrCreateClientId(): string {
  if (typeof window === "undefined") {
    return `ssr-client-${Date.now()}`;
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
    return `fallback-client-${Date.now()}`;
  }
}

/**
 * Get the user ID
 */
export function getUserId(): string {
  const sessionUserId = getCurrentSessionUserId();
  if (sessionUserId) {
    return sessionUserId;
  }

  try {
    const userId = localStorage.getItem(USER_ID_KEY);
    if (userId) {
      return userId;
    }
  } catch (error) {
    console.error("[Auth] Error getting user ID:", error);
  }

  throw new Error("No authenticated session user is available.");
}

/**
 * Set the authenticated user ID
 * Call this after successful login
 */
export function setUserId(userId: string): void {
  setCurrentSessionUserId(userId);
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
  setCurrentSessionUserId(null);
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
  } catch (_error) {
    return null;
  }
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return Boolean(getCurrentSessionUserId());
}

/**
 * Get authentication info for debugging
 */
export function getAuthInfo() {
  return {
    userId: getCurrentSessionUserId(),
    clientId: getOrCreateClientId(),
    isAuthenticated: isAuthenticated(),
  };
}

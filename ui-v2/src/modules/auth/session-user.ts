let currentUserId: string | null = null;

export function setCurrentSessionUserId(userId: string | null) {
  currentUserId = userId;
}

export function getCurrentSessionUserId() {
  return currentUserId;
}

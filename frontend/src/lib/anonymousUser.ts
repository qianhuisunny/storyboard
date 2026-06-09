const ANONYMOUS_USER_STORAGE_KEY = "plotline.anonymousUserId";

function createAnonymousUserId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `anon_${crypto.randomUUID()}`;
  }
  return `anon_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getAnonymousUserId(): string {
  if (typeof window === "undefined") {
    return "anonymous";
  }

  const existing = window.localStorage.getItem(ANONYMOUS_USER_STORAGE_KEY);
  if (existing) return existing;

  const nextId = createAnonymousUserId();
  window.localStorage.setItem(ANONYMOUS_USER_STORAGE_KEY, nextId);
  return nextId;
}


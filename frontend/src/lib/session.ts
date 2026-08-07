import { getAnonymousUserId } from "@/lib/anonymousUser";

let activeSessionRequest: Promise<void> | null = null;

async function establish(fetchImpl: typeof fetch): Promise<void> {
  const legacyUserId = getAnonymousUserId();
  const legacyBootstrap = /^anon_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(legacyUserId)
    ? legacyUserId
    : undefined;
  const options: RequestInit = {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ legacy_user_id: legacyBootstrap }),
  };
  let response = await fetchImpl("/api/session", options);
  if (response.status === 409 && legacyBootstrap) {
    response = await fetchImpl("/api/session", {
      ...options,
      body: JSON.stringify({}),
    });
  }
  if (!response.ok) throw new Error("Could not establish a secure browser session.");
}

export function ensureSession(fetchImpl: typeof fetch = fetch): Promise<void> {
  if (fetchImpl !== fetch) return establish(fetchImpl);
  if (!activeSessionRequest) {
    activeSessionRequest = establish(fetchImpl).catch((error) => {
      activeSessionRequest = null;
      throw error;
    });
  }
  return activeSessionRequest;
}

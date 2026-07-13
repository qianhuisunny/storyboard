import type { ChatMessage } from "./types";
import type { BriefField } from "../BriefBuilder/types";

export interface ChatBriefRequestPayload {
  messages: Array<Pick<ChatMessage, "role" | "content" | "fieldKey">>;
  fields_so_far: Record<string, BriefField>;
  onboarding: {
    topic: string;
    duration: number;
    audience: string;
    intent_route: string | null;
    content_mode: string;
    source_context: string;
  };
}

export function requestChatBrief(
  projectId: string,
  userId: string,
  payload: ChatBriefRequestPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  return fetchImpl(`/api/project/${projectId}/chat-brief`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-ID": userId,
    },
    body: JSON.stringify(payload),
  });
}

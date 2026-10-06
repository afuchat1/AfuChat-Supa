/**
 * engagera.ts — Lazy singleton for the Engagera AI client.
 *
 * Provider credentials stay in the Cloudflare Worker. The mobile client calls
 * only the AfuAI application API.
 */
import { AFUAI_API_URL } from "@/lib/env";
import { getAfuChatAccessToken } from "@/lib/afuchatApi";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
type ChatOptions = { messages: ChatMessage[]; model?: string; stream?: boolean };
type EngageraClient = {
  chat: { create: (options: ChatOptions) => Promise<{ content: string }> };
};

let _client: EngageraClient | null = null;

/**
 * Returns the shared Engagera client (synchronous after first call).
 */
export function getEngagera(): EngageraClient {
  if (!_client) {
    _client = {
      chat: {
        create: async ({ messages, model = "engagera-pro", stream = false }) => {
          const token = await getAfuChatAccessToken();
          const response = await fetch(`${AFUAI_API_URL}/v1/ai/chat`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ messages, model, stream }),
          });
          if (!response.ok) throw new Error(`Engagera request failed (${response.status})`);
          const data = await response.json();
          return { content: data?.message?.content ?? data?.content ?? "" };
        },
      },
    };
  }
  return _client;
}

/**
 * engagera.ts — Lazy singleton for the Engagera AI client.
 *
 * Provider credentials stay in the Cloudflare Worker. The mobile client calls
 * only the AfuCloud application API.
 */
import { AFUCLOUD_API_URL } from "@/lib/env";

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
          const response = await fetch(`${AFUCLOUD_API_URL}/v1/ai/chat`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
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

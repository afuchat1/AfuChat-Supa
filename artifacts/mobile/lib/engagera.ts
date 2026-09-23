/**
 * engagera.ts — Lazy singleton for the Engagera AI client.
 *
 * The API key is read from EXPO_PUBLIC_ENGAGERA_API_KEY (env) with a hardcoded
 * fallback, matching the same public-key pattern used for SUPABASE_ANON_KEY.
 * The key only authorises calls to this project's own /chat edge function, so
 * it is safe to ship in the client bundle (the edge function owns rate-limiting).
 */
import { AFUCLOUD_API_URL, ENGAGERA_API_KEY } from "@/lib/env";

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
    if (!ENGAGERA_API_KEY) throw new Error("ENGAGERA_API_KEY is not configured");
    _client = {
      chat: {
        create: async ({ messages, model = "engagera-pro", stream = false }) => {
          const response = await fetch(`${AFUCLOUD_API_URL}/functions/v1/chat`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-engagera-api-key": ENGAGERA_API_KEY,
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

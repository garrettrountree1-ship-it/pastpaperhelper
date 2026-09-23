import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenAI } from "@ai-sdk/openai";

/**
 * AI provider plumbing. Server-only.
 *
 * Every AI feature in the app runs on the Lovable AI Gateway.
 */

const LOVABLE_MODEL = "openai/gpt-6-astra";

/**
 * Cheap, fast model for the many small helper jobs (word glossaries, vocabulary
 * lists, note summaries, photo authenticity, AI-writing screening). Marking,
 * tutoring and paper extraction stay on the flagship model above.
 */
const FAST_MODEL = "google/gemini-3.8-flash";

/** Back-compat alias used across the marking/extraction code. */
export const TUTOR_MODEL = LOVABLE_MODEL;

/** The model id to send on raw chat-completions calls. */
export function chatModelId() {
  return LOVABLE_MODEL;
}

export function aiApiKey() {
  const key = process.env["LOVABLE_API_KEY"] || "";
  if (!key) throw new Error("AI is not configured yet. Missing LOVABLE_API_KEY.");
  return key;
}

/** Endpoint + headers + model for a raw chat-completions request. */
export function chatRequest() {
  return {
    url: "https://ai.gateway.lovable.dev/v1/chat/completions",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": aiApiKey(),
    } as Record<string, string>,
    model: LOVABLE_MODEL,
  };
}

/** POST a chat-completions body (without `model`) to the Lovable AI Gateway. */
export async function postChatCompletion(
  body: Record<string, unknown>,
): Promise<{ response: Response; detail: string }> {
  const primary = chatRequest();
  const response = await fetch(primary.url, {
    method: "POST",
    headers: primary.headers,
    // The flagship model always reasons; "low" keeps examiner accuracy while
    // cutting the billed thinking tokens roughly in half.
    body: JSON.stringify({ reasoning_effort: "low", ...body, model: primary.model }),
  });
  if (response.ok) return { response, detail: "" };
  return { response, detail: await response.text() };
}

/** Endpoint + headers for a raw audio-transcription request. */
export function transcriptionRequest() {
  return {
    url: "https://ai.gateway.lovable.dev/v1/audio/transcriptions",
    headers: { Authorization: `Bearer ${aiApiKey()}` } as Record<string, string>,
    model: "openai/gpt-4o-transcribe",
  };
}

export function createLovableAiGatewayProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "lovable-ai-gateway",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: { "Lovable-API-Key": apiKey },
  });
}

/** The AI SDK model marking-grade features use. */
export function gatewayModel() {
  return createLovableAiGatewayProvider(aiApiKey())(LOVABLE_MODEL);
}

/** Low-cost AI SDK model for high-volume helper features. */
export function fastModel() {
  return createLovableAiGatewayProvider(aiApiKey())(FAST_MODEL);
}

/** Reasoning-style provider for the streaming tutor paths. */
export function gatewayResponsesModel() {
  const key = aiApiKey();
  return createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey: key,
    headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  }).responses(LOVABLE_MODEL);
}

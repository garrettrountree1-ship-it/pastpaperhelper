import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenAI } from "@ai-sdk/openai";

/**
 * AI provider plumbing. Server-only.
 *
 * When the app owner's own OpenAI key is stored (OPENAI_API_KEY), every AI call
 * goes straight to OpenAI and bills their OpenAI account. Otherwise the calls
 * fall back to the Lovable AI Gateway.
 */

/** Vision-capable OpenAI model: marking reads photos of student work. */
export const OPENAI_MODEL = "gpt-4o";
const LOVABLE_MODEL = "openai/gpt-6-astra";

function ownKey() {
  return process.env["OPENAI_API_KEY"] || "";
}

function lovableKey() {
  return process.env["LOVABLE_API_KEY"] || "";
}

export function usingOwnOpenAi() {
  return ownKey().length > 0;
}

/** The model id to send on raw chat-completions calls. */
export function chatModelId() {
  return usingOwnOpenAi() ? OPENAI_MODEL : LOVABLE_MODEL;
}

/** Back-compat alias used across the marking/extraction code. */
export const TUTOR_MODEL = LOVABLE_MODEL;

export function aiApiKey() {
  const key = ownKey() || lovableKey();
  if (!key) throw new Error("AI is not configured yet. Missing OPENAI_API_KEY.");
  return key;
}

/** Endpoint + headers + model for a raw chat-completions request. */
export function chatRequest() {
  if (usingOwnOpenAi()) {
    return {
      url: "https://api.openai.com/v1/chat/completions",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownKey()}`,
      } as Record<string, string>,
      model: OPENAI_MODEL,
    };
  }
  return {
    url: "https://ai.gateway.lovable.dev/v1/chat/completions",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": aiApiKey(),
    } as Record<string, string>,
    model: LOVABLE_MODEL,
  };
}

/** Endpoint + headers for a raw audio-transcription request. */
export function transcriptionRequest() {
  if (usingOwnOpenAi()) {
    return {
      url: "https://api.openai.com/v1/audio/transcriptions",
      headers: { Authorization: `Bearer ${ownKey()}` } as Record<string, string>,
      model: "gpt-4o-transcribe",
    };
  }
  return {
    url: "https://ai.gateway.lovable.dev/v1/audio/transcriptions",
    headers: { Authorization: `Bearer ${aiApiKey()}` } as Record<string, string>,
    model: "openai/gpt-4o-transcribe",
  };
}

/**
 * Lovable AI Gateway provider (used only when no own OpenAI key is stored).
 */
export function createLovableAiGatewayProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "lovable-ai-gateway",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: { "Lovable-API-Key": apiKey },
  });
}

/** The AI SDK model every text/vision feature uses. */
export function gatewayModel() {
  if (usingOwnOpenAi()) {
    return createOpenAI({ apiKey: ownKey() })(OPENAI_MODEL);
  }
  return createLovableAiGatewayProvider(aiApiKey())(LOVABLE_MODEL);
}

/** Reasoning-style provider for the streaming tutor paths. */
export function gatewayResponsesModel() {
  if (usingOwnOpenAi()) {
    return createOpenAI({ apiKey: ownKey() }).responses(OPENAI_MODEL);
  }
  const key = aiApiKey();
  return createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey: key,
    headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  }).responses(LOVABLE_MODEL);
}

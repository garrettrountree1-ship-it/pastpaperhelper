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

/**
 * OpenAI refuses requests coming from some countries/regions with a 403
 * ("unsupported_country_region_territory"). The server handling a request runs
 * close to the user, so a student in a blocked region would otherwise never be
 * able to get marked. In that case we transparently retry the same request
 * through the Lovable AI Gateway so the lesson keeps working.
 */
function isRegionBlocked(status: number, detail: string) {
  return (
    status === 403 &&
    /unsupported_country_region_territory|country, region, or territory/i.test(detail)
  );
}

function lovableChatRequest() {
  return {
    url: "https://ai.gateway.lovable.dev/v1/chat/completions",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": lovableKey(),
    } as Record<string, string>,
    model: LOVABLE_MODEL,
  };
}

/**
 * POST a chat-completions body (without `model`) to the configured provider,
 * falling back to the Lovable gateway when OpenAI blocks the server's region.
 */
export async function postChatCompletion(
  body: Record<string, unknown>,
): Promise<{ response: Response; detail: string }> {
  const primary = chatRequest();
  let response = await fetch(primary.url, {
    method: "POST",
    headers: primary.headers,
    body: JSON.stringify({ ...body, model: primary.model }),
  });
  if (response.ok) return { response, detail: "" };

  let detail = await response.text();
  if (usingOwnOpenAi() && lovableKey() && isRegionBlocked(response.status, detail)) {
    console.warn("OpenAI blocked this region; retrying through the Lovable AI Gateway");
    const fallback = lovableChatRequest();
    response = await fetch(fallback.url, {
      method: "POST",
      headers: fallback.headers,
      body: JSON.stringify({ ...body, model: fallback.model }),
    });
    if (response.ok) return { response, detail: "" };
    detail = await response.text();
  }
  return { response, detail };
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

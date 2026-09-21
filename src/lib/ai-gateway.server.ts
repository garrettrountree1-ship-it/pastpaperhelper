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

/**
 * Optional OpenAI-compatible relay in a region OpenAI permits (e.g. a small
 * worker/server the owner runs in the US or Singapore). When set, every OpenAI
 * call goes there instead of api.openai.com, and the Lovable credit fallback is
 * switched off entirely. Value should be an origin ending in /v1.
 */
function openAiBaseUrl() {
  const raw = (process.env["OPENAI_BASE_URL"] || "").trim().replace(/\/+$/, "");
  return raw || "https://api.openai.com/v1";
}

/**
 * Optional extra relays (comma separated) tried in order when the first one
 * reports that OpenAI refuses its region.
 */
function extraOpenAiBaseUrls() {
  return (process.env["OPENAI_BASE_URL_FALLBACK"] || "")
    .split(",")
    .map((value) => value.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function openAiBaseUrls() {
  return [openAiBaseUrl(), ...extraOpenAiBaseUrls()];
}

function usingRelay() {
  return openAiBaseUrl() !== "https://api.openai.com/v1";
}


/** Lovable credits are only spent when there is no relay configured. */
function fallbackAllowed() {
  return !usingRelay() && lovableKey().length > 0;
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
  if (usingOwnOpenAi()) {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ownKey()}`,
    } as Record<string, string>;
    const payload = JSON.stringify({ ...body, model: OPENAI_MODEL });
    let lastResponse: Response | null = null;
    let lastDetail = "";
    for (const base of openAiBaseUrls()) {
      const response = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers,
        body: payload,
      });
      if (response.ok) return { response, detail: "" };
      const detail = await response.text();
      lastResponse = response;
      lastDetail = detail;
      if (!isRegionBlocked(response.status, detail)) break;
      console.warn(`OpenAI refused the region of relay ${base}`);
    }
    if (lastResponse && fallbackAllowed() && isRegionBlocked(lastResponse.status, lastDetail)) {
      console.warn("OpenAI blocked this region; retrying through the Lovable AI Gateway");
      const fallback = lovableChatRequest();
      const response = await fetch(fallback.url, {
        method: "POST",
        headers: fallback.headers,
        body: JSON.stringify({ ...body, model: fallback.model }),
      });
      if (response.ok) return { response, detail: "" };
      return { response, detail: await response.text() };
    }
    return { response: lastResponse!, detail: lastDetail };
  }

  const primary = chatRequest();
  const response = await fetch(primary.url, {
    method: "POST",
    headers: primary.headers,
    body: JSON.stringify({ ...body, model: primary.model }),
  });
  if (response.ok) return { response, detail: "" };
  return { response, detail: await response.text() };
}


/** Endpoint + headers + model for a raw chat-completions request. */
export function chatRequest() {
  if (usingOwnOpenAi()) {
    return {
      url: `${openAiBaseUrl()}/chat/completions`,
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
      url: `${openAiBaseUrl()}/audio/transcriptions`,
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

/**
 * `fetch` for the OpenAI provider that transparently re-sends a request through
 * the Lovable AI Gateway when OpenAI refuses the server's region (403).
 */
function openAiFetchWithGatewayFallback(): typeof fetch {
  return async (input, init) => {
    let response = await fetch(input as RequestInfo, init);
    if (response.ok || response.status !== 403) return response;

    let detail = await response.clone().text();
    if (!isRegionBlocked(response.status, detail)) return response;

    // Try any additional relays the owner configured.
    const requestedUrl = new URL(input instanceof Request ? input.url : String(input));
    for (const base of extraOpenAiBaseUrls()) {
      const next = new URL(base);
      const target = `${next.origin}${next.pathname.replace(/\/+$/, "")}${requestedUrl.pathname.replace(/^\/v1/, "")}${requestedUrl.search}`;
      response = await fetch(target, init);
      if (response.ok) return response;
      detail = await response.clone().text();
      if (!isRegionBlocked(response.status, detail)) return response;
    }
    if (!fallbackAllowed()) return response;



    console.warn("OpenAI blocked this region; retrying through the Lovable AI Gateway");
    let body = init?.body;
    if (typeof body === "string") {
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        parsed["model"] = LOVABLE_MODEL;
        body = JSON.stringify(parsed);
      } catch {
        /* keep the original body */
      }
    }
    const headers = new Headers(init?.headers);
    headers.delete("authorization");
    headers.set("Lovable-API-Key", lovableKey());
    const path = requestedUrl.pathname.replace(/^\/v1/, "");

    return fetch(`https://ai.gateway.lovable.dev/v1${path}`, {
      ...init,
      headers,
      body: body ?? null,
    });
  };
}

/** The AI SDK model every text/vision feature uses. */
export function gatewayModel() {
  if (usingOwnOpenAi()) {
    return createOpenAI({
      apiKey: ownKey(),
      baseURL: openAiBaseUrl(),
      fetch: openAiFetchWithGatewayFallback(),
    })(OPENAI_MODEL);
  }
  return createLovableAiGatewayProvider(aiApiKey())(LOVABLE_MODEL);
}

/** Reasoning-style provider for the streaming tutor paths. */
export function gatewayResponsesModel() {
  if (usingOwnOpenAi()) {
    return createOpenAI({ apiKey: ownKey(), baseURL: openAiBaseUrl() }).responses(
      OPENAI_MODEL,
    );
  }
  const key = aiApiKey();
  return createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey: key,
    headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  }).responses(LOVABLE_MODEL);
}


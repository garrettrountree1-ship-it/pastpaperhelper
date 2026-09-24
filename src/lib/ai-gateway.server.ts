import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * AI provider plumbing. Server-only.
 *
 * When DEEPSEEK_API_KEY is set, every chat/vision call goes to DeepSeek
 * (deepseek-flash, vision-capable). If DeepSeek fails, the same request is
 * retried once on the Lovable AI Gateway so nothing breaks. Transcription
 * always stays on Lovable (DeepSeek has no audio endpoint).
 */

const LOVABLE_MODEL = "google/gemini-3.8-flash";
const FAST_MODEL = "google/gemini-3.8-flash";
const DEEPSEEK_MODEL = "deepseek-flash";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const LOVABLE_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

/** Back-compat alias used across the marking/extraction code. */
export const TUTOR_MODEL = LOVABLE_MODEL;

export function chatModelId() {
  return deepseekKey() ? DEEPSEEK_MODEL : LOVABLE_MODEL;
}

function deepseekKey() {
  return process.env["DEEPSEEK_API_KEY"] || "";
}

export function aiApiKey() {
  const key = process.env["LOVABLE_API_KEY"] || "";
  if (!key) throw new Error("AI is not configured yet. Missing LOVABLE_API_KEY.");
  return key;
}

/** Endpoint + headers + model for a raw Lovable chat-completions request. */
export function chatRequest() {
  return {
    url: LOVABLE_URL,
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": aiApiKey(),
    } as Record<string, string>,
    model: LOVABLE_MODEL,
  };
}

/** DeepSeek cannot always download signed URLs, so inline images as base64. */
async function inlineImage(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image download ${res.status}`);
  const type = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${type};base64,${btoa(binary)}`;
}

/** Rewrite a chat-completions body (Lovable shape) into DeepSeek's shape. */
async function toDeepseekBody(body: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...body, model: DEEPSEEK_MODEL };
  const effort = out["reasoning_effort"];
  if (effort === "medium" || effort === "xhigh") out["reasoning_effort"] = "high";
  else if (effort && effort !== "low" && effort !== "high" && effort !== "max")
    out["reasoning_effort"] = "low";
  if (!out["reasoning_effort"]) out["reasoning_effort"] = "low";
  if (out["max_completion_tokens"] != null) {
    out["max_tokens"] = out["max_completion_tokens"];
    delete out["max_completion_tokens"];
  }
  const messages = Array.isArray(out["messages"]) ? (out["messages"] as any[]) : [];
  out["messages"] = await Promise.all(
    messages.map(async (m) => {
      if (!Array.isArray(m?.content)) return m;
      const content = await Promise.all(
        m.content.map(async (part: any) => {
          if (part?.type !== "image_url") return part;
          const url = typeof part.image_url === "string" ? part.image_url : part.image_url?.url;
          return { type: "image_url", image_url: { url: await inlineImage(url) } };
        }),
      );
      return { ...m, content };
    }),
  );
  return out;
}

async function callDeepseek(body: Record<string, unknown>): Promise<Response | null> {
  const key = deepseekKey();
  if (!key) return null;
  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(await toDeepseekBody(body)),
    });
    if (res.ok) return res;
    console.error("DeepSeek failed, falling back to Lovable AI", res.status, (await res.text()).slice(0, 300));
  } catch (error) {
    console.error("DeepSeek error, falling back to Lovable AI", error);
  }
  return null;
}

/** POST a chat-completions body (without `model`): DeepSeek first, Lovable fallback. */
export async function postChatCompletion(
  body: Record<string, unknown>,
  options: { fast?: boolean } = {},
): Promise<{ response: Response; detail: string }> {
  const merged = { reasoning_effort: "low", ...body };
  const ds = await callDeepseek(merged);
  if (ds) return { response: ds, detail: "" };
  const primary = chatRequest();
  const model = options.fast ? FAST_MODEL : primary.model;
  const response = await fetch(primary.url, {
    method: "POST",
    headers: primary.headers,
    body: JSON.stringify({ ...merged, model }),
  });
  if (response.ok) return { response, detail: "" };
  return { response, detail: await response.text() };
}

/** Endpoint + headers for a raw audio-transcription request (always Lovable). */
export function transcriptionRequest() {
  return {
    url: "https://ai.gateway.lovable.dev/v1/audio/transcriptions",
    headers: { Authorization: `Bearer ${aiApiKey()}` } as Record<string, string>,
    model: "openai/gpt-4o-transcribe",
  };
}

/**
 * fetch used by the AI SDK: sends chat calls to DeepSeek first and replays the
 * untouched request on the Lovable gateway if DeepSeek fails.
 */
const routedFetch: typeof fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.endsWith("/chat/completions") && typeof init?.body === "string") {
    try {
      const ds = await callDeepseek(JSON.parse(init.body));
      if (ds) return ds;
    } catch {
      /* fall through to Lovable */
    }
  }
  return fetch(input, init);
};

export function createLovableAiGatewayProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "lovable-ai-gateway",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: { "Lovable-API-Key": apiKey },
    fetch: routedFetch,
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

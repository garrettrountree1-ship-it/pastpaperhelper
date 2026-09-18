import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenAI } from "@ai-sdk/openai";

/**
 * Lovable AI Gateway provider. Server-only.
 */
export function createLovableAiGatewayProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "lovable-ai-gateway",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: { "Lovable-API-Key": apiKey },
  });
}

export const TUTOR_MODEL = "google/gemini-3.7-flash";

export function gatewayModel() {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured yet. Missing LOVABLE_API_KEY.");
  return createLovableAiGatewayProvider(key)(TUTOR_MODEL);
}

/** Default reasoning model for new or updated text and vision calls. */
export function gatewayResponsesModel() {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured yet. Missing LOVABLE_API_KEY.");
  const gateway = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey: key,
    headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
  return gateway.responses("openai/gpt-6-astra");
}

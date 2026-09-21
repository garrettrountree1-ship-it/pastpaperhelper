import { transcriptionRequest } from "./ai-gateway.server";

/** Speech-to-text for lesson voice notes. */
export async function transcribeWav(base64: string) {
  const { url, headers, model } = transcriptionRequest();

  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  if (bytes.length < 2048) throw new Error("That recording was empty — please try again.");

  const form = new FormData();
  form.append("model", model);
  form.append("file", new Blob([bytes], { type: "audio/wav" }), "recording.wav");

  const response = await fetch(url, { method: "POST", headers, body: form });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Transcription failed (${response.status}). ${detail.slice(0, 300)}`);
  }
  const result = (await response.json()) as { text?: string };
  return (result.text ?? "").trim();
}

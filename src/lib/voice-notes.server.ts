/** Speech-to-text for lesson voice notes, via the Lovable AI Gateway. */
export async function transcribeWav(base64: string) {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured yet. Missing LOVABLE_API_KEY.");

  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  if (bytes.length < 2048) throw new Error("That recording was empty — please try again.");

  const form = new FormData();
  form.append("model", "openai/gpt-4o-transcribe");
  form.append("file", new Blob([bytes], { type: "audio/wav" }), "recording.wav");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Transcription failed (${response.status}). ${detail.slice(0, 300)}`);
  }
  const result = (await response.json()) as { text?: string };
  return (result.text ?? "").trim();
}

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Converts a teacher's Word upload into a PDF so the pages that are cut for
 * homework are exactly what Word prints — no rebuilt text, no changed symbols.
 */
export const convertDocxToPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ filename: z.string().min(1), base64: z.string().min(1) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { getConnectionKeyForUser } = await import("@/lib/app-user-connections.server");
    const ownDriveKey = await getConnectionKeyForUser(userId, "google_drive");

    const binary = atob(data.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

    const { docxToPdf } = await import("@/lib/docx-pdf.server");
    const pdf = await docxToPdf(bytes.buffer as ArrayBuffer, data.filename, ownDriveKey);

    let out = "";
    const view = new Uint8Array(pdf);
    for (let i = 0; i < view.length; i += 0x8000) {
      out += String.fromCharCode(...view.subarray(i, i + 0x8000));
    }
    return { base64: btoa(out) };
  });

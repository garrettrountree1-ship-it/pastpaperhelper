import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertMaterialTeacher } from "@/lib/materials.server";

/**
 * The exact slide pages, stored next to the original file so the conversion
 * happens once and everyone afterwards just downloads the finished pages.
 */
const SLIDES_VERSION = "v1";
const slidesPdfPath = (storagePath: string) => `${storagePath}.slides-${SLIDES_VERSION}.pdf`;

const input = (raw: unknown) => z.object({ materialId: z.string().uuid() }).parse(raw);

/** Signed link to the faithful slide pages, or null when they aren't ready yet. */
export const getSlidePdfUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: material } = await supabase
      .from("unit_materials")
      .select("storage_path")
      .eq("id", data.materialId)
      .maybeSingle();
    if (!material?.storage_path) return { url: null };

    // No stored pages yet simply means nobody has converted this deck.
    const { data: signed } = await supabase.storage
      .from("class-materials")
      .createSignedUrl(slidesPdfPath(material.storage_path), 60 * 30);
    return { url: signed?.signedUrl ?? null };
  });

/**
 * Teacher-only: converts the uploaded PowerPoint into faithful pages once and
 * stores them, then returns a link to read them.
 */
export const prepareSlidePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMaterialTeacher(supabase, data.materialId, userId);

    const { data: material } = await supabase
      .from("unit_materials")
      .select("storage_path, file_name")
      .eq("id", data.materialId)
      .maybeSingle();
    if (!material?.storage_path) throw new Error("This resource has no stored file.");

    const { data: file, error: downloadError } = await supabase.storage
      .from("class-materials")
      .download(material.storage_path);
    if (downloadError || !file) {
      throw new Error(downloadError?.message ?? "Could not read the original file.");
    }

    // Use the teacher's own linked Google account when they have one.
    const { getConnectionKeyForUser } = await import("@/lib/app-user-connections.server");
    const ownDriveKey = await getConnectionKeyForUser(userId, "google_drive");

    const { pptxToPdf } = await import("@/lib/slide-pdf.server");
    const pdf = await pptxToPdf(
      await file.arrayBuffer(),
      material.file_name ?? "presentation.pptx",
      ownDriveKey,
    );


    const path = slidesPdfPath(material.storage_path);
    const { error: uploadError } = await supabase.storage
      .from("class-materials")
      .upload(path, new Blob([pdf], { type: "application/pdf" }), { contentType: "application/pdf", upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    const { data: signed } = await supabase.storage
      .from("class-materials")
      .createSignedUrl(path, 60 * 30);
    return { url: signed?.signedUrl ?? null };
  });

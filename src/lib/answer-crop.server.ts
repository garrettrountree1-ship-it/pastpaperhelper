import { questionLabel } from "./question-label";

type QuestionRow = {
  id: string;
  position: number;
  question_text: string | null;
  mark_scheme: string | null;
  image_paths: string[] | null;
  answer_image_paths: string[] | null;
};

type PageFile = { filename: string; mimeType: string; base64: string };

const pageCache = new Map<string, PageFile[]>();

async function loadAnswerPages(folder: string): Promise<{ files: PageFile[]; names: string[] }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin;
  const { data: stored } = await db.storage
    .from("paper-pages")
    .list(folder, { limit: 200, sortBy: { column: "name", order: "asc" } });
  const images = (stored ?? []).filter((file) => /\.(?:jpe?g|png)$/i.test(file.name));
  const answerFiles = images.some((file) => file.name.startsWith("ms-page-"))
    ? images.filter((file) => file.name.startsWith("ms-page-"))
    : images;
  const names = answerFiles.map((file) => file.name);
  const cacheKey = `${folder}|${names.join(",")}`;
  const cached = pageCache.get(cacheKey);
  if (cached) return { files: cached, names };
  const files = (
    await Promise.all(
      answerFiles.map(async (file) => {
        const { data: blob } = await db.storage
          .from("paper-pages")
          .download(`${folder}/${file.name}`);
        if (!blob) return null;
        return {
          filename: file.name,
          mimeType: blob.type || "image/jpeg",
          base64: Buffer.from(await blob.arrayBuffer()).toString("base64"),
        } satisfies PageFile;
      }),
    )
  ).filter((page): page is PageFile => Boolean(page));
  if (files.length > 0) pageCache.set(cacheKey, files);
  return { files, names };
}

/**
 * Finds and stores the exact printed mark-scheme cut for one question when it
 * was never saved at extraction time. Returns the stored crop paths, or an
 * empty list when no safe cut could be located (never a whole page or text).
 */
export async function recoverAnswerCrops(question: QuestionRow): Promise<string[]> {
  const existing = (question.answer_image_paths ?? []).filter(Boolean);
  if (existing.length > 0) return existing;
  try {
    const firstQuestionPath = (question.image_paths ?? [])[0]?.split("#")[0];
    const folder = firstQuestionPath?.split("/").slice(0, -1).join("/");
    if (!folder) return [];
    const { files, names } = await loadAnswerPages(folder);
    if (files.length === 0) return [];
    const { locateAnswerCrop } = await import("./paper-extract.server");
    const crops = await locateAnswerCrop({
      label: questionLabel(question.question_text ?? "", Math.max(0, question.position - 1)),
      questionText: question.question_text ?? "",
      markScheme: question.mark_scheme ?? "",
      pages: files,
    });
    const paths = (crops ?? [])
      .map((crop) => {
        const name = names[crop.page - 1];
        return name
          ? `${folder}/${name}#crop=${crop.top.toFixed(4)},${crop.bottom.toFixed(4)}`
          : "";
      })
      .filter(Boolean);
    if (paths.length === 0) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("questions")
      .update({ answer_image_paths: paths })
      .eq("id", question.id);
    return paths;
  } catch {
    // Fail closed: never substitute text or a whole page for an exact answer cut.
    return [];
  }
}

/** Recovers missing answer cuts for every released question, in parallel. */
export async function recoverAnswerCropsFor(
  questions: QuestionRow[],
): Promise<Map<string, string[]>> {
  const entries = await Promise.all(
    questions.map(async (q) => [q.id, await recoverAnswerCrops(q)] as const),
  );
  return new Map(entries);
}

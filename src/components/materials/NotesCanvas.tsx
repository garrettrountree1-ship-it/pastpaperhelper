import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImagePlus, PenLine, Plus, RefreshCw, Sparkles, Trash2, Type } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { DrawingPad } from "@/components/assignments/DrawingPad";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  generateSectionSummary,
  saveSectionNotes,
  signNotePaths,
  type NoteBlock,
} from "@/lib/notes.functions";

/** Words in read-only notes are clickable so the tutor can explain a concept. */
function ClickableText({ text, onConcept }: { text: string; onConcept: (value: string) => void }) {
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {text.split(/(\s+)/).map((chunk, index) =>
        chunk.trim() ? (
          <button
            key={index}
            type="button"
            onClick={() => onConcept(chunk.replace(/[^\p{L}\p{N}+\-()/.]/gu, ""))}
            className="rounded px-0.5 text-left transition-colors hover:bg-accent/15 hover:text-primary"
          >
            {chunk}
          </button>
        ) : (
          <span key={index}>{chunk}</span>
        ),
      )}
    </p>
  );
}

export function NotesCanvas({
  classId,
  sectionId,
  canEdit,
  initialBlocks,
  initialSummary,
  initialTab = "notes",
  onConcept,
  onSaved,
}: {
  classId: string;
  sectionId: string;
  canEdit: boolean;
  initialBlocks: NoteBlock[];
  initialSummary: string | null;
  initialTab?: "notes" | "summary";
  onConcept: (value: string) => void;
  onSaved?: () => void;
}) {
  const save = useServerFn(saveSectionNotes);
  const regenerate = useServerFn(generateSectionSummary);
  const signPaths = useServerFn(signNotePaths);

  const [blocks, setBlocks] = useState<NoteBlock[]>(
    initialBlocks.length > 0 || !canEdit ? initialBlocks : [{ id: crypto.randomUUID(), type: "text", text: "" }],
  );
  const [summary, setSummary] = useState(initialSummary ?? "");
  const [drawing, setDrawing] = useState(false);
  const [tab, setTab] = useState<"notes" | "summary">(initialTab);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const dirty = useRef(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  // Reset when the teacher switches section.
  useEffect(() => {
    setBlocks(
      initialBlocks.length > 0 || !canEdit
        ? initialBlocks
        : [{ id: crypto.randomUUID(), type: "text", text: "" }],
    );
    setSummary(initialSummary ?? "");
    dirty.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId]);

  const imagePaths = useMemo(
    () => blocks.filter((b): b is Extract<NoteBlock, { type: "image" }> => b.type === "image").map((b) => b.path),
    [blocks],
  );
  const urls = useQuery({
    queryKey: ["note-image-urls", sectionId, imagePaths.join("|")],
    queryFn: () => signPaths({ data: { paths: imagePaths } }),
    enabled: imagePaths.length > 0,
  });

  const summaryMutation = useMutation({
    mutationFn: () => regenerate({ data: { sectionId } }),
    onSuccess: (result) => setSummary(result.summary ?? ""),
    onError: (error: Error) => toast.error(error.message),
  });

  // Continuous autosave, then a fresh AI summary once typing settles.
  useEffect(() => {
    if (!canEdit || !dirty.current) return;
    setStatus("saving");
    const saveTimer = setTimeout(async () => {
      try {
        await save({ data: { sectionId, blocks } });
        setStatus("saved");
        dirty.current = false;
        onSaved?.();
        summaryMutation.mutate();
      } catch (error) {
        setStatus("idle");
        toast.error((error as Error).message);
      }
    }, 1500);
    return () => clearTimeout(saveTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, canEdit, sectionId]);

  function update(next: NoteBlock[]) {
    dirty.current = true;
    setBlocks(next);
  }

  async function uploadImage(file: File) {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "pasted.png";
    const path = `${classId}/notes/${sectionId}/${crypto.randomUUID()}-${safe}`;
    const { error } = await supabase.storage
      .from("class-materials")
      .upload(path, file, { contentType: file.type || "image/png" });
    if (error) {
      toast.error(error.message);
      return;
    }
    update([...blocks, { id: crypto.randomUUID(), type: "image", path, caption: file.name }]);
  }

  function handlePaste(event: React.ClipboardEvent) {
    if (!canEdit) return;
    const item = Array.from(event.clipboardData.items).find((i) => i.type.startsWith("image/"));
    const file = item?.getAsFile();
    if (file) {
      event.preventDefault();
      void uploadImage(file);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border bg-card" onPaste={handlePaste}>
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <Button
          size="sm"
          variant={tab === "notes" ? "default" : "ghost"}
          onClick={() => setTab("notes")}
        >
          Lesson canvas
        </Button>
        <Button
          size="sm"
          variant={tab === "summary" ? "default" : "ghost"}
          onClick={() => setTab("summary")}
        >
          <Sparkles className="size-4" />
          AI summary
        </Button>
        {canEdit && tab === "notes" ? (
          <span className="ml-auto text-xs text-muted-foreground">
            {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : ""}
          </span>
        ) : null}
      </div>

      {tab === "notes" ? (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {blocks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing written on this canvas yet.
            </p>
          ) : null}

          {blocks.map((block, index) =>
            block.type === "text" ? (
              canEdit ? (
                <div key={block.id} className="group relative">
                  <Textarea
                    value={block.text}
                    onChange={(event) => {
                      const next = [...blocks];
                      next[index] = { ...block, text: event.target.value };
                      update(next);
                    }}
                    placeholder="Type your lesson notes: key concepts, vocabulary, worked examples…"
                    className="min-h-[140px] text-sm"
                  />
                  {blocks.length > 1 ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => update(blocks.filter((b) => b.id !== block.id))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>
              ) : (
                <ClickableText key={block.id} text={block.text} onConcept={onConcept} />
              )
            ) : (
              <figure key={block.id} className="relative">
                {urls.data?.[block.path] ? (
                  <img
                    src={urls.data[block.path]}
                    alt={block.caption ?? "Lesson note image"}
                    className="w-full rounded-md border bg-white"
                  />
                ) : (
                  <div className="h-40 animate-pulse rounded-md border bg-muted" />
                )}
                {canEdit ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="absolute right-2 top-2"
                    onClick={() => update(blocks.filter((b) => b.id !== block.id))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </figure>
            ),
          )}

          {canEdit ? (
            <>
              {drawing ? (
                <DrawingPad
                  onAttach={(file) => {
                    setDrawing(false);
                    void uploadImage(file);
                  }}
                />
              ) : null}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    update([...blocks, { id: crypto.randomUUID(), type: "text", text: "" }])
                  }
                >
                  <Type className="size-4" />
                  Add text
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDrawing((v) => !v)}>
                  <PenLine className="size-4" />
                  {drawing ? "Close drawing" : "Draw"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
                  <ImagePlus className="size-4" />
                  Add image
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadImage(file);
                    event.target.value = "";
                  }}
                />
                <span className="self-center text-xs text-muted-foreground">
                  You can also paste images straight onto the canvas.
                </span>
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {canEdit ? (
            <Button
              size="sm"
              variant="outline"
              className="mb-3"
              onClick={() => summaryMutation.mutate()}
              disabled={summaryMutation.isPending}
            >
              <RefreshCw className="size-4" />
              {summaryMutation.isPending ? "Organising…" : "Refresh summary"}
            </Button>
          ) : null}
          {summary ? (
            <div className="space-y-2">
              {summary.split("\n").map((line, index) =>
                line.startsWith("#") ? (
                  <h4 key={index} className="pt-2 font-display text-lg">
                    {line.replace(/^#+\s*/, "")}
                  </h4>
                ) : line.trim() ? (
                  <ClickableText key={index} text={line.replace(/^[-*]\s*/, "• ")} onConcept={onConcept} />
                ) : null,
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {canEdit
                ? "Write notes on the canvas — the AI summary of key concepts, vocabulary and worked examples builds itself as you go."
                : "Your teacher's summary will appear here once they add notes."}
            </p>
          )}
        </div>
      )}

      {canEdit && tab === "notes" ? (
        <div className="border-t px-3 py-2 text-xs text-muted-foreground">
          <Plus className="mr-1 inline size-3" />
          Students can read this canvas and the AI summary, but only you can edit them.
        </div>
      ) : null}
    </div>
  );
}

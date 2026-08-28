import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eraser, ImagePlus, PenLine, RefreshCw, Sparkles, Type } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { FreeCanvas, type CanvasMode } from "@/components/materials/FreeCanvas";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  generateSectionSummary,
  saveSectionNotes,
  signNotePaths,
  type NoteBlock,
} from "@/lib/notes.functions";

const PEN_COLORS = ["#111827", "#dc2626", "#2563eb", "#16a34a", "#ea580c", "#7c3aed"];

/** Words in read-only summaries are clickable so the tutor can explain them. */
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

/** Legacy stacked blocks get positions so they land on the free canvas. */
function withPositions(blocks: NoteBlock[]): NoteBlock[] {
  let y = 24;
  return blocks.map((block) => {
    if (block.type === "ink") return block;
    if (block.x !== undefined && block.y !== undefined) return block;
    const placed = { ...block, x: 24, y, w: block.w ?? 520 } as NoteBlock;
    y += block.type === "image" ? 340 : 180;
    return placed;
  });
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

  const [blocks, setBlocks] = useState<NoteBlock[]>(withPositions(initialBlocks));
  const [summary, setSummary] = useState(initialSummary ?? "");
  const [tab, setTab] = useState<"notes" | "summary">(initialTab);
  const [mode, setMode] = useState<CanvasMode>("type");
  const [penColor, setPenColor] = useState(PEN_COLORS[0]!);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const dirty = useRef(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Reset when the teacher switches section.
  useEffect(() => {
    setBlocks(withPositions(initialBlocks));
    setSummary(initialSummary ?? "");
    dirty.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId]);

  const imagePaths = useMemo(
    () =>
      blocks
        .filter((b): b is Extract<NoteBlock, { type: "image" }> => b.type === "image")
        .map((b) => b.path),
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
    const top = (scrollRef.current?.scrollTop ?? 0) + 40;
    update([
      ...blocks,
      { id: crypto.randomUUID(), type: "image", path, caption: file.name, x: 40, y: top, w: 360 },
    ]);
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
        <Button size="sm" variant={tab === "notes" ? "default" : "ghost"} onClick={() => setTab("notes")}>
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

      {canEdit && tab === "notes" ? (
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-1.5">
          <Button size="sm" variant={mode === "type" ? "default" : "outline"} onClick={() => setMode("type")}>
            <Type className="size-4" />
            Type
          </Button>
          <Button size="sm" variant={mode === "draw" ? "default" : "outline"} onClick={() => setMode("draw")}>
            <PenLine className="size-4" />
            Draw
          </Button>
          <Button size="sm" variant={mode === "erase" ? "default" : "outline"} onClick={() => setMode("erase")}>
            <Eraser className="size-4" />
            Erase
          </Button>
          {mode === "draw"
            ? PEN_COLORS.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-label={`Pen colour ${value}`}
                  aria-pressed={penColor === value}
                  onClick={() => setPenColor(value)}
                  className={`size-5 rounded-full border-2 transition-transform ${
                    penColor === value ? "scale-110 border-foreground" : "border-border"
                  }`}
                  style={{ backgroundColor: value }}
                />
              ))
            : null}
          <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
            <ImagePlus className="size-4" />
            Image
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
          <Button
            size="sm"
            variant="ghost"
            onClick={() => update(blocks.slice(0, -1))}
            disabled={blocks.length === 0}
          >
            Undo
          </Button>
          <span className="text-xs text-muted-foreground">
            {mode === "draw"
              ? "Draw anywhere on the sheet."
              : mode === "erase"
                ? "Click or drag across a stroke to erase it."
                : "Click anywhere to type · paste images straight in"}
          </span>
        </div>
      ) : null}

      {tab === "notes" ? (
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <FreeCanvas
            blocks={blocks}
            canEdit={canEdit}
            mode={mode}
            penColor={penColor}
            penWidth={2.4}
            imageUrls={urls.data}
            onChange={update}
            onConcept={onConcept}
          />
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
                  <ClickableText
                    key={index}
                    text={line.replace(/^[-*]\s*/, "• ")}
                    onConcept={onConcept}
                  />
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
    </div>
  );
}

import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Eraser,
  Highlighter,
  ImagePlus,
  Mic,
  Minus,
  MousePointer2,
  PenLine,
  Plus,
  RefreshCw,
  Sparkles,
  SquarePlus,
  Square,
  Type,
  Volume2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { FreeCanvas, type CanvasMode } from "@/components/materials/FreeCanvas";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { readCachedJson, writeCachedJson } from "@/lib/doc-cache";
import { useMirrorField, useMirrorScroll } from "@/lib/lesson-mirror";
import {
  generateSectionSummary,
  saveSectionNotes,
  signNotePaths,
  transcribeVoiceNote,
  type NoteBlock,
} from "@/lib/notes.functions";
import { collectSummaryVisuals } from "@/lib/summary-visuals";
import { blobToBase64, startVoiceRecording } from "@/lib/voice-recorder";
import { usePaneZoom } from "@/hooks/use-pane-zoom";



const PEN_COLORS = ["#111827", "#dc2626", "#2563eb", "#16a34a", "#ea580c", "#7c3aed"];
/** Highlighter colours for the canvas. */
const HIGHLIGHT_COLORS = ["#fde047", "#86efac", "#93c5fd", "#f9a8d4", "#fdba74"];

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
    if (block.type === "ink" || block.type === "audio") return block;
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
  documentMaterialId = null,
  documentTitle = null,
  onConcept,
  onSaved,
}: {
  classId: string;
  sectionId: string;
  canEdit: boolean;
  initialBlocks: NoteBlock[];
  initialSummary: string | null;
  initialTab?: "notes" | "summary";
  /** Attached document, so its drawing/text markup joins the AI summary. */
  documentMaterialId?: string | null;
  documentTitle?: string | null;
  onConcept: (value: string) => void;
  onSaved?: () => void;
}) {
  const save = useServerFn(saveSectionNotes);
  const regenerate = useServerFn(generateSectionSummary);
  const signPaths = useServerFn(signNotePaths);
  const transcribe = useServerFn(transcribeVoiceNote);
  const recorder = useRef<Awaited<ReturnType<typeof startVoiceRecording>> | null>(null);
  const [recording, setRecording] = useState<"dictate" | "note" | null>(null);
  const [busyVoice, setBusyVoice] = useState(false);


  const [blocks, setBlocks] = useState<NoteBlock[]>(withPositions(initialBlocks));
  const [summary, setSummary] = useState(initialSummary ?? "");
  const [tab, setTab] = useState<"notes" | "summary">(initialTab);
  const [mode, setMode] = useState<CanvasMode>("type");
  const [penColor, setPenColor] = useState(PEN_COLORS[0]!);
  const [highlightColor, setHighlightColor] = useState(HIGHLIGHT_COLORS[0]!);
  const [zoom, setZoom] = useState(1);

  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const dirty = useRef(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  /** Latest edit, so a flush always saves the newest work for the right section. */
  const latest = useRef<{ sectionId: string; blocks: NoteBlock[] }>({ sectionId, blocks });
  const draftKey = `notes-draft:${sectionId}`;

  // Reset when the teacher switches section, restoring any unsaved local draft
  // (e.g. the tab closed or the network dropped before the last save landed).
  useEffect(() => {
    let cancelled = false;
    setBlocks(withPositions(initialBlocks));
    setSummary(initialSummary ?? "");
    dirty.current = false;
    latest.current = { sectionId, blocks: withPositions(initialBlocks) };
    void (async () => {
      const draft = await readCachedJson<NoteBlock[]>(`notes-draft:${sectionId}`);
      if (!cancelled && canEdit && draft && draft.length > 0) {
        setBlocks(withPositions(draft));
        latest.current = { sectionId, blocks: withPositions(draft) };
        dirty.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId]);

  // The teacher's typing, drawing and pictures always appear live on student
  // screens; zoom, tab and scrolling only follow while mirroring is on.
  useMirrorField("canvas.blocks", blocks, setBlocks, "content");
  useMirrorField("canvas.zoom", zoom, setZoom);
  useMirrorField("canvas.tab", tab, setTab);
  // The sheet length and zoom both travel with the mirror, so the student sits
  // at exactly the same place on the page as the teacher.
  useMirrorScroll("canvas.scroll", scrollRef, { exact: true });

  // Canvas pictures and voice notes both live in the class-materials bucket.
  const mediaPaths = useMemo(
    () =>
      blocks
        .filter(
          (b): b is Extract<NoteBlock, { type: "image" | "audio" }> =>
            b.type === "image" || b.type === "audio",
        )
        .map((b) => b.path),
    [blocks],
  );
  const urls = useQuery({
    queryKey: ["note-image-urls", sectionId, mediaPaths.join("|")],
    queryFn: () => signPaths({ data: { paths: mediaPaths } }),
    enabled: mediaPaths.length > 0,
  });


  const summaryMutation = useMutation({
    mutationFn: async () => {
      // Rasterise the pen drawing on the canvas and any marks made on the
      // attached document, so the summary covers drawings and pictures too.
      const visuals = await collectSummaryVisuals(blocks, documentMaterialId);
      return regenerate({
        data: { sectionId, documentTitle, ...visuals },
      });
    },
    onSuccess: (result) => setSummary(result.summary ?? ""),
    onError: (error: Error) => toast.error(error.message),
  });

  /** Writes the newest work to the server right away. */
  const flush = useRef(async () => {});
  flush.current = async () => {
    if (!canEdit || !dirty.current) return;
    const snapshot = latest.current;
    dirty.current = false;
    setStatus("saving");
    try {
      await save({ data: { sectionId: snapshot.sectionId, blocks: snapshot.blocks } });
      setStatus("saved");
      onSaved?.();
      // Server has it — the local safety copy is no longer needed.
      await writeCachedJson(`notes-draft:${snapshot.sectionId}`, []);
    } catch (error) {
      // Keep it dirty so the next tick (or flush) tries again; the local draft
      // still holds the work either way.
      dirty.current = true;
      setStatus("idle");
      toast.error((error as Error).message);
    }
  };

  // Autosave almost immediately after any typing, drawing or image, then
  // refresh the AI summary once editing settles.
  useEffect(() => {
    if (!canEdit || !dirty.current) return;
    setStatus("saving");
    const saveTimer = setTimeout(async () => {
      await flush.current();
      if (!dirty.current) summaryMutation.mutate();
    }, 400);
    return () => clearTimeout(saveTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, canEdit, sectionId]);

  // Never lose work when the pane closes, the section changes, the tab is
  // hidden or the window is closed.
  useEffect(() => {
    const onHide = () => void flush.current();
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      void flush.current();
      if (dirty.current) event.preventDefault();
    };
    window.addEventListener("blur", onHide);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("blur", onHide);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onHide);
      void flush.current();
    };
  }, []);

  function update(next: NoteBlock[]) {
    dirty.current = true;
    latest.current = { sectionId, blocks: next };
    setBlocks(next);
    // Instant local safety copy, so nothing can be lost before the save lands.
    void writeCachedJson(draftKey, next);
  }


  /**
   * Adds a picture to the sheet. Pasted pictures land exactly where the pointer
   * last sat; the toolbar button falls back to the top of the visible sheet.
   */
  async function uploadImage(file: File, at?: { x: number; y: number } | null) {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "pasted.png";
    const path = `${classId}/notes/${sectionId}/${crypto.randomUUID()}-${safe}`;
    const { error } = await supabase.storage
      .from("class-materials")
      .upload(path, file, { contentType: file.type || "image/png" });
    if (error) {
      toast.error(error.message);
      return;
    }
    const fallbackTop = (scrollRef.current?.scrollTop ?? 0) / zoom + 40;
    const x = Math.max(0, at ? at.x : 40);
    const y = Math.max(0, at ? at.y : fallbackTop);
    update([
      ...blocks,
      { id: crypto.randomUUID(), type: "image", path, caption: file.name, x, y, w: 360 },
    ]);
  }


  /**
   * Voice notes. "dictate" turns speech into a text box on the canvas;
   * "note" leaves a draggable speaker pin students can replay.
   */
  async function beginRecording(kind: "dictate" | "note") {
    try {
      const session = await startVoiceRecording();
      recorder.current = session;
      setRecording(kind);
    } catch {
      toast.error("Microphone access is needed to record a voice note.");
    }
  }

  async function finishRecording() {
    const session = recorder.current;
    const kind = recording;
    recorder.current = null;
    setRecording(null);
    if (!session || !kind) return;
    try {
      setBusyVoice(true);
      const { blob, seconds } = await session.stop();
      const top = (scrollRef.current?.scrollTop ?? 0) + 40;

      if (kind === "dictate") {
        const { text } = await transcribe({ data: { audioBase64: await blobToBase64(blob) } });
        if (!text) {
          toast.error("Nothing was recognised — please try again.");
          return;
        }
        update([
          ...blocks,
          { id: crypto.randomUUID(), type: "text", text, x: 40, y: top, w: 420, size: 15, box: true },
        ]);
        toast.success("Voice added as text.");
        return;
      }

      const path = `${classId}/notes/${sectionId}/${crypto.randomUUID()}-voice-note.wav`;
      const { error } = await supabase.storage
        .from("class-materials")
        .upload(path, blob, { contentType: "audio/wav" });
      if (error) {
        toast.error(error.message);
        return;
      }
      // Transcribe in the background so the AI summary hears the voice note too.
      let transcript = "";
      try {
        transcript = (await transcribe({ data: { audioBase64: await blobToBase64(blob) } })).text;
      } catch {
        transcript = "";
      }
      update([
        ...blocks,
        {
          id: crypto.randomUUID(),
          type: "audio",
          path,
          label: "Voice note",
          seconds: Math.round(seconds),
          ...(transcript ? { transcript } : {}),
          x: 40,
          y: top,
        },
      ]);
      toast.success("Voice note added — drag the speaker anywhere.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusyVoice(false);
    }
  }


  /** Where the pointer last rested on the sheet, in sheet coordinates. */
  const pointerAt = useRef<{ x: number; y: number } | null>(null);

  function handlePaste(event: React.ClipboardEvent) {
    if (!canEdit) return;
    const item = Array.from(event.clipboardData.items).find((i) => i.type.startsWith("image/"));
    const file = item?.getAsFile();
    if (file) {
      event.preventDefault();
      void uploadImage(file, pointerAt.current);
    }
  }

  // Paste anywhere on the canvas — the browser only fires paste on the focused
  // element, so listen on the document while the lesson canvas is open.
  useEffect(() => {
    if (!canEdit || tab !== "notes") return;
    const onPaste = (event: ClipboardEvent) => {
      // Never steal a paste that belongs to a text field, dialog or popover
      // (for example the formative check question box).
      const target = event.target as HTMLElement | null;
      if (
        target?.closest?.(
          'input, textarea, [contenteditable="true"], [role="dialog"], [data-radix-popper-content-wrapper]',
        )
      ) {
        return;
      }
      const item = Array.from(event.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith("image/"),
      );
      const file = item?.getAsFile();
      if (!file) return;
      event.preventDefault();
      void uploadImage(file, pointerAt.current);
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, tab, blocks, sectionId]);

  const { applyZoom } = usePaneZoom({
    scrollRef,
    zoom,
    setZoom,
    max: 2.5,
    enabled: tab === "notes",
  });



  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border bg-card" onPaste={handlePaste}>

      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <Button
          size="sm"
          variant={tab === "notes" ? "default" : "ghost"}
          aria-pressed={tab === "notes"}
          onClick={() => setTab("notes")}
        >
          Lesson canvas
        </Button>
        <Button
          size="sm"
          variant={tab === "summary" ? "default" : "ghost"}
          aria-pressed={tab === "summary"}
          onClick={() => setTab("summary")}
        >
          <Sparkles className="size-4" />
          AI summary
        </Button>

        {tab === "notes" ? (
          <div className="ml-auto flex items-center gap-1">
            {canEdit ? (
              <span className="mr-1 text-xs text-muted-foreground">
                {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : ""}
              </span>
            ) : null}
            <Button
              size="icon"
              variant="outline"
              className="size-7"
              aria-label="Zoom out canvas"
              onClick={() => applyZoom((value) => value - 0.1)}
            >
              <Minus className="size-3.5" />
            </Button>
            <button
              type="button"
              onClick={() => applyZoom(() => 1)}
              className="min-w-11 rounded px-1 text-xs text-muted-foreground hover:bg-muted"
              aria-label="Reset canvas zoom"
            >
              {Math.round(zoom * 100)}%
            </button>
            <Button
              size="icon"
              variant="outline"
              className="size-7"
              aria-label="Zoom in canvas"
              onClick={() => applyZoom((value) => value + 0.1)}
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
        ) : null}
      </div>


      {canEdit && tab === "notes" ? (
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-1.5">
          <Button
            size="sm"
            variant={mode === "select" ? "default" : "outline"}
            onClick={() => setMode("select")}
            title="Click text or pictures to move, resize or delete them"
          >
            <MousePointer2 className="size-4" />
            Arrow
          </Button>
          <Button size="sm" variant={mode === "type" ? "default" : "outline"} onClick={() => setMode("type")}>
            <Type className="size-4" />
            Type
          </Button>
          <Button size="sm" variant={mode === "draw" ? "default" : "outline"} onClick={() => setMode("draw")}>
            <PenLine className="size-4" />
            Draw
          </Button>
          <Button
            size="sm"
            variant={mode === "highlight" ? "default" : "outline"}
            onClick={() => setMode("highlight")}
          >
            <Highlighter className="size-4" />
            Highlight
          </Button>
          <Button size="sm" variant={mode === "erase" ? "default" : "outline"} onClick={() => setMode("erase")}>
            <Eraser className="size-4" />
            Erase
          </Button>
          {mode === "draw" || mode === "highlight"
            ? (mode === "highlight" ? HIGHLIGHT_COLORS : PEN_COLORS).map((value) => {
                const active = (mode === "highlight" ? highlightColor : penColor) === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-label={`${mode === "highlight" ? "Highlighter" : "Pen"} colour ${value}`}
                    aria-pressed={active}
                    onClick={() =>
                      mode === "highlight" ? setHighlightColor(value) : setPenColor(value)
                    }
                    className={`size-5 rounded-full border-2 transition-transform ${
                      active ? "scale-110 border-foreground" : "border-border"
                    }`}
                    style={{ backgroundColor: value }}
                  />
                );
              })
            : null}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const top = (scrollRef.current?.scrollTop ?? 0) + 40;
              setMode("type");
              update([
                ...blocks,
                {
                  id: crypto.randomUUID(),
                  type: "text",
                  text: "",
                  x: 40,
                  y: top,
                  w: 320,
                  size: 15,
                  box: true,
                },
              ]);
            }}
          >
            <SquarePlus className="size-4" />
            Text box
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
            <ImagePlus className="size-4" />
            Image
          </Button>
          <Button
            size="sm"
            variant={recording === "dictate" ? "destructive" : "outline"}
            disabled={busyVoice || recording === "note"}
            onClick={() =>
              recording === "dictate" ? void finishRecording() : void beginRecording("dictate")
            }
          >
            {recording === "dictate" ? <Square className="size-4" /> : <Mic className="size-4" />}
            {recording === "dictate" ? "Stop & insert text" : "Voice to text"}
          </Button>
          <Button
            size="sm"
            variant={recording === "note" ? "destructive" : "outline"}
            disabled={busyVoice || recording === "dictate"}
            onClick={() =>
              recording === "note" ? void finishRecording() : void beginRecording("note")
            }
          >
            {recording === "note" ? <Square className="size-4" /> : <Volume2 className="size-4" />}
            {recording === "note" ? "Stop & save note" : "Voice note"}
          </Button>
          {busyVoice ? (
            <span className="text-xs text-muted-foreground">Processing audio…</span>
          ) : null}



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
            {mode === "highlight"
              ? "Drag across typed text or anywhere to highlight."
              : mode === "draw"
              ? "Draw anywhere on the sheet."
              : mode === "erase"
                ? "Click or drag across a stroke to erase it."
                : mode === "select"
                  ? "Click text or a picture to move it, drag a corner to resize, or use the bin to delete."
                  : "Click anywhere to type · paste images straight in"}
          </span>
        </div>
      ) : null}

      {tab === "notes" ? (
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-auto [overflow-anchor:none] [overscroll-behavior:contain]"
        >

          <FreeCanvas
            blocks={blocks}
            canEdit={canEdit}
            mode={mode}
            penColor={penColor}
            highlightColor={highlightColor}
            penWidth={2.4}
            imageUrls={urls.data}
            onPointerAt={(at) => {
              pointerAt.current = at;
            }}
            zoom={zoom}
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

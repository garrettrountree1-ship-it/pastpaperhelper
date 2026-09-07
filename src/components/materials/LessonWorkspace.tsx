import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowLeftRight,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Layers,
  Minus,

  Maximize,
  Minimize,
  Move,
  Pencil,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  FormativeCheckButton,
  FormativeCheckPanel,
} from "@/components/materials/FormativeCheck";
import { LessonTutorBar } from "@/components/materials/LessonTutorBar";
import { NotesCanvas } from "@/components/materials/NotesCanvas";
import { OfficeDocView } from "@/components/materials/OfficeDocView";
import { PdfDocView } from "@/components/materials/PdfDocView";
import { SlideDeckView } from "@/components/materials/SlideDeckView";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTutorThread } from "@/hooks/use-tutor-thread";
import { docFormat } from "@/lib/doc-kind";
import { getMaterialUrl, updateUnit } from "@/lib/materials.functions";
import { createSection, deleteSection, listSections, updateSection } from "@/lib/notes.functions";

type UnitMaterial = {
  id: string;
  title: string;
  kind: string;
  storage_path: string | null;
  external_url: string | null;
  allow_download?: boolean;
};

export type WorkspaceUnit = {
  id: string;
  title: string;
  description: string | null;
  planned_start: string | null;
  planned_end: string | null;
  planned_classes: number | null;
  materials: UnitMaterial[];
};
function planLine(unit: WorkspaceUnit) {
  const dates =
    unit.planned_start && unit.planned_end
      ? `${unit.planned_start} → ${unit.planned_end}`
      : unit.planned_start || unit.planned_end || "Dates not set";
  const classes =
    unit.planned_classes && unit.planned_classes > 0
      ? `${unit.planned_classes} class${unit.planned_classes === 1 ? "" : "es"} planned`
      : "Number of classes not set";
  return `${dates} · ${classes}`;
}

export function LessonWorkspace({
  classId,
  unit,
  canManage,
  initialMaterialId,
  initialTab = "notes",
  onBack,
  onUnitChanged,
}: {
  classId: string;
  unit: WorkspaceUnit;
  canManage: boolean;
  initialMaterialId?: string | null;
  initialTab?: "notes" | "summary";
  onBack: () => void;
  onUnitChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const fetchSections = useServerFn(listSections);
  const addSection = useServerFn(createSection);
  const patchSection = useServerFn(updateSection);
  const removeSection = useServerFn(deleteSection);
  const getUrl = useServerFn(getMaterialUrl);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [concept, setConcept] = useState<string | null>(null);
  const [docOverride, setDocOverride] = useState<string | null>(initialMaterialId ?? null);
  const [term, setTerm] = useState("");
  // On phones the screen is far too narrow for side-by-side panes, so the
  // workspace always uses one full-screen window with a toggle between the
  // lesson canvas and the documents, and the tutor starts collapsed.
  const isPhone = useIsMobile();
  const [tutorOpen, setTutorOpen] = useState(true);
  useEffect(() => {
    if (isPhone) setTutorOpen(false);
  }, [isPhone]);
  const [presenting, setPresenting] = useState(false);
  // The tutor thread belongs to the signed-in account only.
  const { turns: tutorTurns, setTurns: setTutorTurns } = useTutorThread(`class:${classId}`);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  // Draggable divider between the lesson canvas and the document pane.
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [split, setSplit] = useState(50);
  // "split" shows both panes; "canvas"/"doc" give one pane the full width.
  const [paneMode, setPaneMode] = useState<"split" | "canvas" | "doc">("split");
  // Side-by-side columns, or layered (one window floating on top).
  const [layout, setLayout] = useState<"split" | "layered">("split");
  // Phones only ever get the layered, full-screen window.
  const effectiveLayout = isPhone ? "layered" : layout;
  const canvasSize = paneMode === "canvas" ? "100%" : paneMode === "doc" ? "0%" : `${split}%`;
  const docSize =
    paneMode === "doc" ? "100%" : paneMode === "canvas" ? "0%" : `calc(${100 - split}% - 0.5rem)`;
  const canvasStyle = { width: canvasSize };
  const docStyle = { width: docSize };

  // Layered mode: both panes stay mounted in fixed wrappers (so swapping which
  // one is in front never resets scroll position or canvas view). One wrapper
  // is positioned as a floating window that can be moved / resized in pixels.
  const [frontPane, setFrontPane] = useState<"canvas" | "doc">("canvas");
  const [floatState, setFloatState] = useState<"window" | "min" | "max">("window");
  const [areaSize, setAreaSize] = useState({ w: 0, h: 0 });
  const [floatRect, setFloatRect] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null,
  );
  // While dragging, an invisible sheet sits over the panes so embedded
  // documents / iframes can't swallow the pointer and stall the drag.
  const [floatDragging, setFloatDragging] = useState(false);

  const MIN_W = 260;
  const MIN_H = 170;
  const BAR_H = 40;

  // Track the layered area so the window can be clamped inside it.
  useEffect(() => {
    const row = rowRef.current;
    if (!row || layout !== "layered") return;
    const measure = () => {
      const r = row.getBoundingClientRect();
      setAreaSize({ w: r.width, h: r.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [layout]);

  const clampRect = useCallback(
    (r: { x: number; y: number; w: number; h: number }) => {
      const aw = areaSize.w || 900;
      const ah = areaSize.h || 600;
      const w = Math.max(Math.min(MIN_W, aw), Math.min(r.w, aw));
      const h = Math.max(Math.min(MIN_H, ah), Math.min(r.h, ah));
      return {
        w,
        h,
        x: Math.max(0, Math.min(r.x, aw - w)),
        y: Math.max(0, Math.min(r.y, ah - h)),
      };
    },
    [areaSize.w, areaSize.h],
  );

  // Give the window a sensible first size once the area is measured, and keep
  // it inside the area when the layout resizes.
  useEffect(() => {
    if (!areaSize.w || !areaSize.h) return;
    setFloatRect((prev) =>
      prev
        ? clampRect(prev)
        : clampRect({
            x: 24,
            y: 20,
            w: Math.max(MIN_W, Math.round(areaSize.w * 0.56)),
            h: Math.max(MIN_H, Math.round(areaSize.h * 0.62)),
          }),
    );
  }, [areaSize.w, areaSize.h, clampRect]);

  type FloatDrag = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

  function startFloatDrag(event: React.PointerEvent<HTMLElement>, mode: FloatDrag) {
    if (event.button !== undefined && event.button !== 0) return;
    if (!floatRect) return;
    event.preventDefault();
    event.stopPropagation();
    setFloatState("window");
    setFloatDragging(true);
    const start = { px: event.clientX, py: event.clientY, ...floatRect };
    // Stop text selection / iframe hijacking while a drag is in flight.
    const prevSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = mode === "move" ? "move" : `${mode}-resize`;
    const apply = (move: PointerEvent) => {
      const dx = move.clientX - start.px;
      const dy = move.clientY - start.py;
      const next = { x: start.x, y: start.y, w: start.w, h: start.h };
      if (mode === "move") {
        next.x = start.x + dx;
        next.y = start.y + dy;
      } else {
        if (mode === "e" || mode === "ne" || mode === "se") next.w = start.w + dx;
        if (mode === "w" || mode === "nw" || mode === "sw") {
          const w = Math.max(MIN_W, start.w - dx);
          next.x = start.x + start.w - w;
          next.w = w;
        }
        if (mode === "s" || mode === "se" || mode === "sw") next.h = start.h + dy;
        if (mode === "n" || mode === "ne" || mode === "nw") {
          const h = Math.max(MIN_H, start.h - dy);
          next.y = start.y + start.h - h;
          next.h = h;
        }
      }
      setFloatRect(clampRect(next));
    };
    const onMove = (move: PointerEvent) => apply(move);
    const onUp = () => {
      setFloatDragging(false);
      document.body.style.userSelect = prevSelect;
      document.body.style.cursor = prevCursor;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }





  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const row = rowRef.current;
    if (!row) return;
    setPaneMode("split");
    const rect = row.getBoundingClientRect();
    const onMove = (move: PointerEvent) => {
      const pct = ((move.clientX - rect.left) / rect.width) * 100;
      setSplit(Math.min(80, Math.max(20, pct)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }



  // Presentation mode: hide the top chrome and expand the three panes to fill
  // the whole viewport. ESC or the floating button exits.
  useEffect(() => {
    if (!presenting) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPresenting(false);
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setPresenting(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [presenting]);

  async function togglePresentation() {
    const next = !presenting;
    setPresenting(next);
    if (next) {
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        // Fullscreen is optional; the CSS expansion still covers the viewport.
      }
    } else {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
      } catch {
        // ignore
      }
    }
  }

  const sections = useQuery({
    queryKey: ["unit-sections", unit.id],
    queryFn: () => fetchSections({ data: { unitId: unit.id } }),
  });

  const list = sections.data ?? [];
  const active = list.find((section) => section.id === activeId) ?? list[0] ?? null;

  useEffect(() => {
    if (!activeId && list.length > 0) setActiveId(list[0]!.id);
  }, [activeId, list]);

  const invalidateSections = () =>
    queryClient.invalidateQueries({ queryKey: ["unit-sections", unit.id] });

  const createMutation = useMutation({
    mutationFn: (title: string) => addSection({ data: { unitId: unit.id, title } }),
    onSuccess: async (section) => {
      if (initialMaterialId) {
        await patchSection({
          data: { sectionId: section.id, materialId: initialMaterialId },
        }).catch(() => undefined);
      }
      await invalidateSections();
      setActiveId(section.id);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const attachMutation = useMutation({
    mutationFn: (materialId: string | null) =>
      patchSection({ data: { sectionId: active!.id, materialId } }),
    onSuccess: invalidateSections,
    onError: (error: Error) => toast.error(error.message),
  });

  const renameMutation = useMutation({
    mutationFn: ({ sectionId, title }: { sectionId: string; title: string }) =>
      patchSection({ data: { sectionId, title: title.trim() } }),
    onSuccess: () => {
      setEditingId(null);
      invalidateSections();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function startRename(section: { id: string; title: string }) {
    setEditingId(section.id);
    setEditingTitle(section.title);
  }

  function commitRename(sectionId: string) {
    const title = editingTitle.trim();
    if (!title) {
      setEditingId(null);
      return;
    }
    renameMutation.mutate({ sectionId, title });
  }

  // Teachers opening the workspace always land in a ready split screen —

  // auto-create the first section instead of showing an empty blocker.
  const autoCreated = useRef(false);
  useEffect(() => {
    if (
      canManage &&
      !sections.isLoading &&
      list.length === 0 &&
      !autoCreated.current &&
      !createMutation.isPending
    ) {
      autoCreated.current = true;
      createMutation.mutate("Section 1");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, sections.isLoading, list.length]);

  const currentDocId = docOverride ?? active?.material_id ?? null;
  const material = unit.materials.find((m) => m.id === currentDocId) ?? null;
  const docUrl = useQuery({
    queryKey: ["material-url", material?.id],
    queryFn: () => getUrl({ data: { materialId: material!.id } }),
    enabled: Boolean(material),
  });

  // The two panes are built once so they can be arranged side by side
  // or layered as floating windows without duplicating their markup.
  const canvasNode = active ? (
    <NotesCanvas
      classId={classId}
      sectionId={active.id}
      canEdit={canManage}
      initialBlocks={active.notes_blocks}
      initialSummary={active.ai_summary}
      initialTab={initialTab}
      documentMaterialId={material?.id ?? null}
      documentTitle={material?.title ?? null}
      onConcept={(value) => {
        setConcept(value);
        setTutorOpen(true);
      }}
      onSaved={invalidateSections}
    />
  ) : null;

  const docNode = (
    <div className="flex h-full min-h-0 flex-col rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <p className="text-sm font-medium">Lesson Materials</p>
        <Select
          value={currentDocId ?? "none"}
          onValueChange={(value) => {
            setDocOverride(value === "none" ? null : value);
            if (canManage) attachMutation.mutate(value === "none" ? null : value);
          }}
        >
          <SelectTrigger className="ml-auto h-8 w-[190px] text-xs">
            <SelectValue placeholder="Choose a resource" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No document</SelectItem>
            {unit.materials.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="min-h-0 flex-1 p-2">
        {!material ? (
          <p className="p-4 text-sm text-muted-foreground">
            {canManage
              ? "Attach a PDF, slide deck or document from this unit's resources."
              : "No document attached to this section."}
          </p>
        ) : docUrl.isLoading || !docUrl.data ? (
          <Skeleton className="h-full w-full" />
        ) : material.kind === "video" ? (
          <video src={docUrl.data.url} controls className="h-full w-full rounded-md" />
        ) : material.kind === "image" ? (
          <img
            src={docUrl.data.url}
            alt={material.title}
            className="h-full w-full rounded-md object-contain"
          />
        ) : docFormat(material.storage_path ?? material.title) === "pptx" ? (
          <SlideDeckView
            url={docUrl.data.url}
            title={material.title}
            cacheKey={`material:${material.id}`}
            materialId={material.id}
            canPrepareShared={canManage}
            canDownload={canManage || material.allow_download !== false}
          />
        ) : docFormat(material.storage_path ?? material.title) === "docx" ? (
          <OfficeDocView
            url={docUrl.data.url}
            title={material.title}
            cacheKey={`material:${material.id}`}
            materialId={material.id}
            canPrepareShared={canManage}
            canDownload={canManage || material.allow_download !== false}
            format="docx"
          />
        ) : (
          <PdfDocView
            url={docUrl.data.url}
            title={material.title}
            canDownload={canManage || material.allow_download !== false}
            cacheKey={`material:${material.id}`}
          />
        )}
      </div>

      <div className="flex gap-2 border-t p-2">
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="A term from this document…"
          className="h-8 text-xs"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!term.trim()}
          onClick={() => {
            setConcept(term.trim());
            setTutorOpen(true);
            setTerm("");
          }}
        >
          Explain
        </Button>
      </div>
    </div>
  );


  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <FormativeCheckPanel classId={classId} asStudent={!canManage} />
      <header className={`flex flex-wrap items-center gap-3 border-b px-4 py-2 ${presenting ? "hidden" : ""}`}>
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <ArrowLeft className="size-4" />
          Close
        </Button>
        <div className="min-w-0">
          <h2 className="truncate font-display text-lg leading-tight">{unit.title}</h2>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarDays className="size-3" />
            {planLine(unit)}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {sections.isLoading ? (
            <Skeleton className="h-8 w-40" />
          ) : (
            list.map((section) =>
              editingId === section.id ? (
                <Input
                  key={`edit-${section.id}`}
                  autoFocus
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onBlur={() => commitRename(section.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(section.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="h-8 w-40 text-xs"
                />
              ) : (
                <div key={section.id} className="inline-flex items-center gap-0.5">
                  <Button
                    size="sm"
                    variant={section.id === active?.id ? "default" : "outline"}
                    onClick={() => setActiveId(section.id)}
                    onDoubleClick={() => {
                      if (canManage) startRename(section);
                    }}
                    title={canManage ? "Click to open · double-click to rename" : undefined}
                  >
                    {section.title}
                  </Button>
                  {canManage ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-6 shrink-0"
                      title="Rename section"
                      aria-label="Rename section"
                      onClick={(e) => {
                        e.stopPropagation();
                        startRename(section);
                      }}
                    >
                      <Pencil className="size-3" />
                    </Button>
                  ) : null}
                </div>
              ),
            )
          )}
          {canManage ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const title = prompt("Section name", `Lesson ${list.length + 1}`);
                  if (title?.trim()) createMutation.mutate(title.trim());
                }}
              >
                <Plus className="size-4" />
                New section
              </Button>
              {active ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (!confirm(`Delete "${active.title}" and its notes?`)) return;
                    await removeSection({ data: { sectionId: active.id } });
                    setActiveId(null);
                    await invalidateSections();
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : null}
              <UnitPlanDialog unit={unit} onSaved={onUnitChanged} />
            </>
          ) : null}
          {canManage ? (
            <FormativeCheckButton classId={classId} sectionId={active?.id ?? null} />
          ) : null}
          <Button
            size="sm"
            variant={presenting ? "default" : "outline"}
            onClick={togglePresentation}
            title={presenting ? "Exit presentation" : "Present to students"}
          >
            {presenting ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
            <span className="hidden sm:inline">{presenting ? "Exit" : "Present"}</span>
          </Button>
        </div>
      </header>

      {active && !presenting ? (
        <PlanStrip
          key={active.id}
          unit={unit}
          section={active}
          canManage={canManage}
          onSaved={invalidateSections}
        />
      ) : null}

      {!active ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-muted-foreground">
          {canManage ? (
            <div className="w-full max-w-5xl space-y-2">
              <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_340px]">
                <Skeleton className="h-[60vh] w-full" />
                <Skeleton className="h-[60vh] w-full" />
                <Skeleton className="h-[60vh] w-full" />
              </div>
              <p className="text-sm">Setting up your lesson workspace…</p>
            </div>
          ) : (
            "Your teacher hasn't added lesson notes to this unit yet."
          )}
        </div>
      ) : (
        <div
          className={`relative flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto lg:flex-row lg:overflow-hidden ${presenting ? "p-0" : "p-2"}`}
        >
          {presenting ? (
            <div className="absolute bottom-3 left-3 z-50 flex items-center gap-1 rounded-md border bg-background/95 p-1 shadow">
              {isPhone ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setFrontPane(frontPane === "canvas" ? "doc" : "canvas")}
                  title="Switch between the lesson canvas and the documents"
                >
                  <ArrowLeftRight className="size-4" />
                  {frontPane === "canvas" ? "Materials" : "Canvas"}
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant={layout === "split" ? "default" : "ghost"}
                    onClick={() => setLayout("split")}
                    title="Split screen (side by side)"
                  >
                    <Columns2 className="size-4" />
                    Split
                  </Button>
                  <Button
                    size="sm"
                    variant={layout === "layered" ? "default" : "ghost"}
                    onClick={() => setLayout("layered")}
                    title="Layered windows (one floating on top of the other)"
                  >
                    <Layers className="size-4" />
                    Layered
                  </Button>
                </>
              )}
              {canManage ? (
                <FormativeCheckButton classId={classId} sectionId={active?.id ?? null} />
              ) : null}
              <Button size="sm" variant="secondary" onClick={togglePresentation} title="Exit presentation (Esc)">


                <Minimize className="size-4" />
                Exit
              </Button>
            </div>
          ) : null}
          {effectiveLayout === "layered" ? (
            (() => {
              const r = floatRect ?? { x: 24, y: 20, w: 520, h: 380 };
              const minW = Math.max(320, Math.min(r.w, 480));
              const frontStyle: React.CSSProperties =
                isPhone || floatState === "max"
                  ? { left: 0, top: 0, width: "100%", height: "100%" }
                  : floatState === "min"
                    ? {
                        left: Math.max(0, Math.min(r.x, (areaSize.w || minW) - minW)),
                        top: Math.max(0, (areaSize.h || BAR_H) - BAR_H),
                        width: minW,
                        height: BAR_H,
                      }
                    : { left: r.x, top: r.y, width: r.w, height: r.h };
              const backStyle: React.CSSProperties = { left: 0, top: 0, right: 0, bottom: 0 };
              const paneWrapper = (pane: "canvas" | "doc") => {
                const isFront = frontPane === pane;
                return {
                  className: `absolute flex min-h-0 flex-col overflow-hidden ${
                    isFront
                      ? `z-30 rounded-lg border-2 bg-background shadow-2xl ${
                          floatDragging ? "border-primary" : "border-border"
                        }`
                      : "z-0"
                  }`,
                  style: isFront ? { ...frontStyle, zIndex: 30 } : backStyle,
                };
              };
              const canvasWrap = paneWrapper("canvas");
              const docWrap = paneWrapper("doc");
              const contentStyle = (pane: "canvas" | "doc"): React.CSSProperties =>
                frontPane === pane
                  ? {
                      paddingTop: BAR_H,
                      display: floatState === "min" ? "none" : undefined,
                    }
                  : {};
              return (
                <div
                  ref={rowRef}
                  className="relative min-h-[80vh] min-w-0 lg:h-full lg:min-h-0 lg:flex-1"
                >
                  {/* Both panes stay mounted; only their position changes when
                      swapping, so scroll / canvas position never resets. */}
                  <div className={canvasWrap.className} style={canvasWrap.style}>
                    <div className="min-h-0 flex-1" style={contentStyle("canvas")}>
                      {canvasNode}
                    </div>
                  </div>
                  <div className={docWrap.className} style={docWrap.style}>
                    <div className="min-h-0 flex-1" style={contentStyle("doc")}>
                      {docNode}
                    </div>
                  </div>

                  {/* Keeps drags alive over embedded documents / iframes */}
                  {floatDragging ? (
                    <div className="absolute inset-0 z-40 cursor-grabbing" />
                  ) : null}

                  {/* Window chrome sits above the front pane so the pane itself
                      never has to be re-mounted while dragging or swapping. */}
                  <div className="pointer-events-none absolute z-50" style={frontStyle}>
                    <div
                      onPointerDown={(event) => {
                        if ((event.target as HTMLElement).closest("button")) return;
                        startFloatDrag(event, "move");
                      }}
                      onDoubleClick={() =>
                        setFloatState(floatState === "max" ? "window" : "max")
                      }
                      style={{ height: BAR_H }}
                      className="pointer-events-auto flex touch-none select-none items-center gap-1 rounded-t-lg border-b bg-muted/80 px-2 cursor-grab active:cursor-grabbing"
                      title="Drag anywhere on this bar to move the window; double-click to maximise"
                    >
                      <Move className="size-3.5 text-muted-foreground" />
                      <span className="truncate text-xs font-medium">
                        {frontPane === "canvas" ? "Lesson canvas" : "Lesson Materials"}
                      </span>
                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-6"
                          title="Swap which window is on top"
                          aria-label="Swap which window is on top"
                          onClick={() =>
                            setFrontPane(frontPane === "canvas" ? "doc" : "canvas")
                          }
                        >
                          <ArrowLeftRight className="size-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-6"
                          title={floatState === "min" ? "Restore window" : "Minimise window"}
                          aria-label={floatState === "min" ? "Restore window" : "Minimise window"}
                          onClick={() =>
                            setFloatState(floatState === "min" ? "window" : "min")
                          }
                        >
                          {floatState === "min" ? (
                            <ChevronDown className="size-3.5" />
                          ) : (
                            <Minus className="size-3.5" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-6"
                          title={floatState === "max" ? "Restore window" : "Maximise window"}
                          aria-label={floatState === "max" ? "Restore window" : "Maximise window"}
                          onClick={() =>
                            setFloatState(floatState === "max" ? "window" : "max")
                          }
                        >
                          {floatState === "max" ? (
                            <Minimize className="size-3.5" />
                          ) : (
                            <Maximize className="size-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {floatState === "window" ? (
                      <>
                        {/* Every edge and corner resizes, with generous hit areas */}
                        <div
                          onPointerDown={(event) => startFloatDrag(event, "n")}
                          className="pointer-events-auto absolute left-0 top-0 h-2 w-full touch-none cursor-ns-resize"
                          title="Drag to change the window height"
                        />
                        <div
                          onPointerDown={(event) => startFloatDrag(event, "s")}
                          className="pointer-events-auto absolute bottom-0 left-0 h-2.5 w-full touch-none cursor-ns-resize"
                          title="Drag to change the window height"
                        />
                        <div
                          onPointerDown={(event) => startFloatDrag(event, "w")}
                          className="pointer-events-auto absolute left-0 top-0 h-full w-2.5 touch-none cursor-ew-resize"
                          title="Drag to change the window width"
                        />
                        <div
                          onPointerDown={(event) => startFloatDrag(event, "e")}
                          className="pointer-events-auto absolute right-0 top-0 h-full w-2.5 touch-none cursor-ew-resize"
                          title="Drag to change the window width"
                        />
                        <div
                          onPointerDown={(event) => startFloatDrag(event, "nw")}
                          className="pointer-events-auto absolute left-0 top-0 size-6 touch-none cursor-nwse-resize"
                          title="Drag to stretch this window"
                        />
                        <div
                          onPointerDown={(event) => startFloatDrag(event, "ne")}
                          className="pointer-events-auto absolute right-0 top-0 size-6 touch-none cursor-nesw-resize"
                          title="Drag to stretch this window"
                        />
                        <div
                          onPointerDown={(event) => startFloatDrag(event, "sw")}
                          className="pointer-events-auto absolute bottom-0 left-0 size-8 touch-none cursor-nesw-resize rounded-tr border-r border-t bg-muted/80"
                          title="Drag to stretch this window"
                        />
                        <div
                          onPointerDown={(event) => startFloatDrag(event, "se")}
                          className="pointer-events-auto absolute bottom-0 right-0 size-8 touch-none cursor-nwse-resize rounded-tl border-l border-t bg-muted/80"
                          title="Drag to stretch this window"
                        />
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })()
          ) : (

          <div
            ref={rowRef}
            className="flex min-w-0 flex-col gap-2 lg:h-full lg:min-h-0 lg:flex-1 lg:flex-row lg:gap-0"
          >
            {/* Lesson canvas — resizable pane */}
            <div
              className={`lg:h-full lg:min-h-0 ${paneMode === "doc" ? "hidden" : "min-h-[70vh] lg:min-h-0"}`}
              style={canvasStyle}
            >
              {canvasNode}
            </div>

            {/* Drag handle + minimise / maximise pane controls */}
            <div
              role="separator"
              aria-orientation="vertical"
              onPointerDown={(event) => {
                if ((event.target as HTMLElement).closest("button")) return;
                startDrag(event);
              }}
              onDoubleClick={() => setPaneMode("split")}
              className="group hidden w-5 shrink-0 cursor-col-resize flex-col items-center justify-center gap-1 lg:flex"
              title="Drag to resize, double-click to reset"
            >
              <button
                type="button"
                aria-label={paneMode === "canvas" ? "Back to split screen" : "Expand lesson canvas"}
                title={paneMode === "canvas" ? "Back to split screen" : "Expand lesson canvas"}
                onClick={() => setPaneMode(paneMode === "canvas" ? "split" : "canvas")}
                className="rounded border bg-background p-0.5 text-muted-foreground hover:text-primary"
              >
                {paneMode === "canvas" ? (
                  <ChevronRight className="size-3" />
                ) : (
                  <ChevronLeft className="size-3" />
                )}
              </button>
              <div
                className="h-10 w-1 rounded-full bg-border transition-colors group-hover:bg-primary"
              />
              <button
                type="button"
                aria-label={paneMode === "doc" ? "Back to split screen" : "Expand document"}
                title={paneMode === "doc" ? "Back to split screen" : "Expand document"}
                onClick={() => setPaneMode(paneMode === "doc" ? "split" : "doc")}
                className="rounded border bg-background p-0.5 text-muted-foreground hover:text-primary"
              >
                {paneMode === "doc" ? (
                  <ChevronLeft className="size-3" />
                ) : (
                  <ChevronRight className="size-3" />
                )}
              </button>
            </div>

            {/* Document — resizable pane */}
            <div
              className={`flex flex-col lg:min-h-0 ${
                paneMode === "canvas" ? "hidden" : "min-h-[70vh] lg:min-h-0"
              } lg:h-full`}
              style={docStyle}
            >
              {docNode}
            </div>
          </div>
          )}


          <div className="shrink-0 lg:ml-2 lg:h-full lg:min-h-0">
            {tutorOpen ? (
              <div className="flex h-full min-h-[420px] flex-col lg:w-[340px]">
                <div className="relative h-full min-h-0 flex-1">
                  <LessonTutorBar
                    classId={classId}
                    sectionId={active.id}
                    concept={concept}
                    onConceptHandled={() => setConcept(null)}
                    turns={tutorTurns}
                    onTurnsChange={setTutorTurns}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute right-1 top-1 z-10 size-7"
                    title="Collapse AI tutor"
                    aria-label="Collapse AI tutor"
                    onClick={() => setTutorOpen(false)}
                  >
                    <PanelRightClose className="size-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="icon"
                variant="outline"
                className="lg:mt-1"
                title="Open AI tutor"
                aria-label="Open AI tutor"
                onClick={() => setTutorOpen(true)}
              >
                <PanelRightOpen className="size-4" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function UnitPlanDialog({ unit, onSaved }: { unit: WorkspaceUnit; onSaved: () => void }) {
  const save = useServerFn(updateUnit);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(unit.title);
  const [description, setDescription] = useState(unit.description ?? "");
  const [start, setStart] = useState(unit.planned_start ?? "");
  const [end, setEnd] = useState(unit.planned_end ?? "");
  const [classes, setClasses] = useState(String(unit.planned_classes ?? ""));

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          unitId: unit.id,
          title: title.trim(),
          description,
          plannedStart: start || null,
          plannedEnd: end || null,
          plannedClasses: classes ? Number(classes) : null,
        },
      }),
    onSuccess: () => {
      toast.success("Unit plan updated");
      setOpen(false);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Edit unit plan
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unit plan</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="plan-title">Unit title</Label>
            <Input id="plan-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="plan-start">Start date</Label>
              <Input
                id="plan-start"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-end">End date</Label>
              <Input
                id="plan-end"
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-classes">Classes</Label>
              <Input
                id="plan-classes"
                type="number"
                min={0}
                value={classes}
                onChange={(e) => setClasses(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan-description">Description</Label>
            <Textarea
              id="plan-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={!title.trim() || mutation.isPending}>
            Save plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Inline schedule strip for the ACTIVE section inside the lesson workspace.
// Each section keeps its own teaching dates and lesson count; the unit plan is
// shown as a fallback when a section has no schedule of its own.
type PlanSection = {
  id: string;
  title: string;
  planned_start?: string | null;
  planned_end?: string | null;
  planned_classes?: number | null;
};

function sectionPlanLine(section: PlanSection, unit: WorkspaceUnit) {
  const start = section.planned_start ?? null;
  const end = section.planned_end ?? null;
  const count = section.planned_classes ?? null;
  if (!start && !end && count === null) return `Unit plan · ${planLine(unit)}`;
  const dates = start && end ? `${start} → ${end}` : start || end || "Dates not set";
  const classes =
    count && count > 0 ? `${count} lesson${count === 1 ? "" : "s"}` : "Lessons not set";
  return `${dates} · ${classes}`;
}

function PlanStrip({
  unit,
  section,
  canManage,
  onSaved,
}: {
  unit: WorkspaceUnit;
  section: PlanSection;
  canManage: boolean;
  onSaved: () => void;
}) {
  const save = useServerFn(updateSection);
  const [start, setStart] = useState(section.planned_start ?? "");
  const [end, setEnd] = useState(section.planned_end ?? "");
  const [classes, setClasses] = useState(String(section.planned_classes ?? ""));

  const dirty =
    start !== (section.planned_start ?? "") ||
    end !== (section.planned_end ?? "") ||
    classes !== String(section.planned_classes ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          sectionId: section.id,
          plannedStart: start || null,
          plannedEnd: end || null,
          plannedClasses: classes ? Number(classes) : null,
        },
      }),
    onSuccess: () => {
      toast.success(`Schedule updated for ${section.title}`);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-muted/40 px-4 py-1.5 text-xs">
      <span className="flex items-center gap-1 font-medium text-muted-foreground">
        <CalendarDays className="size-3.5" />
        {section.title} · schedule for this section
      </span>
      {canManage ? (
        <>
          <label className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Dates</span>
            <Input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="h-7 w-[140px] text-xs"
              aria-label="Section start date"
            />
            <span className="text-muted-foreground">→</span>
            <Input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="h-7 w-[140px] text-xs"
              aria-label="Section end date"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Lessons</span>
            <Input
              type="number"
              min={0}
              value={classes}
              onChange={(e) => setClasses(e.target.value)}
              className="h-7 w-[70px] text-xs"
              aria-label="Number of lessons for this section"
            />
          </label>
          {dirty ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              Save schedule
            </Button>
          ) : null}
        </>
      ) : (
        <span className="text-muted-foreground">{sectionPlanLine(section, unit)}</span>
      )}
    </div>
  );
}

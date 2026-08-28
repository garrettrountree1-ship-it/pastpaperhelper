import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CalendarDays, PanelRightClose, PanelRightOpen, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { LessonTutorBar } from "@/components/materials/LessonTutorBar";
import { NotesCanvas } from "@/components/materials/NotesCanvas";
import { PdfDocView } from "@/components/materials/PdfDocView";
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
import { getMaterialUrl, updateUnit } from "@/lib/materials.functions";
import {
  createSection,
  deleteSection,
  listSections,
  updateSection,
} from "@/lib/notes.functions";

type UnitMaterial = {
  id: string;
  title: string;
  kind: string;
  storage_path: string | null;
  external_url: string | null;
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
  const [tutorOpen, setTutorOpen] = useState(true);

  // Draggable divider between the lesson canvas and the document pane.
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [split, setSplit] = useState(50);

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const row = rowRef.current;
    if (!row) return;
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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-2">
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
            list.map((section) => (
              <Button
                key={section.id}
                size="sm"
                variant={section.id === active?.id ? "default" : "outline"}
                onClick={() => setActiveId(section.id)}
              >
                {section.title}
              </Button>
            ))
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
        </div>
      </header>

      <PlanStrip unit={unit} sectionCount={list.length} canManage={canManage} onSaved={onUnitChanged} />

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
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 lg:flex-row lg:overflow-hidden">
          <div
            ref={rowRef}
            className="flex min-w-0 flex-col gap-2 lg:h-full lg:min-h-0 lg:flex-1 lg:flex-row lg:gap-0"
          >
          {/* Lesson canvas — resizable left half */}
          <div
            className="min-h-[70vh] lg:h-full lg:min-h-0"
            style={{ width: `${split}%` }}
          >

            <NotesCanvas
              classId={classId}
              sectionId={active.id}
              canEdit={canManage}
              initialBlocks={active.notes_blocks}
              initialSummary={active.ai_summary}
              initialTab={initialTab}
              onConcept={(value) => {
                setConcept(value);
                setTutorOpen(true);
              }}
              onSaved={invalidateSections}
            />
          </div>

          {/* Drag handle between canvas and document */}
          <div
            role="separator"
            aria-orientation="vertical"
            onPointerDown={startDrag}
            className="group hidden w-2 shrink-0 cursor-col-resize items-center justify-center lg:flex"
          >
            <div className="h-16 w-1 rounded-full bg-border transition-colors group-hover:bg-primary" />
          </div>

          {/* Document — resizable right half */}
          <div
            className="flex min-h-[70vh] flex-col rounded-lg border bg-card lg:h-full lg:min-h-0"
            style={{ width: `calc(${100 - split}% - 0.5rem)` }}
          >
            <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
              <p className="text-sm font-medium">Document</p>
              {canManage ? (
                <Select
                  value={currentDocId ?? "none"}
                  onValueChange={(value) => {
                    setDocOverride(value === "none" ? null : value);
                    attachMutation.mutate(value === "none" ? null : value);
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
              ) : (
                <span className="ml-auto truncate text-xs text-muted-foreground">
                  {material?.title ?? "None attached"}
                </span>
              )}
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
              ) : (
                <PdfDocView
                  url={docUrl.data.url}
                  title={material.title}
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
          </div>



          <div className="shrink-0 lg:ml-2 lg:h-full lg:min-h-0">
            {tutorOpen ? (
              <div className="flex h-full min-h-[420px] flex-col lg:w-[340px]">
                <div className="relative h-full min-h-0 flex-1">
                  <LessonTutorBar
                    classId={classId}
                    sectionId={active.id}
                    concept={concept}
                    onConceptHandled={() => setConcept(null)}
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
              <Input id="plan-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
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

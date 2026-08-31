import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Download,
  FileText,
  Film,
  Image as ImageIcon,
  Link2,
  Presentation,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { OfficeDocView } from "@/components/materials/OfficeDocView";
import { prerenderUploadedMaterial } from "@/lib/office-prerender";
import { PdfDocView } from "@/components/materials/PdfDocView";
import { docFormat } from "@/lib/doc-kind";

import { LessonWorkspace } from "@/components/materials/LessonWorkspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatDueDate } from "@/lib/datetime";
import {
  addMaterial,
  createUnit,
  deleteMaterial,
  deleteUnit,
  getMaterialUrl,
  setMaterialDownload,
  listMaterialClasses,
  listUnits,
  type MaterialKind,
} from "@/lib/materials.functions";

type Material = {
  id: string;
  title: string;
  kind: string;
  storage_path: string | null;
  external_url: string | null;
  file_name: string | null;
  file_size: number | null;
  content_type: string | null;
  allow_download?: boolean;
  created_at: string;
};

const kindIcons: Record<string, typeof FileText> = {
  slides: Presentation,
  video: Film,
  image: ImageIcon,
  link: Link2,
  document: FileText,
};

function kindForFile(file: File): MaterialKind {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("image/")) return "image";
  if (name.endsWith(".ppt") || name.endsWith(".pptx") || name.endsWith(".key")) return "slides";
  return "document";
}

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function MaterialsSection({
  classId,
  role,
}: {
  classId: string;
  role: "teacher" | "student";
}) {
  const classes = useQuery({
    queryKey: ["material-classes"],
    queryFn: useServerFn(listMaterialClasses),
  });
  const selected = (classes.data ?? []).find((c) => c.id === classId) ?? null;

  if (classes.isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="space-y-4">
      <div className="paper p-5">
        <h2 className="text-3xl">Class materials</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {role === "teacher"
            ? "Group this class's resources into units. Students can view them in the app or download them."
            : "Open a unit to view slides, videos and resources from your teacher."}
        </p>
      </div>

      <UnitList
        classId={classId}
        canManage={role === "teacher" && Boolean(selected?.canManage)}
      />
    </div>
  );
}


function UnitList({ classId, canManage }: { classId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const fetchUnits = useServerFn(listUnits);
  const units = useQuery({
    queryKey: ["class-units", classId],
    queryFn: () => fetchUnits({ data: { classId } }),
  });
  const create = useServerFn(createUnit);
  const removeUnit = useServerFn(deleteUnit);
  const [open, setOpen] = useState(false);
  const [openUnitId, setOpenUnitId] = useState<string | null>(null);
  const [openMaterialId, setOpenMaterialId] = useState<string | null>(null);
  const [openTab, setOpenTab] = useState<"notes" | "summary">("notes");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["class-units", classId] });

  const createMutation = useMutation({
    mutationFn: () => create({ data: { classId, title, description } }),
    onSuccess: () => {
      toast.success("Unit created");
      setOpen(false);
      setTitle("");
      setDescription("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (unitId: string) => removeUnit({ data: { unitId } }),
    onSuccess: () => {
      toast.success("Unit deleted");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (units.isLoading) return <Skeleton className="h-40 w-full" />;

  const openUnit = (units.data ?? []).find((unit) => unit.id === openUnitId);
  if (openUnit) {
    return (
      <LessonWorkspace
        classId={classId}
        unit={openUnit}
        canManage={canManage}
        initialMaterialId={openMaterialId}
        initialTab={openTab}
        onBack={() => {
          setOpenUnitId(null);
          setOpenMaterialId(null);
          setOpenTab("notes");
        }}
        onUnitChanged={invalidate}
      />
    );
  }

  return (
    <div className="space-y-4">
      {canManage ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>New unit</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New unit</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="unit-title">Unit title</Label>
                <Input
                  id="unit-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Unit 3 — Rates of reaction"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit-description">Description (optional)</Label>
                <Textarea
                  id="unit-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="What this unit covers"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!title.trim() || createMutation.isPending}
              >
                Create unit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {(units.data ?? []).length === 0 ? (
        <div className="paper p-8 text-center text-muted-foreground">
          {canManage ? "No units yet. Create your first unit." : "No materials posted yet."}
        </div>
      ) : (
        (units.data ?? []).map((unit) => (
          <section key={unit.id} className="paper p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
              <div>
                <h3 className="font-display text-2xl">{unit.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[
                    unit.planned_start && unit.planned_end
                      ? `${unit.planned_start} → ${unit.planned_end}`
                      : unit.planned_start || unit.planned_end || null,
                    unit.planned_classes ? `${unit.planned_classes} classes planned` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "No dates or class count set yet"}
                </p>
                {unit.description ? (
                  <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                    {unit.description}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setOpenTab("notes");
                    setOpenUnitId(unit.id);
                  }}
                >
                  {canManage ? "Open lesson workspace" : "Open lesson notes"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setOpenTab("summary");
                    setOpenUnitId(unit.id);
                  }}
                >
                  <Sparkles className="size-4" />
                  AI notes
                </Button>
                {canManage ? (
                  <>
                    <UploadDialog classId={classId} unitId={unit.id} onDone={invalidate} />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Delete "${unit.title}" and all of its resources?`)) {
                          deleteMutation.mutate(unit.id);
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </>
                ) : null}
              </div>
            </div>

            {unit.materials.length === 0 ? (
              <p className="pt-4 text-sm text-muted-foreground">Nothing in this unit yet.</p>
            ) : (
              <ul className="divide-y">
                {unit.materials.map((material) => (
                  <MaterialRow
                    key={material.id}
                    material={material}
                    canManage={canManage}
                    onDeleted={invalidate}
                  />
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  );
}

function MaterialRow({
  material,
  canManage,
  onDeleted,
}: {
  material: Material;
  canManage: boolean;
  onDeleted: () => void;
}) {
  const Icon = kindIcons[material.kind] ?? FileText;
  const viewerFormat = docFormat(material.storage_path ?? material.file_name ?? material.title);
  const getUrl = useServerFn(getMaterialUrl);
  const remove = useServerFn(deleteMaterial);
  const setDownload = useServerFn(setMaterialDownload);
  const [allowDownload, setAllowDownload] = useState(material.allow_download !== false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function open(download: boolean) {
    setBusy(true);
    try {
      const { url } = await getUrl({ data: { materialId: material.id, download } });
      if (download || material.external_url || viewerFormat === "legacy") {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        setViewerUrl(url);
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <button
        type="button"
        onClick={() => open(false)}
        disabled={busy}
        className="flex min-w-0 flex-1 items-center gap-3 text-left transition-colors hover:text-primary"
      >
        <Icon className="size-5 shrink-0 text-accent" />
        <span className="min-w-0">
          <span className="block truncate font-medium">{material.title}</span>
          <span className="block text-xs text-muted-foreground">
            {[
              material.kind,
              formatSize(material.file_size),
              formatDueDate(material.created_at),
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
      </button>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{material.kind}</Badge>
        {material.storage_path && (canManage || allowDownload) ? (
          <Button variant="outline" size="sm" onClick={() => open(true)} disabled={busy}>
            <Download className="size-4" />
          </Button>
        ) : null}
        {canManage && material.storage_path ? (
          <Label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              checked={allowDownload}
              onCheckedChange={async (next) => {
                setAllowDownload(next);
                try {
                  await setDownload({ data: { materialId: material.id, allow: next } });
                  toast.success(next ? "Students can download this" : "Downloads blocked");
                } catch (error) {
                  setAllowDownload(!next);
                  toast.error((error as Error).message);
                }
              }}
            />
            Student download
          </Label>
        ) : null}
        {canManage ? (
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (!confirm(`Remove "${material.title}"?`)) return;
              try {
                await remove({ data: { materialId: material.id } });
                toast.success("Removed");
                onDeleted();
              } catch (error) {
                toast.error((error as Error).message);
              }
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        ) : null}
      </div>

      <Dialog open={Boolean(viewerUrl)} onOpenChange={(next) => !next && setViewerUrl(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{material.title}</DialogTitle>
          </DialogHeader>
          {viewerUrl ? (
            material.kind === "video" ? (
              <video src={viewerUrl} controls className="max-h-[70vh] w-full rounded-md" />
            ) : material.kind === "image" ? (
              <img
                src={viewerUrl}
                alt={material.title}
                className="max-h-[70vh] w-full rounded-md object-contain"
              />
            ) : viewerFormat === "pptx" || viewerFormat === "docx" ? (
              <div className="h-[70vh]">
                <OfficeDocView
                  url={viewerUrl}
                  title={material.title}
                  cacheKey={`material:${material.id}`}
                  materialId={material.id}
                  canPrepareShared={canManage}
                  canDownload={canManage || allowDownload}
                  format={viewerFormat === "pptx" ? "pptx" : "docx"}
                />
              </div>
            ) : viewerFormat === "pdf" ? (
              <div className="h-[70vh]">
                <PdfDocView
                  url={viewerUrl}
                  title={material.title}
                  canDownload={canManage || allowDownload}
                  cacheKey={`material:${material.id}`}
                />
              </div>
            ) : (
              <iframe src={viewerUrl} title={material.title} className="h-[70vh] w-full rounded-md" />
            )
          ) : null}
        </DialogContent>
      </Dialog>
    </li>
  );
}

function UploadDialog({
  classId,
  unitId,
  onDone,
}: {
  classId: string;
  unitId: string;
  onDone: () => void;
}) {
  const record = useServerFn(addMaterial);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"file" | "link">("file");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      if (mode === "link") {
        await record({
          data: { unitId, classId, title: title.trim() || url, kind: "link", externalUrl: url },
        });
      } else {
        if (!file) throw new Error("Choose a file first.");
        if (file.size > 45 * 1024 * 1024) {
          throw new Error(
            "That file is larger than 45 MB. Please compress it or split it before uploading.",
          );
        }
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${classId}/${unitId}/${crypto.randomUUID()}-${safeName}`;
        const { error } = await supabase.storage
          .from("class-materials")
          .upload(path, file, {
            contentType: file.type || "application/octet-stream",
            upsert: true,
          });
        if (error) throw new Error(`Upload failed: ${error.message}`);
        const created = await record({
          data: {
            unitId,
            classId,
            title: title.trim() || file.name,
            kind: kindForFile(file),
            storagePath: path,
            fileName: file.name,
            fileSize: file.size,
            contentType: file.type || "application/octet-stream",
          },
        });

        // Prepare the slides/document once, now, so the first person who opens
        // it (teacher or student) sees it instantly instead of waiting.
        const format = docFormat(file.name);
        if (created?.id && (format === "pptx" || format === "docx")) {
          void prerenderUploadedMaterial(created.id, file, format)
            .then(() => toast.success("Slides prepared — they will open instantly now."))
            .catch(() => undefined);
        }
      }
      toast.success("Added");
      setOpen(false);
      setTitle("");
      setFile(null);
      setUrl("");
      onDone();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Add resource</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add resource</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={mode === "file" ? "default" : "outline"}
              onClick={() => setMode("file")}
            >
              Upload file
            </Button>
            <Button
              size="sm"
              variant={mode === "link" ? "default" : "outline"}
              onClick={() => setMode("link")}
            >
              Add link
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="material-title">Title (optional)</Label>
            <Input
              id="material-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Lesson 1 slides"
            />
          </div>

          {mode === "file" ? (
            <div className="space-y-2">
              <Label htmlFor="material-file">File</Label>
              <Input
                id="material-file"
                type="file"
                accept=".pdf,.ppt,.pptx,.key,.doc,.docx,.mp4,.mov,.webm,.png,.jpg,.jpeg,.gif,.txt,.csv,.xlsx"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                Slides, PDFs, documents, images and videos. Students can view or download them.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="material-url">Link</Label>
              <Input
                id="material-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://…"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy || (mode === "file" ? !file : !url.trim())}>
            {busy ? "Adding…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

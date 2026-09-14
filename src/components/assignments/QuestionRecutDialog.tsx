import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, Crop, Minus, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { listRecutPages } from "@/lib/app.functions";
import { pageWithoutCrop, parseCropFragment, withCrop, type SnipCrop } from "@/lib/snip-crop";

type Props = {
  imagePaths: string[];
  imageUrls: string[];
  onSave: (imagePaths: string[], imageUrls: string[]) => void | Promise<void>;
  saving?: boolean;
  /** "Recut" by default; use "Recut answer" for the mark-scheme picture. */
  label?: string;
  /** Any page of the same paper, used to start a cut when none exists yet. */
  sourcePath?: string;
  /** Which sheet to cut from when starting a brand-new cut. */
  sheet?: "question" | "answer";
};

type Piece = { path: string; url: string; crop: SnipCrop };

/** Mark-scheme lines sit very close together, so a cut may be a thin strip. */
const MIN_HEIGHT = 0.006;
const NUDGE = 0.002;
const MAX_PIECES = 3;

export function QuestionRecutDialog({
  imagePaths,
  imageUrls,
  onSave,
  saving = false,
  label = "Recut",
  sourcePath,
  sheet,
}: Props) {
  const [open, setOpen] = useState(false);
  const [piece, setPiece] = useState(0);
  const initial = useMemo<Piece[]>(
    () =>
      imagePaths.map((path, index) => ({
        path,
        url: imageUrls[index] ?? "",
        crop: parseCropFragment(imageUrls[index] ?? path) ?? { top: 0, bottom: 1 },
      })),
    [imagePaths, imageUrls],
  );
  const [pieces, setPieces] = useState<Piece[]>(initial);

  const fetchPages = useServerFn(listRecutPages);
  const firstPath = imagePaths[0] ?? sourcePath ?? "";
  const pagesQuery = useQuery({
    queryKey: ["recut-pages", pageWithoutCrop(firstPath), sheet ?? "same"],
    queryFn: () => fetchPages({ data: { imagePath: firstPath, sheet } }),
    enabled: open && Boolean(firstPath),
    staleTime: 60 * 60 * 1000,
  });
  const pages = pagesQuery.data?.pages ?? [];

  useEffect(() => {
    if (!open) return;
    setPieces(initial);
    setPiece(0);
  }, [open, initial]);

  // Starting from nothing: begin at the top of the first page of the right
  // sheet so the teacher can drag the two cut lines onto the printed answer.
  useEffect(() => {
    if (!open || pieces.length > 0) return;
    const first = pages[0];
    if (!first) return;
    setPieces([{ path: first.path, url: first.url, crop: { top: 0, bottom: 0.2 } }]);
    setPiece(0);
  }, [open, pages, pieces.length]);

  if (imagePaths.length !== imageUrls.length) return null;
  if (imagePaths.length === 0 && !sourcePath) return null;

  const current = pieces[piece];
  const pageIndex = current ? pages.findIndex((p) => p.path === pageWithoutCrop(current.path)) : -1;

  function update(next: Partial<SnipCrop>) {
    setPieces((list) =>
      list.map((value, index) => {
        if (index !== piece) return value;
        const top = Math.min(next.top ?? value.crop.top, value.crop.bottom - MIN_HEIGHT);
        const bottom = Math.max(next.bottom ?? value.crop.bottom, top + MIN_HEIGHT);
        return {
          ...value,
          crop: { top: Math.max(0, top), bottom: Math.min(1, bottom) },
        };
      }),
    );
  }

  function movePage(step: number) {
    const target = pages[pageIndex + step];
    if (!target) return;
    setPieces((list) =>
      list.map((value, index) =>
        index === piece ? { ...value, path: target.path, url: target.url } : value,
      ),
    );
  }

  function addPiece() {
    const active = pieces[piece];
    if (!active) return;
    const nextPage = pages[pageIndex + 1] ?? pages[pageIndex];
    const source = nextPage ?? {
      path: pageWithoutCrop(active.path),
      url: pageWithoutCrop(active.url),
    };
    setPieces((list) => [
      ...list,
      // A question continuing over a page break starts at the very top of the
      // next page, so begin there and let the teacher set where it ends.
      { path: source.path, url: source.url, crop: { top: 0, bottom: 0.2 } },
    ]);
    setPiece(pieces.length);
  }

  function removePiece(index: number) {
    setPieces((list) => list.filter((_, i) => i !== index));
    setPiece((value) => (value >= index && value > 0 ? value - 1 : value));
  }

  async function save() {
    await onSave(
      pieces.map((item) => withCrop(item.path, item.crop, true)),
      pieces.map((item) => withCrop(item.url, item.crop, true)),
    );
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" size="sm">
          <Crop />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[94vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{label === "Recut" ? "Recut question" : label}</DialogTitle>
        </DialogHeader>

        {!current ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {pagesQuery.isLoading ? "Opening the original page…" : "No original page was found."}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {pieces.map((item, index) => (
                <div key={`${item.path}-${index}`} className="flex items-center">
                  <Button
                    type="button"
                    size="sm"
                    variant={piece === index ? "default" : "outline"}
                    onClick={() => setPiece(index)}
                  >
                    Piece {index + 1}
                  </Button>
                  {pieces.length > 1 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      title="Remove this piece"
                      aria-label={`Remove piece ${index + 1}`}
                      onClick={() => removePiece(index)}
                    >
                      <X className="size-3" />
                    </Button>
                  ) : null}
                </div>
              ))}
              {pieces.length < MAX_PIECES ? (
                <Button type="button" size="sm" variant="outline" onClick={addPiece}>
                  <Plus className="size-3" />
                  Add a page
                </Button>
              ) : null}
            </div>

            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_15rem]">
              <div className="relative mx-auto w-full max-w-2xl overflow-hidden border border-border bg-card">
                <img
                  src={pageWithoutCrop(current.url)}
                  alt="Full original paper page"
                  className="block w-full"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 bg-foreground/45"
                  style={{ height: `${current.crop.top * 100}%` }}
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 bottom-0 bg-foreground/45"
                  style={{ height: `${(1 - current.crop.bottom) * 100}%` }}
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 border-y-2 border-primary"
                  style={{
                    top: `${current.crop.top * 100}%`,
                    height: `${(current.crop.bottom - current.crop.top) * 100}%`,
                  }}
                />
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <Label>Page</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label="Previous page"
                      disabled={pageIndex <= 0}
                      onClick={() => movePage(-1)}
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <span className="min-w-24 text-center text-sm text-muted-foreground">
                      {pagesQuery.isLoading
                        ? "Loading…"
                        : pageIndex >= 0
                          ? `Page ${pages[pageIndex]?.number} of ${pages.length}`
                          : "This page"}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label="Next page"
                      disabled={pageIndex < 0 || pageIndex >= pages.length - 1}
                      onClick={() => movePage(1)}
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recut-top">Top cut</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Move the top cut up a little"
                      onClick={() => update({ top: current.crop.top - NUDGE })}
                    >
                      <Minus className="size-3" />
                    </Button>
                    <Slider
                      id="recut-top"
                      min={0}
                      max={1000}
                      value={[Math.round(current.crop.top * 1000)]}
                      onValueChange={(value) => update({ top: (value[0] ?? 0) / 1000 })}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Move the top cut down a little"
                      onClick={() => update({ top: current.crop.top + NUDGE })}
                    >
                      <Plus className="size-3" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recut-bottom">Bottom cut</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Move the bottom cut up a little"
                      onClick={() => update({ bottom: current.crop.bottom - NUDGE })}
                    >
                      <Minus className="size-3" />
                    </Button>
                    <Slider
                      id="recut-bottom"
                      min={0}
                      max={1000}
                      value={[Math.round(current.crop.bottom * 1000)]}
                      onValueChange={(value) => update({ bottom: (value[0] ?? 1000) / 1000 })}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Move the bottom cut down a little"
                      onClick={() => update({ bottom: current.crop.bottom + NUDGE })}
                    >
                      <Plus className="size-3" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Use the small + and − buttons for fine, line-by-line cuts. Keep every letter and
                  diagram inside the clear area, and stop before the next answer begins.
                </p>
              </div>
            </div>
          </>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={saving || !current} onClick={() => void save()}>
            {saving ? "Saving…" : "Save recut"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

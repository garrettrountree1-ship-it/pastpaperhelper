import { Crop } from "lucide-react";
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
import { pageWithoutCrop, parseCropFragment, withCrop, type SnipCrop } from "@/lib/snip-crop";

type Props = {
  imagePaths: string[];
  imageUrls: string[];
  onSave: (imagePaths: string[], imageUrls: string[]) => void | Promise<void>;
  saving?: boolean;
};

const MIN_HEIGHT = 0.035;

export function QuestionRecutDialog({ imagePaths, imageUrls, onSave, saving = false }: Props) {
  const [open, setOpen] = useState(false);
  const [piece, setPiece] = useState(0);
  const initial = useMemo(
    () => imageUrls.map((url) => parseCropFragment(url) ?? { top: 0, bottom: 1 }),
    [imageUrls],
  );
  const [bands, setBands] = useState<SnipCrop[]>(initial);

  useEffect(() => {
    if (!open) return;
    setBands(initial);
    setPiece(0);
  }, [open, initial]);

  const url = imageUrls[piece];
  const band = bands[piece];
  if (!url || !band || imagePaths.length !== imageUrls.length) return null;

  function update(next: Partial<SnipCrop>) {
    setBands((current) =>
      current.map((value, index) => {
        if (index !== piece) return value;
        const top = Math.min(next.top ?? value.top, value.bottom - MIN_HEIGHT);
        const bottom = Math.max(next.bottom ?? value.bottom, top + MIN_HEIGHT);
        return { top: Math.max(0, top), bottom: Math.min(1, bottom) };
      }),
    );
  }

  async function save() {
    await onSave(
      imagePaths.map((path, index) => withCrop(path, bands[index] ?? { top: 0, bottom: 1 }, true)),
      imageUrls.map((imageUrl, index) => withCrop(imageUrl, bands[index] ?? { top: 0, bottom: 1 }, true)),
    );
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" size="sm">
          <Crop />
          Recut
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[94vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Recut question</DialogTitle>
        </DialogHeader>

        {imageUrls.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {imageUrls.map((_, index) => (
              <Button
                key={imagePaths[index] ?? index}
                type="button"
                size="sm"
                variant={piece === index ? "default" : "outline"}
                onClick={() => setPiece(index)}
              >
                Page piece {index + 1}
              </Button>
            ))}
          </div>
        ) : null}

        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_15rem]">
          <div className="relative mx-auto w-full max-w-2xl overflow-hidden border border-border bg-card">
            <img src={pageWithoutCrop(url)} alt="Full original paper page" className="block w-full" />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 bg-foreground/45"
              style={{ height: `${band.top * 100}%` }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 bg-foreground/45"
              style={{ height: `${(1 - band.bottom) * 100}%` }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 border-y-2 border-primary"
              style={{ top: `${band.top * 100}%`, height: `${(band.bottom - band.top) * 100}%` }}
            />
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="recut-top">Top cut</Label>
              <Slider
                id="recut-top"
                min={0}
                max={1000}
                value={[Math.round(band.top * 1000)]}
                onValueChange={(value) => update({ top: (value[0] ?? 0) / 1000 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recut-bottom">Bottom cut</Label>
              <Slider
                id="recut-bottom"
                min={0}
                max={1000}
                value={[Math.round(band.bottom * 1000)]}
                onValueChange={(value) => update({ bottom: (value[0] ?? 1000) / 1000 })}
              />
            </div>
            <p className="text-xs text-muted-foreground">Keep every letter and diagram inside the clear area. End after the mark value.</p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save recut"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
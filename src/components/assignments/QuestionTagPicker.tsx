import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QuestionTagBadge } from "@/components/assignments/QuestionTagBadge";

/** Shrinks an uploaded logo so it can be stored with the question. */
async function fileToSmallDataUrl(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that picture."));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not read that picture."));
    el.src = dataUrl;
  });
  const maxH = 48;
  const scale = Math.min(1, maxH / (img.naturalHeight || maxH));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round((img.naturalWidth || maxH) * scale));
  canvas.height = Math.max(1, Math.round((img.naturalHeight || maxH) * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

/**
 * Teacher-only control that puts a mark beside a question: the ready-made blue
 * HL square, the teacher's own letters, or an uploaded logo.
 */
export function QuestionTagPicker({
  tagLabel,
  tagImage,
  onChange,
}: {
  tagLabel: string;
  tagImage: string;
  onChange: (patch: { tagLabel: string; tagImage: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const marked = Boolean(tagLabel.trim() || tagImage);
  const isHl = tagLabel.trim().toUpperCase() === "HL";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant={isHl ? "default" : "outline"}
        size="sm"
        aria-pressed={isHl}
        onClick={() =>
          isHl
            ? onChange({ tagLabel: "", tagImage: "" })
            : onChange({ tagLabel: "HL", tagImage: "" })
        }
      >
        {isHl ? <QuestionTagBadge label="HL" /> : null}
        {isHl ? "HL only — click to remove" : "Mark this question HL"}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
        Own label
      </Button>
      {marked ? (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          Shown:
          <QuestionTagBadge label={tagLabel} image={tagImage} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => onChange({ tagLabel: "", tagImage: "" })}
          >
            Clear
          </Button>
        </span>
      ) : null}
      {open ? (
        <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-border p-2">
          <Input
            value={tagImage ? "" : tagLabel}
            onChange={(event) => onChange({ tagLabel: event.target.value.slice(0, 6), tagImage: "" })}
            placeholder="Letters, e.g. HL"
            className="w-32"
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              const image = await fileToSmallDataUrl(file);
              onChange({ tagLabel: tagLabel.trim() || "", tagImage: image });
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            Upload a logo
          </Button>
        </div>
      ) : null}
    </div>
  );
}

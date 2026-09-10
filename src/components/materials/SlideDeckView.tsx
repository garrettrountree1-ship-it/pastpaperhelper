import { useState } from "react";

import { OfficeDocView } from "@/components/materials/OfficeDocView";
import { PowerPointView } from "@/components/materials/PowerPointView";
import { Button } from "@/components/ui/button";
import { useMirrorField } from "@/lib/lesson-mirror";

/**
 * Slide decks can be read two ways, and teachers and students both get the
 * choice: the original PowerPoint view (Microsoft's own renderer, exact
 * fidelity) or a scrolling stack of slides. Drawing and text-box markup is
 * available in both views.
 */
export function SlideDeckView({
  url,
  title,
  cacheKey,
  materialId,
  canPrepareShared = false,
  canDownload = true,
}: {
  url: string;
  title: string;
  cacheKey?: string;
  materialId?: string;
  canPrepareShared?: boolean;
  canDownload?: boolean;
}) {
  const [mode, setMode] = useState<"original" | "scroll">("original");
  useMirrorField(`deck.mode:${cacheKey ?? title}`, mode, setMode);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-1">
        {(
          [
            ["original", "Original PowerPoint"],
            ["scroll", "Scroll slides"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={mode === value ? "default" : "outline"}
            className="h-7 px-2 text-xs"
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="min-h-0 flex-1">
        {mode === "original" ? (
          <PowerPointView
            url={url}
            title={title}
            canDownload={canDownload}
            {...(cacheKey ? { markupKey: cacheKey } : {})}
          />
        ) : (
          <OfficeDocView
            url={url}
            title={title}
            format="pptx"
            canDownload={canDownload}
            canPrepareShared={canPrepareShared}
            {...(cacheKey ? { cacheKey } : {})}
            {...(materialId ? { materialId } : {})}
          />
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { displayablePhotoUrl, looksHeic } from "@/lib/heic";

/**
 * A student's handed-in photo. iPhone HEIC pictures are converted in the
 * browser so they actually appear, and clicking a photo opens it larger on the
 * page instead of downloading it.
 */
export function StudentWorkPhoto({
  url,
  alt = "Student working",
  className = "size-20 rounded border border-border object-cover",
}: {
  url: string;
  alt?: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(looksHeic(url) ? null : url);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!looksHeic(url)) {
      setSrc(url);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    void displayablePhotoUrl(url)
      .then((ready) => {
        if (cancelled) {
          URL.revokeObjectURL(ready);
          return;
        }
        objectUrl = ready;
        setSrc(ready);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (failed) {
    return (
      <span className="flex size-20 items-center justify-center rounded border border-dashed border-border p-1 text-center text-[10px] text-muted-foreground">
        Photo can&apos;t be shown
      </span>
    );
  }

  if (!src) {
    return <span className="block size-20 animate-pulse rounded border border-border bg-muted" />;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Click to see this photo larger"
        className="rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <img src={src} alt={alt} loading="lazy" className={className} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <img src={src} alt={alt} className="max-h-[80vh] w-full object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}

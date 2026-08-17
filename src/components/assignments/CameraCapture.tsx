import { Camera, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Live device-camera capture (laptop webcam, tablet or phone). The captured
 * frame is attached as an image file, exactly like an uploaded photo.
 */
export function CameraCapture({
  disabled = false,
  onCapture,
}: {
  disabled?: boolean;
  onCapture: (file: File) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [open, setOpen] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [error, setError] = useState<string | null>(null);

  function stop() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  useEffect(() => {
    if (!open) {
      stop();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setError(null);
      } catch {
        setError(
          "We couldn't open the camera. Allow camera access in your browser, or upload a photo instead.",
        );
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [open, facing]);

  function shoot() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      onCapture(new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" }));
    }, "image/jpeg", 0.92);
  }

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Camera className="size-4" />
        Use my camera
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <video
        ref={videoRef}
        playsInline
        muted
        className="w-full rounded-md border border-border bg-black"
      />
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={shoot} disabled={disabled || !!error}>
          <Camera className="size-4" />
          Take photo
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setFacing((value) => (value === "environment" ? "user" : "environment"))}
        >
          <RefreshCw className="size-4" />
          Switch camera
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          <X className="size-4" />
          Close camera
        </Button>
      </div>
    </div>
  );
}

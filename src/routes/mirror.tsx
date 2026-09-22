import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Maximize, Minimize, MonitorPlay } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AliasAvatar } from "@/components/games/AliasAvatar";
import { MaterialsSection } from "@/components/materials/MaterialsSection";
import { FormativeCheckPanel } from "@/components/materials/FormativeCheck";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { openMirrorChannel, type MirrorHandle } from "@/lib/mirror-channel";
import { joinPublicMirror, mirrorHeartbeat } from "@/lib/mirror.functions";


type JoinedMirror = {
  classId: string;
  className: string;
  code: string;
  studentName: string;
  claimToken: string;
  alias: string | null;
  presenterIds: string[];
};

type Announcement = {
  from?: string;
  viewActive?: boolean;
  view?: Record<string, unknown>;
};

export const Route = createFileRoute("/mirror")({
  head: () => ({
    meta: [
      { title: "Class Mirror · PastPaperHelper.AI" },
      { name: "description", content: "Enter a class code to watch your teacher's live board." },
    ],
  }),
  component: PublicMirrorPage,
});

function PublicMirrorPage() {
  const join = useServerFn(joinPublicMirror);
  const heartbeat = useServerFn(mirrorHeartbeat);
  const [code, setCode] = useState(() =>
    typeof window === "undefined" ? "" : (window.localStorage.getItem("class-mirror-code") ?? ""),
  );
  const [name, setName] = useState(() =>
    typeof window === "undefined" ? "" : (window.localStorage.getItem("class-mirror-name") ?? ""),
  );
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState<JoinedMirror | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const handleRef = useRef<MirrorHandle | null>(null);

  useEffect(() => {
    const onChange = () => setFullScreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Keeps this seat alive so the same roster name cannot be taken elsewhere.
  // A dropped connection or an expired seat quietly re-joins with the same
  // name instead of leaving the page stuck on a failed request.
  useEffect(() => {
    if (!joined?.claimToken) return;
    const token = joined.claimToken;
    const rejoin = async () => {
      try {
        const result = await join({
          data: { code: joined.code, name: joined.studentName, claimToken: token },
        });
        window.localStorage.setItem("class-mirror-token", result.claimToken);
        setJoined(result);
      } catch {
        // Try again on the next check-in.
      }
    };
    const beat = () => {
      void heartbeat({ data: { claimToken: token } }).catch(() => rejoin());
    };
    const timer = window.setInterval(beat, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", beat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", beat);
    };
  }, [joined?.claimToken, joined?.code, joined?.studentName, heartbeat, join]);


  useEffect(() => {
    if (!joined) return;
    const trusted = new Set(joined.presenterIds);

    const handle = openMirrorChannel(`lesson-mirror:${joined.classId}`, {
      onLesson: (payload) => {
        const message = payload as Announcement;
        if (!message.from || !trusted.has(message.from)) return;
        setLive(Boolean(message.viewActive));
        const nextUnit = message.view?.["workspace.unitId"];
        if (typeof nextUnit === "string") setUnitId(nextUnit);
      },
      onSubscribed: () => handle.send("hello", {}),
    });
    handleRef.current = handle;
    const helloTimer = window.setInterval(() => handle.send("hello", {}), 2000);

    return () => {
      window.clearInterval(helloTimer);
      handleRef.current = null;
      handle.close();
    };
  }, [joined]);


  const enter = async () => {
    if (!code.trim() || !name.trim()) return;
    setJoining(true);
    try {
      const saved = window.localStorage.getItem("class-mirror-token") ?? undefined;
      const result = await join({
        data: { code, name, ...(saved ? { claimToken: saved } : {}) },
      });
      window.localStorage.setItem("class-mirror-code", result.code);
      window.localStorage.setItem("class-mirror-name", result.studentName);
      window.localStorage.setItem("class-mirror-token", result.claimToken);
      setJoined(result);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setJoining(false);
    }
  };

  if (!joined) {
    return (
      <main className="grid min-h-screen place-items-center bg-muted/30 p-4">
        <form
          className="paper w-full max-w-md p-6 sm:p-8"
          onSubmit={(event) => {
            event.preventDefault();
            void enter();
          }}
        >
          <MonitorPlay className="size-10 text-primary" />
          <h1 className="mt-4 font-display text-3xl">Class Mirror</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            No account or sign-in is needed. Enter the code on your teacher&apos;s screen and your
            roster name. Your name and assigned class avatar will identify formative answers.
          </p>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mirror-code">Class code</Label>
              <Input
                id="mirror-code"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="ABCD12"
                autoCapitalize="characters"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mirror-name">Your class roster name</Label>
              <Input
                id="mirror-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            </div>
            <Button
              className="w-full"
              type="submit"
              disabled={joining || !code.trim() || !name.trim()}
            >
              {joining ? "Joining…" : "Watch class"}
            </Button>
          </div>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <FormativeCheckPanel classId={joined.classId} asStudent mirrorToken={joined.claimToken} />
      <div className="fixed right-3 top-3 z-[100] flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void document.documentElement.requestFullscreen();
          }}
        >
          {fullScreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
          {fullScreen ? "Exit full screen" : "Full screen"}
        </Button>
      </div>
      {!unitId || !live ? (
        <div className="grid min-h-screen place-items-center p-6 text-center">
          <div className="paper max-w-xl p-8">
            <MonitorPlay className="mx-auto size-12 text-primary" />
            <h1 className="mt-4 font-display text-3xl">{joined.className}</h1>
            <div className="mt-3 flex items-center justify-center gap-2">
              {joined.alias ? <AliasAvatar alias={joined.alias} size={34} /> : null}
              <p className="font-medium">{joined.studentName}</p>
            </div>
            <p className="mt-2 text-muted-foreground">
              Your formative answers are recorded under this roster identity. This page will start
              following the teacher when they click <strong>Mirror to students</strong>.
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              Keeping the mirror teacher-controlled reduces bandwidth. Live mirroring itself uses no
              AI tokens; AI is used only when a formative answer is marked.
            </p>
          </div>
        </div>
      ) : (
        <MaterialsSection
          classId={joined.classId}
          role="student"
          mirrorUnitId={unitId}
          externalMirror
        />
      )}
    </main>
  );
}

import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The former signed-in presentation page now forwards everyone to the single
 * public Class Mirror entrance. Keeping the old URL as a redirect means saved
 * bookmarks still work without maintaining a second mirror implementation.
 */
export const Route = createFileRoute("/_authenticated/present/$code")({
  beforeLoad: () => {
    throw redirect({ to: "/mirror" });
  },
  component: () => null,
});

/** A stable destination students can type once and leave open for the lesson. */
function PresentationPage() {
  const { code } = Route.useParams();
  const lookup = useServerFn(getPresentationClass);
  const details = useQuery({
    queryKey: ["presentation-class", code.toUpperCase()],
    queryFn: () => lookup({ data: { code } }),
    staleTime: 30 * 60 * 1000,
  });
  const [unitId, setUnitId] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!details.data) return;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let helloTimer: number | null = null;
    const trusted = new Set(details.data.presenterIds);

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) await supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;

      channel = supabase.channel(`lesson-mirror:${details.data.classId}`, {
        config: { broadcast: { self: false } },
      });
      channelRef.current = channel;
      channel.on("broadcast", { event: "lesson" }, ({ payload }) => {
        const message = payload as Announcement;
        if (!message.from || !trusted.has(message.from)) return;
        const nextUnit = message.view?.["workspace.unitId"];
        if (typeof nextUnit === "string") setUnitId(nextUnit);
      });
      channel.subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        if (helloTimer) window.clearInterval(helloTimer);
        const hello = () => void channel?.send({ type: "broadcast", event: "hello", payload: {} });
        hello();
        helloTimer = window.setInterval(hello, 2000);
      });
    })();

    return () => {
      cancelled = true;
      if (helloTimer) window.clearInterval(helloTimer);
      channelRef.current = null;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [details.data]);

  if (details.isPending) {
    return (
      <div className="min-h-screen">
        <AppHeader role="student" />
        <main className="mx-auto max-w-3xl p-6">
          <Skeleton className="h-48" />
        </main>
      </div>
    );
  }
  if (details.isError || !details.data) {
    return (
      <div className="min-h-screen">
        <AppHeader role="student" />
        <main className="mx-auto max-w-xl p-8 text-center">
          <p className="text-muted-foreground">
            {(details.error as Error)?.message ?? "Presentation not found."}
          </p>
          <Button className="mt-4" onClick={() => details.refetch()}>
            Try again
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {!unitId ? <AppHeader role="student" /> : null}
      <main className={unitId ? "" : "mx-auto max-w-3xl p-6"}>
        {unitId ? (
          <MaterialsSection classId={details.data.classId} role="student" mirrorUnitId={unitId} />
        ) : (
          <div className="paper mt-10 p-8 text-center">
            <MonitorPlay className="mx-auto size-10 text-primary" />
            <h1 className="mt-4 font-display text-3xl">{details.data.className}</h1>
            <p className="mt-2 text-muted-foreground">
              This screen is ready. It will open automatically when your teacher starts sharing.
            </p>
            <p className="mt-5 text-sm font-medium">Presentation code: {details.data.code}</p>
          </div>
        )}
      </main>
    </div>
  );
}

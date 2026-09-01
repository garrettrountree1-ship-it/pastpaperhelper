import { Link, createFileRoute } from "@tanstack/react-router";
import {
  BookOpenCheck,
  BotMessageSquare,
  Clock,
  Eye,
  FileText,
  Gamepad2,
  GraduationCap,
  Highlighter,
  Lock,
  MessageSquare,
  MonitorPlay,
  PenTool,
  Presentation,
  ShieldAlert,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Brand } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo";
import lessonWorkspaceImg from "@/assets/lesson-workspace.png.asset.json";
import originalPptImg from "@/assets/original-ppt-view.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PastPaperHelper.AI — Past-paper homework & live lesson teaching" },
      {
        name: "description",
        content:
          "Two classroom tools in one: past papers marked by the mark scheme with a Socratic AI tutor, and a split-screen lesson workspace for slides, notes and annotation. Quizzes and games included.",
      },
      { property: "og:title", content: "PastPaperHelper.AI — Homework and lessons in one place" },
      {
        property: "og:description",
        content:
          "Mark-scheme AI marking with a built-in tutor, plus a split-screen lesson workspace for PDFs, PowerPoints and live notes. Timed quizzes and class games too.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const pillars = [
  {
    key: "homework",
    icon: FileText,
    kicker: "Pillar one",
    title: "Past-paper homework",
    headline: "Marked by the mark scheme, taught by an AI tutor.",
    points: [
      "Upload the paper and mark scheme — combined or separate, tidy or a messy compilation. Questions, marks and diagrams are aligned automatically.",
      "Students answer by typing, photo of handwritten working, or on-screen writing pad. Vision marking reads all three.",
      "Wrong answers get leading questions and smaller steps — never the answer — and students retry until they earn the marks.",
    ],
    stats: [
      { icon: BookOpenCheck, label: "Point-by-point marking" },
      { icon: BotMessageSquare, label: "Socratic tutor, unlimited follow-ups" },
      { icon: Eye, label: "Every attempt, photo and chat logged" },
    ],
  },
  {
    key: "materials",
    icon: Presentation,
    kicker: "Pillar two",
    title: "Class presentation",
    headline: "A split-screen lesson workspace you teach live from.",
    points: [
      "Build units from PDFs, PowerPoints, Word docs, videos and links — viewed in high fidelity, exactly as uploaded.",
      "Lesson canvas on the left to type, draw and paste images; the document on the right with draw, text-box and highlight tools over any file.",
      "The AI lesson tutor sits permanently beside both, private to each teacher and student, and can summarise everything written and drawn.",
    ],
    stats: [
      { icon: MonitorPlay, label: "Original PowerPoint or scrollable slides" },
      { icon: Highlighter, label: "Annotate PDFs, docs and decks" },
      { icon: PenTool, label: "Infinite teacher notes canvas" },
    ],
  },
];

const alsoIncluded = [
  {
    icon: Clock,
    title: "Quizzes",
    body: "Release a timed quiz when the class is ready. No hints, no tutor, no feedback while the clock runs — results and the mark scheme unlock when time is up.",
  },
  {
    icon: Gamepad2,
    title: "Games",
    body: "Anonymous animal aliases, token leaderboards, head-to-head past-paper challenges and a daily double that appears once a day.",
  },
];

const integrity = [
  {
    icon: ShieldAlert,
    title: "AI & plagiarism filter",
    body: "Paste, drag-and-drop and AI-written text are detected and rejected. Repeat attempts auto-lock the assignment.",
  },
  {
    icon: Lock,
    title: "You hold the keys",
    body: "Unlock a student, apply a deduction, extend a due date for the class or one student, credit or remove a question.",
  },
  {
    icon: MessageSquare,
    title: "Bulletins & messaging",
    body: "Post class announcements; students message you about a specific question. Students can never message each other.",
  },
];

const steps = [
  { step: "1", title: "Create your class", body: "Pick curriculum and subject, then share the class code." },
  { step: "2", title: "Add a paper or a unit", body: "Upload past papers, or build a unit of slides and resources." },
  { step: "3", title: "Teach and set homework", body: "Present from the workspace; students work with the tutor." },
  { step: "4", title: "Review everything", body: "Gradebook with attempts, time, photos, chats — export to Excel." },
];

function Landing() {
  const [demoLoading, setDemoLoading] = useState(false);

  // If a session already exists (e.g. returning from Google OAuth), go straight in.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) window.location.assign("/dashboard");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        window.location.assign("/dashboard");
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleDemoLogin() {
    if (demoLoading) return;
    setDemoLoading(true);
    try {
      // Make sure a stale/partial session can't block the demo sign-in.
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);

      const { data, error } = await supabase.auth.signInWithPassword({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      });
      if (error || !data.session) {
        toast.error(error?.message ?? "Could not open the demo account. Please try again.");
        setDemoLoading(false);
        return;
      }

      // Wait until the session is readable before entering the protected area,
      // otherwise the auth gate can bounce back to the sign-in page.
      for (let i = 0; i < 20; i += 1) {
        const { data: current } = await supabase.auth.getSession();
        if (current.session) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      window.location.assign("/dashboard");
    } catch (err) {
      console.error("[demo-login]", err);
      toast.error("Could not open the demo account. Please try again.");
      setDemoLoading(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Brand />
        <div className="flex gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/auth" search={{ mode: "signup" }}>
              Get started
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20">
        {/* Hero */}
        <section className="py-12 lg:py-16">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            IGCSE · A-Level · IB
          </p>
          <h1 className="mt-4 max-w-4xl text-4xl leading-[1.05] sm:text-5xl lg:text-6xl">
            Teach the lesson. Set the past paper. One place for both.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            PastPaperHelper.AI gives every class two things that work together: a live
            split-screen lesson workspace for your slides and notes, and past-paper homework that
            marks itself against the mark scheme and coaches each student until they can earn the
            marks.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth" search={{ mode: "signup" }}>
                Create an account
              </Link>
            </Button>
            <Button size="lg" variant="secondary" onClick={handleDemoLogin} disabled={demoLoading}>
              {demoLoading ? "Signing in..." : "Try the demo"}
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/auth">I have a class code</Link>
            </Button>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {pillars.map((pillar) => (
              <div key={pillar.key} className="paper flex items-start gap-4 p-5">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <pillar.icon className="size-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg leading-tight">{pillar.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{pillar.headline}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Pillar one: homework */}
        <section className="mt-6 space-y-10">
          {pillars.map((pillar, index) => (
            <article key={pillar.key} className="paper overflow-hidden">
              <div className="grid lg:grid-cols-2">
                <div className={`p-6 sm:p-8 lg:p-10 ${index === 1 ? "lg:order-2" : ""}`}>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    {pillar.kicker} · {pillar.title}
                  </p>
                  <h2 className="mt-3 text-2xl sm:text-3xl">{pillar.headline}</h2>
                  <ul className="mt-5 space-y-3">
                    {pillar.points.map((point) => (
                      <li key={point} className="flex gap-3 text-sm text-muted-foreground">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                  <ul className="mt-6 flex flex-wrap gap-2 text-xs">
                    {pillar.stats.map((stat) => (
                      <li
                        key={stat.label}
                        className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-card-foreground"
                      >
                        <stat.icon className="size-3.5 text-primary" />
                        {stat.label}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className={`bg-muted/40 p-4 sm:p-6 ${index === 1 ? "lg:order-1" : ""}`}>
                  {pillar.key === "materials" ? (
                    <div className="grid h-full gap-3 sm:grid-cols-2">
                      <img
                        src={lessonWorkspaceImg.url}
                        alt="Split-screen lesson workspace with notes canvas, PowerPoint slide and AI lesson tutor"
                        loading="lazy"
                        className="h-full w-full rounded-lg border border-border object-contain shadow-paper"
                      />
                      <img
                        src={originalPptImg.url}
                        alt="Original PowerPoint view shown inside the lesson materials panel"
                        loading="lazy"
                        className="h-full w-full rounded-lg border border-border object-contain shadow-paper"
                      />
                    </div>
                  ) : (
                    <div className="ink-panel h-full p-5">
                      <p className="text-xs uppercase tracking-[0.2em] opacity-70">Live coaching</p>
                      <div className="mt-4 space-y-3 text-sm">
                        <div className="rounded-lg bg-primary-foreground/10 p-3">
                          <p className="opacity-70">Question · 4 marks</p>
                          <p className="mt-1">Explain why the rate of reaction decreases over time.</p>
                        </div>
                        <div className="rounded-lg bg-primary-foreground/10 p-3">
                          <p className="opacity-70">Student</p>
                          <p className="mt-1">Because the reaction gets colder.</p>
                        </div>
                        <div className="rounded-lg bg-accent p-3 text-accent-foreground">
                          <p className="text-xs font-semibold uppercase tracking-wide">
                            1 / 4 · keep going
                          </p>
                          <p className="mt-1">
                            What happens to the number of reactant particles in the flask as the
                            reaction proceeds?
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
        </section>

        {/* Upload once */}
        <section className="paper mt-14 p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent/60">
              <Upload className="size-6 text-accent-foreground" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl">Upload once, use it both ways</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                The same class holds your teaching resources and your homework. Present a unit in
                the lesson workspace, then set questions from the paper you just taught — students
                move between materials and homework from one sidebar.
              </p>
            </div>
          </div>
        </section>

        {/* Also included */}
        <section className="mt-14">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Also included
          </p>
          <h2 className="mt-2 text-2xl sm:text-3xl">Quizzes and games, in the same class</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {alsoIncluded.map((item) => (
              <article key={item.title} className="paper p-6">
                <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
                  <item.icon className="size-5 text-primary" />
                </div>
                <h3 className="mt-4 text-lg">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Integrity */}
        <section className="mt-14">
          <h2 className="text-2xl sm:text-3xl">You stay in control</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {integrity.map((item) => (
              <article key={item.title} className="paper p-6">
                <item.icon className="size-6 text-destructive" />
                <h3 className="mt-4 text-lg">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="paper mt-14 p-6 sm:p-8">
          <h2 className="text-2xl sm:text-3xl">How it works</h2>
          <ol className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((item) => (
              <li key={item.step} className="flex gap-4">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary font-display text-primary-foreground">
                  {item.step}
                </span>
                <div>
                  <h3 className="text-lg leading-tight">{item.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* CTA */}
        <section className="paper mt-14 p-8 text-center">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
              <GraduationCap className="size-6 text-primary" />
            </div>
            <h2 className="text-2xl sm:text-3xl">See it from both sides</h2>
            <p className="text-muted-foreground">
              Open the demo account, teach from the lesson workspace, then switch to the student
              view to see exactly what your class sees.
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg">
                <Link to="/auth" search={{ mode: "signup" }}>
                  Create an account
                </Link>
              </Button>
              <Button size="lg" variant="secondary" onClick={handleDemoLogin} disabled={demoLoading}>
                {demoLoading ? "Signing in..." : "Try the demo"}
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/auth">Sign in</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        PastPaperHelper.AI · lessons taught, homework marked.
      </footer>
    </div>
  );
}

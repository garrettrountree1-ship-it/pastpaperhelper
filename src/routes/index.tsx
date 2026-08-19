import { Link, createFileRoute } from "@tanstack/react-router";
import {
  BookOpenCheck,
  BotMessageSquare,
  Camera,
  Clock,
  Eye,
  FileText,
  FolderArchive,
  Gamepad2,
  GraduationCap,
  Languages,
  Lock,
  MessageSquare,
  PenTool,
  ShieldAlert,
  Sparkles,
  Upload,
  Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Brand } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "STEM Homework AI — Past-paper homework that teaches, for IG, A-Level & IB" },
      {
        name: "description",
        content:
          "Upload past papers and mark schemes. AI marks against the mark scheme, coaches every student with a built-in tutor, and blocks copied or AI-written work.",
      },
      { property: "og:title", content: "STEM Homework AI — Past-paper homework that teaches" },
      {
        property: "og:description",
        content:
          "AI marking, a Socratic tutor, anti-copying controls, quizzes, games and class materials — all built for IGCSE, A-Level and IB teachers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const pillars = [
  {
    icon: Upload,
    title: "Upload past papers",
    body: "Drop in the paper and mark scheme as combined or separate PDFs. AI aligns the questions, marks and diagrams into a ready assignment.",
  },
  {
    icon: BookOpenCheck,
    title: "Marked by the mark scheme",
    body: "Every answer is checked point-by-point against the official mark scheme. Students see which marks they earned, not the answer wording.",
  },
  {
    icon: BotMessageSquare,
    title: "A built-in AI tutor",
    body: "Wrong answers get Socratic leading questions and smaller steps. The tutor never reveals the answer, and students can ask follow-ups until it clicks.",
  },
];

const sections = [
  {
    icon: FileText,
    title: "Homework",
    body: "Past-paper questions with AI marking, unlimited retries and full per-student history.",
  },
  {
    icon: Clock,
    title: "Quizzes",
    body: "Timed, in-class quizzes with no AI help. Release when the class is ready and review results instantly.",
  },
  {
    icon: FolderArchive,
    title: "Class materials",
    body: "Organise units of slides, videos, PDFs and links for students to view or download.",
  },
  {
    icon: Gamepad2,
    title: "Games",
    body: "Head-to-head challenges and the daily double with anonymous animal aliases, leaderboards and tokens.",
  },
];

const studentTools = [
  {
    icon: Languages,
    title: "Translated key vocabulary",
    body: "Hover over a key word for a translation, or open the vocab sheet for a deeper explanation with images.",
  },
  {
    icon: Camera,
    title: "Photo working",
    body: "For calculations and diagrams, students upload a photo of their handwritten work or draw on a stylus pad.",
  },
  {
    icon: PenTool,
    title: "Drawing pad",
    body: "Students can sketch graphs, diagrams and working directly on screen with a stylus or finger.",
  },
];

const teacherControls = [
  {
    icon: ShieldAlert,
    title: "AI & plagiarism filter",
    body: "Copy-paste, drag-and-drop and AI-written text are detected and rejected. After a set number of warnings, the homework auto-locks.",
  },
  {
    icon: Lock,
    title: "Lock and unlock",
    body: "Teachers control when a cheating student can continue, and can apply a percentage deduction on re-entry.",
  },
  {
    icon: Eye,
    title: "Full visibility",
    body: "See every attempt, time spent, photo upload, tutor chat and integrity warning in the gradebook.",
  },
];

const steps = [
  {
    step: "1",
    title: "Create your class",
    body: "Pick the curriculum and subject, then share the class code with students.",
  },
  {
    step: "2",
    title: "Upload a paper",
    body: "Add the past paper and mark scheme — or write your own questions — and publish.",
  },
  {
    step: "3",
    title: "Students work and learn",
    body: "They answer, get marked, are coached by the tutor and retry until they earn the marks.",
  },
  {
    step: "4",
    title: "Review and control",
    body: "Open the gradebook, message students, adjust due dates and manage integrity flags.",
  },
];

function Landing() {
  const [demoLoading, setDemoLoading] = useState(false);

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
        <section className="-mx-4 sm:mx-0">
          <div className="grid items-center gap-10 px-4 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                IGCSE · A-Level · IB
              </p>
              <h1 className="mt-4 text-4xl leading-[1.05] sm:text-5xl lg:text-6xl">
                Homework that marks, teaches, and stays honest.
              </h1>
              <p className="mt-6 max-w-xl text-lg text-muted-foreground">
                Upload real past papers with their mark schemes. Students answer and get instant,
                point-by-point AI marking. A built-in tutor then coaches them with leading questions
                until they can earn the marks themselves.
              </p>
              <ul className="mt-6 flex flex-wrap gap-2 text-sm">
                {[
                  "AI marking",
                  "Socratic tutor",
                  "Copy-paste blocked",
                  "AI & plagiarism detection",
                  "Full student history",
                ].map((chip) => (
                  <li
                    key={chip}
                    className="rounded-full border border-border bg-card/80 px-3 py-1 text-card-foreground"
                  >
                    {chip}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link to="/auth" search={{ mode: "signup" }}>
                    Create a teacher account
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/auth">I have a class code</Link>
                </Button>
              </div>
            </div>

            <div className="ink-panel p-6 shadow-lift">
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
                  <p className="text-xs font-semibold uppercase tracking-wide">1 / 4 · keep going</p>
                  <p className="mt-1">
                    What happens to the number of reactant particles in the flask as the reaction
                    proceeds?
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-14">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl sm:text-3xl">The core idea</h2>
            <p className="mt-2 text-muted-foreground">
              Three things that make every assignment teach, instead of just test.
            </p>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {pillars.map((feature) => (
              <article key={feature.title} className="paper p-6 text-center">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent/60">
                  <feature.icon className="size-6 text-accent-foreground" />
                </div>
                <h3 className="mt-4 text-xl">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-14">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl sm:text-3xl">Four sections, one class</h2>
            <p className="mt-2 text-muted-foreground">
              After logging in, teachers and students move between homework, quizzes, materials and games
              from a single sidebar.
            </p>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {sections.map((section) => (
              <article key={section.title} className="paper flex gap-4 p-5">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <section.icon className="size-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl">{section.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{section.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-14">
          <h2 className="text-2xl sm:text-3xl">How students learn</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            The workspace is built for effort and understanding, not shortcuts.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {studentTools.map((tool) => (
              <article key={tool.title} className="paper p-6">
                <tool.icon className="size-6 text-accent" />
                <h3 className="mt-4 text-lg">{tool.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{tool.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-14">
          <h2 className="text-2xl sm:text-3xl">You stay in control</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Integrity and visibility are built in, not bolted on.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {teacherControls.map((item) => (
              <article key={item.title} className="paper border-destructive/30 p-6">
                <item.icon className="size-6 text-destructive" />
                <h3 className="mt-4 text-lg">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
              </article>
            ))}
          </div>
          <div className="paper mt-4 p-6">
            <div className="flex items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary">
                <MessageSquare className="size-6 text-secondary-foreground" />
              </div>
              <div>
                <h3 className="text-lg">Announcements and one-to-one messaging</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Teachers post class bulletins, and students can message the teacher about a specific
                  question. Students can never message each other.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="paper mt-14 p-6">
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

        <section className="paper mt-14 p-8 text-center">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
              <GraduationCap className="size-6 text-primary" />
            </div>
            <h2 className="text-2xl sm:text-3xl">Try it with a demo account</h2>
            <p className="text-muted-foreground">
              Sign in with the demo teacher account and switch to the student view at any time to see
              exactly what your class will see.
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg">
                <Link to="/auth" search={{ mode: "signup" }}>
                  Create a teacher account
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/auth">Sign in</Link>
              </Button>
              <Button
                size="lg"
                variant="secondary"
                onClick={handleDemoLogin}
                disabled={demoLoading}
              >
                {demoLoading ? "Signing in..." : "Try the demo"}
              </Button>
            </div>
          </div>
        </section>

      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        STEM Homework AI · homework, marked and taught.
      </footer>
    </div>
  );
}

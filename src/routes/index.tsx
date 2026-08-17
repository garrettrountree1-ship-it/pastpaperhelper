import { Link, createFileRoute } from "@tanstack/react-router";
import { BookOpenCheck, ClipboardList, MessageCircleQuestion, Users } from "lucide-react";

import { Brand } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import marsBg from "@/assets/mars-bg.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "StepWise — Past-paper homework that teaches, for IG, A-Level & IB" },
      {
        name: "description",
        content:
          "Teachers upload past papers and mark schemes. Students answer, get marked instantly, and are coached with leading questions until they can solve it themselves.",
      },
      { property: "og:title", content: "StepWise — Past-paper homework that teaches" },
      {
        property: "og:description",
        content:
          "Mark-scheme accurate marking plus Socratic coaching for IGCSE, A-Level and IB homework.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: ClipboardList,
    title: "Set past papers as homework",
    body: "Paste any past-paper question with its official mark scheme. Group questions into an assignment for a class.",
  },
  {
    icon: BookOpenCheck,
    title: "Marked against the mark scheme",
    body: "Every answer is marked point by point against your mark scheme, with marks awarded and honest feedback.",
  },
  {
    icon: MessageCircleQuestion,
    title: "Leading questions, not answers",
    body: "When a student is wrong, the tutor probes for the misunderstanding and breaks the work into smaller steps.",
  },
  {
    icon: Users,
    title: "Teacher control, student logins",
    body: "Teachers own classes, assignments and the gradebook. Students join with a class code and see only their work.",
  },
];

function Landing() {
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
        <section className="grid items-center gap-10 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              IGCSE · A-Level · IB
            </p>
            <h1 className="mt-4 text-4xl leading-[1.05] sm:text-5xl lg:text-6xl">
              Homework that finds the <span className="highlight-underline">knowledge gap</span> and
              closes it.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              Teachers set real past-paper questions with mark schemes. Students answer, learn
              instantly whether they are right, then get coached with leading questions and smaller
              steps until the question is within reach.
            </p>
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
                <p className="text-xs font-semibold uppercase tracking-wide">
                  1 / 4 · keep going
                </p>
                <p className="mt-1">
                  What happens to the number of reactant particles in the flask as the reaction
                  proceeds?
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          {features.map((feature) => (
            <article key={feature.title} className="paper p-6">
              <feature.icon className="size-6 text-accent" />
              <h2 className="mt-4 text-xl">{feature.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{feature.body}</p>
            </article>
          ))}
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        StepWise · homework, marked and taught.
      </footer>
    </div>
  );
}

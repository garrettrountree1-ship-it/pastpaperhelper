import { Link, createFileRoute } from "@tanstack/react-router";
import {
  BookOpenCheck,
  Camera,
  ClipboardList,
  Eye,
  History,
  MessageCircleQuestion,
  ScanSearch,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";

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
          "Upload past papers and mark schemes. Students are marked point by point, coached by an AI tutor, and copy-paste plus AI-written answers are detected and blocked.",
      },
      { property: "og:title", content: "StepWise — Past-paper homework that teaches" },
      {
        property: "og:description",
        content:
          "Mark-scheme accurate marking, a built-in AI tutor, AI-copying detection, and a full history of every student answer for teachers.",
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
    title: "Upload past papers and mark schemes",
    body: "Drop in the paper and the mark scheme as PDFs — combined or separate — and the questions, marks and diagrams are lined up into a ready assignment. Or paste a single question by hand.",
  },
  {
    icon: BookOpenCheck,
    title: "Marked point by point",
    body: "Every answer is judged against your official mark scheme, mark by mark. Students see which points they earned and which they missed, never the wording of the answer.",
  },
  {
    icon: Sparkles,
    title: "A built-in AI tutor for every student",
    body: "Wrong answers get a short, subject-specific explanation of the science — never the answer. Students can then ask the tutor as many follow-up questions as they need until it clicks.",
  },
  {
    icon: MessageCircleQuestion,
    title: "Leading questions, not answers",
    body: "The tutor works out where the misunderstanding sits, then breaks the question into smaller steps and guides the student to full marks in their own words.",
  },
  {
    icon: Camera,
    title: "Photos and a writing pad for working",
    body: "Calculation and drawing questions are done on paper or on screen with a stylus. Working, graphs and diagrams are marked from the image, with partial credit for method.",
  },
  {
    icon: Users,
    title: "Teacher control, student logins",
    body: "Teachers own the classes, assignments and gradebook across IGCSE, A-Level and IB. Students join with a class code and only ever see their own work.",
  },
];

const integrity = [
  {
    icon: ShieldAlert,
    title: "No copy-paste, at all",
    body: "Pasting, dragging text and bulk autofill are blocked in every answer box and in the tutor chat. Answers have to be typed by the student.",
  },
  {
    icon: ScanSearch,
    title: "AI detection built into marking",
    body: "Every submission is screened for AI-written and web-copied phrasing before it is marked — even a single polished sentence lifted from a chatbot or a revision site is caught and rejected.",
  },
  {
    icon: History,
    title: "Three warnings, then locked",
    body: "Each flagged answer adds a warning. On the fourth the homework locks and is marked as a fail until you unlock it — with an optional percentage deduction of your choosing.",
  },
];

const visibility = [
  "Every answer a student ever submitted, attempt by attempt, with the marks and feedback given each time",
  "Every photo and stylus drawing they uploaded, saved and viewable full size",
  "Every question they typed to the AI tutor, plus the tutor's replies, in full",
  "Time spent per question, number of attempts, percentage score and class averages",
  "Integrity warnings with the exact flagged text, and one-click unlock with a deduction",
];

const steps = [
  {
    step: "1",
    title: "Create your class",
    body: "Pick the curriculum and subject. Share the class code with your students.",
  },
  {
    step: "2",
    title: "Upload the paper",
    body: "Add the past paper and mark scheme, check the questions, then publish the homework.",
  },
  {
    step: "3",
    title: "Students work and learn",
    body: "They answer, get marked, are coached by the tutor and retry until they earn the marks.",
  },
  {
    step: "4",
    title: "Review the full picture",
    body: "Open the gradebook for scores, timings, tutor chats, uploads and integrity flags.",
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
        <section className="relative -mx-4 overflow-hidden rounded-3xl sm:mx-0">
          <img
            src={marsBg}
            alt="Mars surface landscape"
            className="absolute inset-0 h-full w-full object-cover"
            width={1792}
            height={1024}
            loading="eager"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/75 to-background/40" />
          <div className="relative grid items-center gap-10 px-4 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
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

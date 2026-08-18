/** The four top-level app sections shown as blocks after login and as a left ribbon inside a section. */
export type SectionKey = "materials" | "homework" | "quizzes" | "games";

export type SectionDef = {
  key: SectionKey;
  label: string;
  to: "/materials" | "/homework" | "/quizzes" | "/games";
  blurb: string;
  teacherBlurb: string;
};

export const SECTIONS: SectionDef[] = [
  {
    key: "materials",
    label: "Class materials",
    to: "/materials",
    blurb: "Slides, lecture videos and unit resources.",
    teacherBlurb: "Create units and upload slides, videos and resources.",
  },
  {
    key: "homework",
    label: "Homework",
    to: "/homework",
    blurb: "Past-paper homework with marking and the AI tutor.",
    teacherBlurb: "Set past-paper homework and review the gradebook.",
  },
  {
    key: "quizzes",
    label: "Quizzes",
    to: "/quizzes",
    blurb: "Timed in-class quizzes released by your teacher.",
    teacherBlurb: "Build timed quizzes and release them in class.",
  },
  {
    key: "games",
    label: "Games",
    to: "/games",
    blurb: "Challenges, the daily double and the token leaderboard.",
    teacherBlurb: "Run challenges and manage the token leaderboard.",
  },
];

export function sectionByKey(key: SectionKey): SectionDef {
  return SECTIONS.find((section) => section.key === key)!;
}

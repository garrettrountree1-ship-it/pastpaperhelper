/** The four class sections shown as blocks inside a class and as a left ribbon inside a section. */
export type SectionKey = "materials" | "homework" | "quizzes" | "games";

export type SectionPath =
  | "/classes/$classId/materials"
  | "/classes/$classId/homework"
  | "/classes/$classId/quizzes"
  | "/classes/$classId/games";

export type SectionDef = {
  key: SectionKey;
  label: string;
  to: SectionPath;
  blurb: string;
  teacherBlurb: string;
};

export const SECTIONS: SectionDef[] = [
  {
    key: "materials",
    label: "Class materials",
    to: "/classes/$classId/materials",
    blurb: "Slides, lecture videos and unit resources for this class.",
    teacherBlurb: "Create units and upload slides, videos and resources for this class.",
  },
  {
    key: "homework",
    label: "Homework",
    to: "/classes/$classId/homework",
    blurb: "Past-paper homework for this class with marking and the AI tutor.",
    teacherBlurb: "Set past-paper homework for this class and review the gradebook.",
  },
  {
    key: "quizzes",
    label: "Quizzes",
    to: "/classes/$classId/quizzes",
    blurb: "Timed quizzes released by your teacher in this class.",
    teacherBlurb: "Build timed quizzes and release them to this class.",
  },
  {
    key: "games",
    label: "Games",
    to: "/classes/$classId/games",
    blurb: "Challenges, the daily double and this class's token leaderboard.",
    teacherBlurb: "Run challenges and manage this class's token leaderboard.",
  },
];

export function sectionByKey(key: SectionKey): SectionDef {
  return SECTIONS.find((section) => section.key === key)!;
}

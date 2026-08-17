/**
 * Heuristic: does this question ask for something that can't be typed
 * (a drawing, a circled/labelled item on a figure, a plotted graph)?
 */
const PHOTO_CUES = [
  "draw",
  "sketch",
  "circle",
  "shade",
  "label the",
  "add label",
  "plot",
  "complete the diagram",
  "complete the graph",
  "on the diagram",
  "on the grid",
  "on the axes",
  "on the graph",
  "mark on",
  "arrow",
  "construct",
  "show your working on",
  "annotate",
  "join the points",
  "best fit",
];

/** Maths / calculation cues — these must be worked on paper and photographed. */
const CALCULATION_CUES = [
  "calculate",
  "work out",
  "show your working",
  "show all working",
  "show that",
  "determine the value",
  "find the value",
  "evaluate",
  "solve for",
  "solve the equation",
  "give your answer to",
  "correct to",
  "significant figures",
  "decimal places",
  "how many moles",
  "number of moles",
  "concentration of",
  "percentage yield",
  "relative atomic mass",
  "molar mass",
  "use your answer",
  "using the equation",
  "substitute",
  "rearrange",
];

export function needsPhotoAnswer(questionText: string): boolean {
  const text = questionText.toLowerCase();
  return (
    PHOTO_CUES.some((cue) => text.includes(cue)) ||
    CALCULATION_CUES.some((cue) => text.includes(cue))
  );
}

/** Drawing / diagram questions — the answer only exists on paper. */
export function isDrawingQuestion(questionText: string): boolean {
  const text = questionText.toLowerCase();
  return PHOTO_CUES.some((cue) => text.includes(cue));
}

/**
 * Calculation questions are photo-only: the student works on paper, uploads it,
 * and the photo is saved for the teacher. No typed answer box is offered.
 */
export function isCalculationQuestion(questionText: string): boolean {
  const text = questionText.toLowerCase();
  return CALCULATION_CUES.some((cue) => text.includes(cue));
}

/**
 * Photo-only questions: calculations (working on paper) and any drawing,
 * sketching, circling, labelling or plotting task. Applies to every assignment.
 */
export function isPhotoOnlyQuestion(questionText: string): boolean {
  return isCalculationQuestion(questionText) || isDrawingQuestion(questionText);
}


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

export function needsPhotoAnswer(questionText: string): boolean {
  const text = questionText.toLowerCase();
  return PHOTO_CUES.some((cue) => text.includes(cue));
}

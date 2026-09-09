/** Ready-made curriculum choices offered when a teacher makes or renames a class. */
export const CURRICULUM_OPTIONS = ["IB", "IBDP", "GCSE", "IGCSE", "AP"] as const;

/** True when this class follows the IBDP course, which splits SL and HL questions. */
export function isIbdp(curriculum?: string | null) {
  return (curriculum ?? "").trim().toUpperCase() === "IBDP";
}

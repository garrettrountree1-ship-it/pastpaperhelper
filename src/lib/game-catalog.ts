/** Client-safe list of the games a teacher can switch on or off per class. */
export const GAME_KEYS = [
  "head_to_head",
  "daily_double",
  "vocab_bingo",
  "boss_question",
  "wager_round",
] as const;

export type GameKey = (typeof GAME_KEYS)[number];

export const GAME_LABELS: Record<GameKey, string> = {
  head_to_head: "Head-to-head",
  daily_double: "Daily double",
  vocab_bingo: "Vocab bingo",
  boss_question: "Boss question",
  wager_round: "Wager round",
};

export function isGameKey(value: string): value is GameKey {
  return (GAME_KEYS as readonly string[]).includes(value);
}

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getVocabBingo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ classId: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { loadVocabBingo } = await import("./game-modes.server");
    return loadVocabBingo(context.userId, data.classId);
  });

export const markBingoCell = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ cellIndex: z.number().int().min(0).max(8) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { answerVocabBingo } = await import("./game-modes.server");
    return answerVocabBingo(context.userId, data.cellIndex);
  });

export const getBossQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadBossQuestion } = await import("./game-modes.server");
    return loadBossQuestion(context.userId);
  });

export const submitBoss = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ answerText: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { ENGLISH_ONLY_MESSAGE, isEnglishOnly } = await import("./language");
    if (!isEnglishOnly(data.answerText)) throw new Error(ENGLISH_ONLY_MESSAGE);
    const { submitBossAnswer } = await import("./game-modes.server");
    return submitBossAnswer(context.userId, data.answerText);
  });

export const getWagerRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadWagerRound } = await import("./game-modes.server");
    return loadWagerRound(context.userId);
  });

export const placeWager = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ classId: z.string().uuid(), wager: z.number().int().min(1).max(2) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { startWagerRound } = await import("./game-modes.server");
    return startWagerRound(context.userId, data.classId, data.wager);
  });

export const submitWager = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ answerText: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { ENGLISH_ONLY_MESSAGE, isEnglishOnly } = await import("./language");
    if (!isEnglishOnly(data.answerText)) throw new Error(ENGLISH_ONLY_MESSAGE);
    const { submitWagerAnswer } = await import("./game-modes.server");
    return submitWagerAnswer(context.userId, data.answerText);
  });

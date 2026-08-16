/**
 * Answers and tutor questions must be written in English. This flags text that
 * contains Chinese/Japanese/Korean characters or other non-Latin scripts.
 */
const NON_ENGLISH =
  /[\u3000-\u303f\u3040-\u30ff\u3100-\u312f\u3130-\u318f\u31f0-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef\u0400-\u04ff\u0590-\u05ff\u0600-\u06ff\u0e00-\u0e7f\uac00-\ud7af]/u;

export const ENGLISH_ONLY_MESSAGE = "Please write your answer in English.";

export function isEnglishOnly(text: string): boolean {
  return !NON_ENGLISH.test(text);
}

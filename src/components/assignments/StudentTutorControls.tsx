import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setMyTutorSettings } from "@/lib/tutor-settings.functions";
import { TUTOR_LANGUAGES, TUTOR_LEVELS } from "@/lib/tutor-settings";

/**
 * Shown only when the teacher allows students to pick their own tutor level:
 * lets the student choose how much help the AI tutor gives and in which language.
 */
export function StudentTutorControls({
  classId,
  level,
  language,
  onSaved,
}: {
  classId: string;
  level: string;
  language: string;
  onSaved: () => void;
}) {
  const [current, setCurrent] = useState({ level, language });

  const save = useMutation({
    mutationFn: (input: { tutorLevel?: string; tutorLanguage?: string }) =>
      setMyTutorSettings({ data: { classId, ...input } }),
    onSuccess: () => {
      toast.success("Tutor settings updated");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const hint = TUTOR_LEVELS.find((option) => option.value === current.level)?.hint;

  return (
    <section className="paper mt-6 p-5">
      <h2 className="font-display text-lg">Your AI tutor</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Your teacher lets you choose how the tutor helps you. {hint}
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Help level</span>
          <Select
            value={current.level}
            onValueChange={(value) => {
              setCurrent((prev) => ({ ...prev, level: value }));
              save.mutate({ tutorLevel: value });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TUTOR_LEVELS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Tutor language</span>
          <Select
            value={current.language}
            onValueChange={(value) => {
              setCurrent((prev) => ({ ...prev, language: value }));
              save.mutate({ tutorLanguage: value });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TUTOR_LANGUAGES.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Your answers must still be written in English — only the tutor&apos;s replies change.
      </p>
    </section>
  );
}

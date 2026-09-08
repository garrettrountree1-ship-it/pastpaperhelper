import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getAssignmentAccessControls,
  setAssignmentAccess,
  setStudentAssignmentAccess,
} from "@/lib/app.functions";
import { PhotoModeControl } from "@/components/assignments/PhotoModeControl";
import type { PhotoMode } from "@/lib/photo-mode";
import { TUTOR_LANGUAGES } from "@/lib/tutor-settings";

const INHERIT = "__inherit__";

/** Class default / On / Off picker for Question Vocabulary Translation. */
function VocabTranslationControl({
  value,
  inheritLabel,
  disabled,
  onChange,
}: {
  value: boolean | null;
  inheritLabel: string;
  disabled?: boolean;
  onChange: (next: boolean | null) => void;
}) {
  return (
    <Select
      value={value === null ? INHERIT : value ? "on" : "off"}
      disabled={disabled === true}
      onValueChange={(next) => onChange(next === INHERIT ? null : next === "on")}
    >
      <SelectTrigger className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={INHERIT}>{inheritLabel}</SelectItem>
        <SelectItem value="on">Question vocabulary: on</SelectItem>
        <SelectItem value="off">Question vocabulary: off</SelectItem>
      </SelectContent>
    </Select>
  );
}

/**
 * Teacher panel for an assignment's language and answer-input settings: photo
 * answers, Question Vocabulary Translation, and the Vocab list translations.
 */
export function LanguageSettingsDialog({
  classId,
  assignmentId,
  trigger,
}: {
  classId: string;
  assignmentId: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const load = useServerFn(getAssignmentAccessControls);
  const saveClass = useServerFn(setAssignmentAccess);
  const saveStudent = useServerFn(setStudentAssignmentAccess);

  const controls = useQuery({
    queryKey: ["access-controls", assignmentId],
    queryFn: () => load({ data: { assignmentId } }),
    enabled: open,
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["access-controls", assignmentId] });
    queryClient.invalidateQueries({ queryKey: ["class-overview", classId] });
    queryClient.invalidateQueries({ queryKey: ["overview", classId] });
  }

  const classMutation = useMutation({
    mutationFn: (input: {
      photoMode?: PhotoMode;
      keywordTranslation?: boolean | null;
      vocabTranslation?: boolean;
      vocabLanguage?: string | null;
    }) => saveClass({ data: { assignmentId, ...input } }),
    onSuccess: () => {
      toast.success("Saved for the whole class");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const studentMutation = useMutation({
    mutationFn: (input: {
      studentId: string;
      photoMode?: PhotoMode | null;
      keywordTranslation?: boolean | null;
    }) => saveStudent({ data: { assignmentId, ...input } }),
    onSuccess: () => {
      toast.success("Saved for that student");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const data = controls.data;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>HW Language Settings</DialogTitle>
        </DialogHeader>

        {controls.isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : controls.isError ? (
          <p className="text-sm text-muted-foreground">{(controls.error as Error).message}</p>
        ) : data ? (
          <div className="space-y-6">
            <section className="rounded-lg border border-border p-4">
              <Label className="text-sm">Photo answers for this assignment</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Automatic keeps photo-only answers on drawing and calculation questions. Always on
                offers the camera and drawing pad everywhere. Off means students type every answer.
              </p>
              <div className="mt-2">
                <PhotoModeControl
                  value={data.photoMode}
                  disabled={classMutation.isPending}
                  onChange={(next) => (next ? classMutation.mutate({ photoMode: next }) : undefined)}
                />
              </div>

              <div className="mt-4 border-t border-border pt-3">
                <Label className="text-sm">Question Vocabulary Translation for this homework</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Adds a small vocabulary box under each question listing key words from that
                  question with their translation. Only single key words are listed — never whole
                  questions or answers.
                </p>
                <div className="mt-2">
                  <VocabTranslationControl
                    value={data.keywordTranslation}
                    inheritLabel="Use class setting"
                    disabled={classMutation.isPending}
                    onChange={(next) => classMutation.mutate({ keywordTranslation: next })}
                  />
                </div>
              </div>

              <div className="mt-4 border-t border-border pt-3">
                <Label className="text-sm">Vocab list translations</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Controls the translations shown in the student&apos;s Vocab list for this homework.
                  Turn them off to show English hints only.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={data.vocabTranslation}
                      disabled={classMutation.isPending}
                      onCheckedChange={(checked) =>
                        classMutation.mutate({ vocabTranslation: checked === true })
                      }
                    />
                    Translate vocab words
                  </label>
                  <Select
                    value={data.vocabLanguage ?? INHERIT}
                    disabled={classMutation.isPending || !data.vocabTranslation}
                    onValueChange={(next) =>
                      classMutation.mutate({ vocabLanguage: next === INHERIT ? null : next })
                    }
                  >
                    <SelectTrigger className="w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={INHERIT}>Class tutor language</SelectItem>
                      {TUTOR_LANGUAGES.map((language) => (
                        <SelectItem key={language} value={language}>
                          {language}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-border p-4">
              <h3 className="font-medium">Individual students</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Override the photo answers and Question Vocabulary Translation for one student only.
              </p>
              {data.students.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">No students have joined yet.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {data.students.map((student) => (
                    <div key={student.id} className="rounded-lg border border-border/70 p-3">
                      <p className="text-sm font-medium">{student.name}</p>
                      <div className="mt-2">
                        <Label className="text-xs text-muted-foreground">
                          Photo answers (assignment setting: {data.photoMode})
                        </Label>
                        <div className="mt-1">
                          <PhotoModeControl
                            value={student.photoMode}
                            allowInherit
                            disabled={studentMutation.isPending}
                            onChange={(next) =>
                              studentMutation.mutate({ studentId: student.id, photoMode: next })
                            }
                          />
                        </div>
                      </div>
                      <div className="mt-2">
                        <Label className="text-xs text-muted-foreground">
                          Question Vocabulary Translation (homework setting:{" "}
                          {data.keywordTranslation ? "on" : "off"})
                        </Label>
                        <div className="mt-1">
                          <VocabTranslationControl
                            value={student.keywordTranslation}
                            inheritLabel="Homework setting"
                            disabled={studentMutation.isPending}
                            onChange={(next) =>
                              studentMutation.mutate({
                                studentId: student.id,
                                keywordTranslation: next,
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default LanguageSettingsDialog;

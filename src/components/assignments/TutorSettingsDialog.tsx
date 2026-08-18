import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Languages } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getClassTutorSettings,
  setClassTutorSettings,
  setStudentTutorSettings,
} from "@/lib/tutor-settings.functions";
import { TUTOR_LANGUAGES, TUTOR_LEVELS } from "@/lib/tutor-settings";

const INHERIT = "__class__";

export function TutorSettingsDialog({ classId }: { classId: string }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const queryKey = ["tutor-settings", classId];

  const settings = useQuery({
    queryKey,
    queryFn: () => getClassTutorSettings({ data: { classId } }),
    enabled: open,
  });

  const saveClass = useServerFn(setClassTutorSettings);
  const saveStudent = useServerFn(setStudentTutorSettings);

  const classMutation = useMutation({
    mutationFn: (input: {
      classId: string;
      tutorLanguage?: string;
      tutorLevel?: string;
      protectQuestions?: boolean;
      keywordTranslation?: boolean;
      studentCanChangeLevel?: boolean;
      vocabTranslation?: boolean;
      vocabLanguage?: string;
    }) => saveClass({ data: input }),

    onSuccess: () => {
      toast.success("Class settings saved");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const studentMutation = useMutation({
    mutationFn: (input: {
      classId: string;
      studentId: string;
      tutorLanguage?: string | null;
      tutorLevel?: string | null;
      studentCanChangeLevel?: boolean | null;
      keywordTranslation?: boolean | null;
    }) => saveStudent({ data: input }),
    onSuccess: () => {
      toast.success("Student setting saved");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const klass = settings.data?.klass;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Languages className="mr-2 size-4" />
          Tutor &amp; language
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>AI tutor language, level and question protection</DialogTitle>
        </DialogHeader>

        {settings.isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : settings.isError ? (
          <p className="text-sm text-muted-foreground">
            {(settings.error as Error).message}
          </p>
        ) : klass ? (
          <div className="space-y-6">
            <section className="rounded-lg border border-border p-4">
              <h3 className="font-display text-lg">Whole class</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                These apply to every student unless you set an individual override below.
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Tutor language</Label>
                  <Select
                    value={klass.tutorLanguage}
                    onValueChange={(value) =>
                      classMutation.mutate({ classId, tutorLanguage: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TUTOR_LANGUAGES.map((language) => (
                        <SelectItem key={language} value={language}>
                          {language}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Students still write their exam answers in English.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Tutor level</Label>
                  <Select
                    value={klass.tutorLevel}
                    onValueChange={(value) => classMutation.mutate({ classId, tutorLevel: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TUTOR_LEVELS.map((level) => (
                        <SelectItem key={level.value} value={level.value}>
                          {level.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {TUTOR_LEVELS.find((level) => level.value === klass.tutorLevel)?.hint}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <label className="flex items-start gap-3 text-sm">
                  <Checkbox
                    checked={klass.protectQuestions}
                    onCheckedChange={(checked) =>
                      classMutation.mutate({ classId, protectQuestions: checked === true })
                    }
                  />
                  <span>
                    Block copy, paste and screenshots of questions
                    <span className="block text-xs text-muted-foreground">
                      Disables copying, right-click and printing, and hides the questions whenever
                      the student leaves the tab or presses a screenshot shortcut.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-3 text-sm">
                  <Checkbox
                    checked={klass.studentCanChangeLevel}
                    onCheckedChange={(checked) =>
                      classMutation.mutate({ classId, studentCanChangeLevel: checked === true })
                    }
                  />
                  <span>
                    Let students change their own tutor level
                    <span className="block text-xs text-muted-foreground">
                      You can still override any individual student below.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-3 text-sm">
                  <Checkbox
                    checked={klass.keywordTranslation}
                    onCheckedChange={(checked) =>
                      classMutation.mutate({ classId, keywordTranslation: checked === true })
                    }
                  />
                  <span>
                    Hover translation of key words
                    <span className="block text-xs text-muted-foreground">
                      Underlines key words in questions, tutor replies and vocab definitions so
                      students can hover for a short {klass.tutorLanguage} meaning. Turn it off for
                      individual students below.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-3 text-sm">
                  <Checkbox
                    checked={klass.vocabTranslation}
                    onCheckedChange={(checked) =>
                      classMutation.mutate({ classId, vocabTranslation: checked === true })
                    }
                  />
                  <span>
                    Translate vocabulary terms in the vocab list
                    <span className="block text-xs text-muted-foreground">
                      Only the term itself is translated — definitions and examples stay in simple
                      English at the class tutor level.
                    </span>
                  </span>
                </label>

                <div className="max-w-xs space-y-2">
                  <Label>Vocabulary translation language</Label>
                  <Select
                    value={klass.vocabLanguage}
                    onValueChange={(value) =>
                      classMutation.mutate({ classId, vocabLanguage: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
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
              <h3 className="font-display text-lg">Individual students</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Differentiate for key students. “Class default” means they follow the settings
                above, including hover translation — set a student to “Hover: off” to switch it off
                just for them, or override it for one homework in that assignment&apos;s Due date
                &amp; answer release panel.
              </p>


              {settings.data.students.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">No students have joined yet.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {settings.data.students.map((student) => (
                    <div
                      key={student.id}
                      className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1.2fr_1fr_1fr_1fr_auto] sm:items-center"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{student.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{student.email}</p>
                      </div>

                      <Select
                        value={student.tutorLanguage ?? INHERIT}
                        onValueChange={(value) =>
                          studentMutation.mutate({
                            classId,
                            studentId: student.id,
                            tutorLanguage: value === INHERIT ? null : value,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={INHERIT}>Class default</SelectItem>
                          {TUTOR_LANGUAGES.map((language) => (
                            <SelectItem key={language} value={language}>
                              {language}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={student.tutorLevel ?? INHERIT}
                        onValueChange={(value) =>
                          studentMutation.mutate({
                            classId,
                            studentId: student.id,
                            tutorLevel: value === INHERIT ? null : value,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={INHERIT}>Class default</SelectItem>
                          {TUTOR_LEVELS.map((level) => (
                            <SelectItem key={level.value} value={level.value}>
                              {level.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={
                          student.keywordTranslation === null
                            ? INHERIT
                            : student.keywordTranslation
                              ? "on"
                              : "off"
                        }
                        onValueChange={(value) =>
                          studentMutation.mutate({
                            classId,
                            studentId: student.id,
                            keywordTranslation: value === INHERIT ? null : value === "on",
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={INHERIT}>Hover: class default</SelectItem>
                          <SelectItem value="on">Hover: on</SelectItem>
                          <SelectItem value="off">Hover: off</SelectItem>
                        </SelectContent>
                      </Select>

                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Checkbox
                          checked={student.studentCanChangeLevel ?? klass.studentCanChangeLevel}
                          onCheckedChange={(checked) =>
                            studentMutation.mutate({
                              classId,
                              studentId: student.id,
                              studentCanChangeLevel: checked === true,
                            })
                          }
                        />
                        Student control
                      </label>
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

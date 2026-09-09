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
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <label className="flex items-start gap-3 text-sm">
                  <Checkbox
                    checked={klass.studentCanChangeLevel}
                    onCheckedChange={(checked) =>
                      classMutation.mutate({ classId, studentCanChangeLevel: checked === true })
                    }
                  />
                  <div className="flex flex-col">
                    <span>Students may change their level</span>
                    <span className="text-xs text-muted-foreground">
                      Let students pick their own tutor difficulty.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 text-sm">
                  <Checkbox
                    checked={klass.keywordTranslation}
                    onCheckedChange={(checked) =>
                      classMutation.mutate({ classId, keywordTranslation: checked === true })
                    }
                  />
                  <div className="flex flex-col">
                    <span>Question Vocabulary Translation</span>
                    <span className="text-xs text-muted-foreground">
                      Show translated keywords under each question.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 text-sm">
                  <Checkbox
                    checked={klass.vocabTranslation}
                    onCheckedChange={(checked) =>
                      classMutation.mutate({ classId, vocabTranslation: checked === true })
                    }
                  />
                  <div className="flex flex-col">
                    <span>Translate vocab list terms</span>
                    <span className="text-xs text-muted-foreground">
                      Translate words from the class vocabulary list.
                    </span>
                  </div>
                </label>


                <div className="max-w-xs space-y-2">
                  <Label>Translation language</Label>
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



              {settings.data.students.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">No students have joined yet.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {settings.data.students.map((student) => (
                    <div
                      key={student.id}
                      className="rounded-lg border border-border p-3"
                    >
                      <p className="truncate font-medium">{student.name}</p>

                      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">
                            Tutor language
                          </Label>
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
                              <SelectItem value={INHERIT}>
                                Class default ({klass.tutorLanguage})
                              </SelectItem>
                              {TUTOR_LANGUAGES.map((language) => (
                                <SelectItem key={language} value={language}>
                                  {language}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">
                            Tutor level
                          </Label>
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
                              <SelectItem value={INHERIT}>
                                Class default ({TUTOR_LEVELS.find((l) => l.value === klass.tutorLevel)?.label})
                              </SelectItem>
                              {TUTOR_LEVELS.map((level) => (
                                <SelectItem key={level.value} value={level.value}>
                                  {level.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">
                            Question Vocabulary Translation
                          </Label>
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
                              <SelectItem value={INHERIT}>
                                Class default ({klass.keywordTranslation ? "on" : "off"})
                              </SelectItem>
                              <SelectItem value="on">Vocabulary box: on</SelectItem>
                              <SelectItem value="off">Vocabulary box: off</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">
                            May change level
                          </Label>
                          <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
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
                            Student can change their level
                          </label>
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

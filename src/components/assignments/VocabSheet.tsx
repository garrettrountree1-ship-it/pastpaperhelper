import { useMutation, useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronLeft, Loader2 } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { explainVocabTerm, getAssignmentVocab } from "@/lib/vocab.functions";

type VocabItem = {
  term: string;
  translation: string;
  kind: "word" | "concept";
  short: string;
};

/**
 * Student-facing vocabulary list for one homework: every key word and concept
 * with the teacher's chosen translation, and a click-through in-depth
 * explanation illustrated with pictures.
 */
export function VocabSheet({ assignmentId }: { assignmentId: string }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<VocabItem | null>(null);

  const vocab = useQuery({
    queryKey: ["assignment-vocab", assignmentId],
    queryFn: () => getAssignmentVocab({ data: { assignmentId } }),
    enabled: open,
    staleTime: Infinity,
  });

  const explain = useMutation({
    mutationFn: (term: string) => explainVocabTerm({ data: { assignmentId, term } }),
  });

  function openTerm(item: VocabItem) {
    setSelected(item);
    explain.mutate(item.term);
  }

  const items = (vocab.data?.items ?? []) as VocabItem[];

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setSelected(null);
          explain.reset();
        }
      }}
    >
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <BookOpen className="mr-1 size-4" />
          Vocab list
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {selected ? (
          <>
            <SheetHeader>
              <Button
                variant="ghost"
                size="sm"
                className="w-fit px-0"
                onClick={() => {
                  setSelected(null);
                  explain.reset();
                }}
              >
                <ChevronLeft className="mr-1 size-4" />
                All vocab
              </Button>
              <SheetTitle className="text-left">{selected.term}</SheetTitle>
              <SheetDescription className="text-left">
                {explain.data?.translation || selected.translation}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 space-y-4">
              {explain.isPending ? (
                <div className="space-y-3">
                  <Skeleton className="h-40 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              ) : explain.isError ? (
                <div className="space-y-3">
                  <p className="text-sm text-destructive">
                    {(explain.error as Error).message}
                  </p>
                  <Button size="sm" onClick={() => explain.mutate(selected.term)}>
                    Try again
                  </Button>
                </div>
              ) : explain.data ? (
                <>
                  {explain.data.imageUrls.length > 0 ? (
                    <div className="space-y-3">
                      {explain.data.imageUrls.map((url) => (
                        <img
                          key={url}
                          src={url}
                          alt={`Picture explaining ${selected.term}`}
                          loading="lazy"
                          className="w-full rounded-lg border border-border bg-card object-contain"
                        />
                      ))}
                    </div>
                  ) : null}
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {explain.data.explanation}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Pictures come from Wikimedia. This explains the idea only — you still write
                    your own answer in English.
                  </p>
                </>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="text-left">Vocab &amp; concepts</SheetTitle>
              <SheetDescription className="text-left">
                Key words for this homework
                {vocab.data?.translationEnabled && vocab.data?.language
                  ? ` with ${vocab.data.language} meanings`
                  : ""}
                . Tap any word for a fuller explanation with pictures.
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 space-y-2">
              {vocab.isPending ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} className="h-14 w-full" />
                  ))}
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    Building your vocab list…
                  </p>
                </div>
              ) : vocab.isError ? (
                <div className="space-y-3">
                  <p className="text-sm text-destructive">{(vocab.error as Error).message}</p>
                  <Button size="sm" onClick={() => vocab.refetch()}>
                    Try again
                  </Button>
                </div>
              ) : items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No vocabulary has been picked out for this homework yet.
                </p>
              ) : (
                items.map((item) => (
                  <button
                    key={item.term}
                    type="button"
                    onClick={() => openTerm(item)}
                    className="w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium">{item.term}</span>
                      <Badge variant="secondary">
                        {item.kind === "concept" ? "concept" : "word"}
                      </Badge>
                    </span>
                    {item.translation ? (
                      <span className="mt-1 block text-sm text-primary">{item.translation}</span>
                    ) : null}
                    {item.short ? (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {item.short}
                      </span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

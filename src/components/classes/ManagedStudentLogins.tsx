import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Eye, EyeOff, KeyRound, Plus, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createManagedStudent,
  provisionManagedStudentLogin,
  resetManagedStudentPassword,
} from "@/lib/student-login.functions";

export function ManagedStudentLoginButton({
  classId,
  onCreated,
}: {
  classId: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);
  const create = useServerFn(createManagedStudent);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => create({ data: { classId, name } }),
    onSuccess: (result) => {
      setCreated(result);
      void queryClient.invalidateQueries({ queryKey: ["managed-student-logins", classId] });
      onCreated();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Add student login
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setName("");
            setCreated(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a backup student login</DialogTitle>
            <DialogDescription>
              Use this only when a student cannot use email verification. The account is confirmed
              immediately and added to this class.
            </DialogDescription>
          </DialogHeader>
          {created ? (
            <div className="rounded-lg border bg-muted/40 p-4 text-sm">
              <p className="font-medium">Give these details directly to the student:</p>
              <p className="mt-3 font-mono">Username: {created.username}</p>
              <p className="font-mono">Password: {created.password}</p>
              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(
                    `Username: ${created.username}\nPassword: ${created.password}`,
                  );
                  toast.success("Login copied");
                }}
              >
                <Copy className="size-4" /> Copy login
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="managed-student-name">Student name</Label>
              <Input
                id="managed-student-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Student's full name"
              />
            </div>
          )}
          <DialogFooter>
            {created ? (
              <Button onClick={() => setOpen(false)}>Done</Button>
            ) : (
              <Button
                disabled={name.trim().length < 2 || mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? "Creating…" : "Create confirmed login"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ManagedStudentCredentials({
  classId,
  studentId,
  studentName,
}: {
  classId: string;
  studentId: string;
  studentName: string;
}) {
  const provision = useServerFn(provisionManagedStudentLogin);
  const reset = useServerFn(resetManagedStudentPassword);
  const queryClient = useQueryClient();
  const [revealed, setRevealed] = useState(false);
  const [login, setLogin] = useState<{ username: string; password: string | null } | null>(null);
  const reveal = useMutation({
    mutationFn: () => provision({ data: { classId, studentId, studentName } }),
    onSuccess: (result) => {
      setLogin(result);
      setRevealed(true);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const mutation = useMutation({
    mutationFn: () => reset({ data: { classId, studentId } }),
    onSuccess: ({ password }) => {
      setLogin((current) => (current ? { ...current, password } : current));
      void queryClient.invalidateQueries({ queryKey: ["managed-student-logins", classId] });
      toast.success("A new password is ready to give to the student");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  if (!revealed)
    return (
      <Button
        size="sm"
        variant="ghost"
        className="h-8 gap-2 px-2 text-xs"
        disabled={reveal.isPending}
        onClick={() => reveal.mutate()}
      >
        <Eye className="size-3.5" /> {reveal.isPending ? "Loading…" : "••••••••"}
      </Button>
    );
  if (!login) return null;
  return (
    <div className="min-w-48 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-mono">{login.username}</p>
          <p className="font-mono">
            {login.password ?? "Password unavailable — reset to issue one"}
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="Hide student login"
          onClick={() => setRevealed(false)}
        >
          <EyeOff className="size-3.5" />
        </Button>
      </div>
      <div className="mt-1 flex gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => {
            void navigator.clipboard.writeText(
              login.password
                ? `Username: ${login.username}\nPassword: ${login.password}`
                : `Username: ${login.username}`,
            );
            toast.success("Login copied");
          }}
        >
          <KeyRound className="size-3" /> Copy
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          <RotateCcw className="size-3" /> {login.password ? "Reset" : "Set password"}
        </Button>
      </div>
    </div>
  );
}

import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Brand } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password · STEM Homework AI" },
      {
        name: "description",
        content: "Choose a new STEM Homework AI password after requesting a reset link by email.",
      },
      { property: "og:title", content: "Set a new password · STEM Homework AI" },
      {
        property: "og:description",
        content: "Choose a new password for your STEM Homework AI teacher or student account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data: session }) => {
      if (session.session) setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      toast.error("The two passwords do not match.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated — you are signed in.");
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5">
        <Link to="/">
          <Brand />
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-16">
        <div className="paper p-6">
          <h1 className="text-2xl">Set a new password</h1>
          {ready ? (
            <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  required
                  minLength={6}
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                Update password
              </Button>
            </form>
          ) : (
            <div className="mt-4 space-y-3 text-sm text-muted-foreground">
              <p>
                Open this page from the password reset link in your email. The link signs you in just
                long enough to choose a new password.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link to="/auth">Back to sign in</Link>
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

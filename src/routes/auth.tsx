import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Brand } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { lovable } from "@/integrations/lovable/index";
import { emailLinkOrigin } from "@/lib/app-origin";
import {
  NETWORK_AUTH_MESSAGE,
  describeAuthError,
  isNetworkAuthError,
  withAuthRetry,
} from "@/lib/auth-errors";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { mode?: "signup" | "signin" | undefined } =>
    search["mode"] === "signup" ? { mode: "signup" } : {},

  head: () => ({
    meta: [
      { title: "Sign in · PastPaperHelper.AI homework tutor" },
      {
        name: "description",
        content:
          "Sign in as a teacher to set past-paper homework, or as a student to join your class with a code.",
      },
      { property: "og:title", content: "Sign in · PastPaperHelper.AI" },
      { property: "og:description", content: "Teacher and student logins for PastPaperHelper.AI homework." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"signin" | "signup">(mode ?? "signin");
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"student" | "teacher">("student");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [networkIssue, setNetworkIssue] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function handleSignIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    let error: { message: string } | null = null;
    try {
      ({ error } = await withAuthRetry(() =>
        supabase.auth.signInWithPassword({ email, password }),
      ));
    } catch (thrown) {
      setBusy(false);
      setNetworkIssue(isNetworkAuthError(thrown));
      toast.error(describeAuthError(thrown));
      return;
    }
    if (error) {
      setBusy(false);
      if (isNetworkAuthError(error)) {
        setNetworkIssue(true);
        toast.error(NETWORK_AUTH_MESSAGE);
        return;
      }
      setNetworkIssue(false);
      if (/not confirmed/i.test(error.message)) {
        setPendingEmail(email);
        toast.error(
          "This email is not verified yet. Click the link in the confirmation email first — or resend it below.",
        );
        return;
      }
      toast.error(error.message);
      return;
    }
    setNetworkIssue(false);

    // Wait until the session is readable so the auth gate can't bounce us back.
    for (let i = 0; i < 20; i += 1) {
      const { data: current } = await supabase.auth.getSession();
      if (current.session) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    setBusy(false);
    navigate({ to: "/dashboard", replace: true });
  }



  async function handleSignUp(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    let data: Awaited<ReturnType<typeof supabase.auth.signUp>>["data"];
    let error: { message: string } | null = null;
    try {
      ({ data, error } = await withAuthRetry(() =>
        supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: emailLinkOrigin(),
            data: { full_name: fullName, role },
          },
        }),
      ));
    } catch (thrown) {
      setBusy(false);
      setNetworkIssue(isNetworkAuthError(thrown));
      toast.error(describeAuthError(thrown));
      return;
    }
    setBusy(false);
    if (error) {
      setNetworkIssue(isNetworkAuthError(error));
      toast.error(describeAuthError(error, error.message));
      return;
    }

    if (!data!.session) {
      const alreadyRegistered = data!.user?.identities?.length === 0;
      setPendingEmail(email);
      if (alreadyRegistered) {
        toast.info(
          "This email already has an account. No new email was sent — sign in below, or use “Forgot password”.",
        );
      } else {
        toast.success(
          "Confirmation email sent — check your inbox and spam/junk folder, then sign in.",
        );
      }
      setTab("signin");
      return;
    }
    navigate({ to: "/dashboard", replace: true });
  }

  async function handleForgotPassword() {
    if (!email) {
      toast.error("Enter your email first, then tap “Send reset link”.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${emailLinkOrigin()}/reset-password`,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password reset link sent — check your inbox and spam folder.");
  }

  async function handleResendConfirmation() {
    const target = pendingEmail ?? email;
    if (!target) {
      toast.error("Enter your email first.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: target,
      options: { emailRedirectTo: emailLinkOrigin() },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Verification email sent again — check your inbox and spam folder.");
  }

  async function handleGoogle() {
    setBusy(true);
    try {
      localStorage.setItem("pendingOAuthRole", role);
    } catch {
      // ignore storage errors
    }
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth`,
    });

    if (result.error) {
      setBusy(false);
      try {
        localStorage.removeItem("pendingOAuthRole");
      } catch {
        // ignore
      }
      toast.error("Google sign-in failed. Please try again.");
      return;
    }
    if (result.redirected) return;
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
          <h1 className="text-2xl">Welcome to PastPaperHelper.AI</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Teachers set the homework. Students work through it with a tutor beside them.
          </p>

          {pendingEmail ? (
            <div className="mt-4 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
              <p className="font-medium">Not verified yet — check your email</p>
              <p className="mt-1 text-muted-foreground">
                A confirmation link was sent to {pendingEmail}. Your account stays unverified until
                you click that link. Check the spam/junk folder, then sign in below.
              </p>
              <button
                type="button"
                onClick={handleResendConfirmation}
                disabled={busy}
                className="mt-2 text-xs font-medium text-primary underline-offset-2 hover:underline"
              >
                Resend verification email
              </button>
            </div>
          ) : null}


          <Tabs value={tab} onValueChange={(value) => setTab(value as "signin" | "signup")}>
            <TabsList className="mt-6 grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form className="mt-4 space-y-4" onSubmit={handleSignIn}>
                <div className="space-y-2">
                  <Label htmlFor="signin-email">Email</Label>
                  <Input
                    id="signin-email"
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="signin-password">Password</Label>
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={busy}
                      className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Input
                    id="signin-password"
                    type="password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  Sign in
                </Button>
                <button
                  type="button"
                  onClick={handleResendConfirmation}
                  disabled={busy}
                  className="w-full text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  Didn’t get the verification email? Send it again
                </button>

              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form className="mt-4 space-y-4" onSubmit={handleSignUp}>
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Full name</Label>
                  <Input
                    id="signup-name"
                    required
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
                <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                  <strong className="text-foreground">Email verification is required.</strong> Both
                  students and teachers get a confirmation link by email after creating an account —
                  click it, then come back and sign in. Use at least 6 characters and avoid common
                  passwords.
                </p>
                <Button type="submit" className="w-full" disabled={busy}>
                  Create account
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="mt-6 space-y-2">
            <Label>I am a</Label>
            <RadioGroup
              value={role}
              onValueChange={(value) => setRole(value as "student" | "teacher")}
              className="grid grid-cols-2 gap-2"
            >
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 text-sm">
                <RadioGroupItem value="student" /> Student
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 text-sm">
                <RadioGroupItem value="teacher" /> Teacher
              </label>
            </RadioGroup>
            <p className="text-xs text-muted-foreground">Used for new Google and email accounts.</p>
          </div>

          <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>
          <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={busy}>
            Continue with Google
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">
            Google sign-in will create a {role} account if you are new. If you already have an
            account, you will be signed in with your existing role.
          </p>
        </div>
      </main>
    </div>
  );
}

import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { GraduationCap, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export function Brand({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display text-lg ${className}`}>
      <GraduationCap className="size-5 text-accent" />
      STEM Homework AI
    </span>
  );
}

export function AppHeader({
  name,
  role,
}: {
  name?: string | undefined;
  role?: "teacher" | "student" | undefined;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-card/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/dashboard" className="hover:opacity-80">
          <Brand />
        </Link>
        <div className="flex items-center gap-3">
          {name ? (
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {name}
              {role ? ` · ${role === "teacher" ? "Teacher" : "Student"}` : ""}
            </span>
          ) : null}
          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}

import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { isNetworkAuthError } from "@/lib/auth-errors";

/**
 * The gate used to call getUser() on every navigation and bounce to the sign-in
 * page whenever that call failed. On flaky school Wi-Fi / mobile data that
 * looked like being randomly logged out even though the saved session was
 * perfectly valid. Now a stored session is trusted, and we only send someone to
 * sign in when there genuinely is no session (or the server says the token is
 * no longer valid).
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      throw redirect({ to: "/auth" });
    }

    try {
      const { data, error } = await supabase.auth.getUser();
      if (data?.user) return { user: data.user };
      // Network / reachability problems must never sign the person out.
      if (error && isNetworkAuthError(error)) return { user: session.user };
      if (!error) return { user: session.user };
    } catch (error) {
      if (isNetworkAuthError(error)) return { user: session.user };
    }

    // The token really is rejected: clear it locally and ask for a fresh login.
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed?.session?.user) return { user: refreshed.session.user };
    throw redirect({ to: "/auth" });
  },
  component: () => <Outlet />,
});

import { createFileRoute } from "@tanstack/react-router";

import { DEMO_EMAIL, DEMO_PASSWORD, isDemoEmail } from "@/lib/demo";

export const Route = createFileRoute("/api/public/ensure-demo")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const existing = list?.users?.find((u) => isDemoEmail(u.email));
        if (existing) return Response.json({ ok: true, created: false });

        const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
          email: DEMO_EMAIL,
          password: DEMO_PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: "Demo Account", role: "teacher" },
        });
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

        const userId = created.user?.id;
        if (userId) {
          await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
          await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "teacher" });
        }
        return Response.json({ ok: true, created: true });
      },
    },
  },
});

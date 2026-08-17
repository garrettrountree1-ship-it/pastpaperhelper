import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEMO_EMAIL, DEMO_PASSWORD, isDemoEmail } from "@/lib/demo";

export const ensureDemoAccount = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users?.find((u) => isDemoEmail(u.email));
  if (existing) return { ok: true, created: false };

  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "Demo Account", role: "teacher" },
  });
  if (error) throw new Error(error.message);

  const userId = created.user?.id;
  if (userId) {
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "teacher" });
  }
  return { ok: true, created: true };
});

export const switchDemoRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ role: z.enum(["teacher", "student"]) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: user } = await supabase.auth.getUser();
    if (!isDemoEmail(user.user?.email)) throw new Error("Only the demo account can switch views.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true, role: data.role };
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isDemoEmail } from "@/lib/demo";

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

import { createMiddleware } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Signed-in AND approved by an admin; otherwise the server action refuses. */
export const requireApproved = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { data, error } = await context.supabase.rpc("is_approved", { _user_id: context.userId });
    if (error || !data) throw new Error("Forbidden: your account is not approved for the lab yet.");
    return next();
  });

/** Signed-in admin only. */
export const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error || !data) throw new Error("Forbidden: admin access required.");
    return next();
  });

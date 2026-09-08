import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AccessStatus = {
  status: "none" | "pending" | "approved" | "rejected";
  isAdmin: boolean;
  email: string | null;
};

export const getAccessStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AccessStatus> => {
    const email = (context.claims["email"] as string | undefined) ?? null;

    const { data: req } = await context.supabase
      .from("account_requests")
      .select("status")
      .eq("user_id", context.userId)
      .maybeSingle();

    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);

    return {
      status: (req?.status as AccessStatus["status"]) ?? "none",
      isAdmin: Boolean(roles?.some((r) => r.role === "admin")),
      email,
    };
  });

export const requestAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ note: z.string().max(500).optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    const email = (context.claims["email"] as string | undefined) ?? "";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("account_requests")
      .select("status")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (existing) return { status: existing.status as AccessStatus["status"] };

    const { error } = await supabaseAdmin.from("account_requests").insert({
      user_id: context.userId,
      email,
      status: "pending",
      note: data.note ?? null,
    });
    if (error) throw new Error(error.message);

    return { status: "pending" as const };
  });

export const listAccessRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (!roles?.some((r) => r.role === "admin")) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("account_requests")
      .select("user_id, email, status, note, requested_at, decided_at")
      .order("requested_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const decideAccessRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid(), decision: z.enum(["approved", "rejected"]) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (!roles?.some((r) => r.role === "admin")) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("account_requests")
      .update({ status: data.decision, decided_at: new Date().toISOString(), decided_by: context.userId })
      .eq("user_id", data.userId)
      .select("email, status")
      .maybeSingle();
    if (error) throw new Error(error.message);

    return { email: row?.email ?? null, status: row?.status ?? data.decision };
  });

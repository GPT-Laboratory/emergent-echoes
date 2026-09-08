import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { getAccessStatus, requestAccess } from "@/lib/access.functions";

export function AccessGate({ children }: { children: ReactNode }) {
  const fetchStatus = useServerFn(getAccessStatus);
  const ask = useServerFn(requestAccess);
  const qc = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: ["access-status"],
    queryFn: () => fetchStatus(),
    staleTime: 30_000,
  });

  const submit = useMutation({
    mutationFn: () => ask({ data: {} }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["access-status"] }),
  });

  if (isPending) {
    return (
      <main className="mx-auto max-w-md px-5 py-16 font-mono text-xs uppercase tracking-widest text-muted-foreground">
        Checking access…
      </main>
    );
  }

  if (data?.status === "approved") return <>{children}</>;

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-10">
      <h1 className="font-mono text-sm uppercase tracking-widest text-primary">Access by approval</h1>

      {data?.status === "pending" && (
        <p className="mt-3 text-sm text-muted-foreground">
          Your request is waiting for the lab owner to approve it. You'll get an email at{" "}
          <span className="font-mono text-foreground">{data.email}</span> once it's decided.
        </p>
      )}

      {data?.status === "rejected" && (
        <p className="mt-3 text-sm text-muted-foreground">
          This account was not approved for the lab. Contact the lab owner if you think that's a mistake.
        </p>
      )}

      {data?.status === "none" && (
        <>
          <p className="mt-3 text-sm text-muted-foreground">
            The lab is private. Request access and the owner will review it.
          </p>
          <Button
            className="mt-5 font-mono text-xs uppercase tracking-widest"
            disabled={submit.isPending}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? "Sending…" : "Request access"}
          </Button>
        </>
      )}

      <Link
        to="/auth"
        className="mt-6 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
      >
        Use a different account
      </Link>
    </main>
  );
}

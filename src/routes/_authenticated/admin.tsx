import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { decideAccessRequest, getAccessStatus, listAccessRequests } from "@/lib/access.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Account approvals — Emergent Agent Coordination Lab" },
      { name: "description", content: "Review and approve requests for access to the coordination lab." },
      { property: "og:title", content: "Account approvals — Emergent Agent Coordination Lab" },
      { property: "og:description", content: "Approve or reject researcher access requests." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const status = useServerFn(getAccessStatus);
  const list = useServerFn(listAccessRequests);
  const decide = useServerFn(decideAccessRequest);
  const qc = useQueryClient();

  const me = useQuery({ queryKey: ["access-status"], queryFn: () => status() });
  const requests = useQuery({
    queryKey: ["access-requests"],
    queryFn: () => list(),
    enabled: Boolean(me.data?.isAdmin),
  });

  const act = useMutation({
    mutationFn: (v: { userId: string; decision: "approved" | "rejected" }) => decide({ data: v }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["access-requests"] }),
  });

  if (me.data && !me.data.isAdmin) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-12 text-sm text-muted-foreground">
        Only the lab owner can review account requests.
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="font-mono text-sm uppercase tracking-widest text-primary">Account approvals</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        People who sign up wait here until you approve them.
      </p>

      <div className="mt-6 overflow-hidden rounded-md border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-card/70 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Requested</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {(requests.data ?? []).map((r) => (
              <tr key={r.user_id} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-xs">{r.email}</td>
                <td className="px-3 py-2 font-mono text-xs uppercase tracking-widest">{r.status}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                  {new Date(r.requested_at).toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-2">
                    {r.status !== "approved" && (
                      <Button
                        size="sm"
                        disabled={act.isPending}
                        onClick={() => act.mutate({ userId: r.user_id, decision: "approved" })}
                        className="font-mono text-[11px] uppercase tracking-widest"
                      >
                        Approve
                      </Button>
                    )}
                    {r.status !== "rejected" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={act.isPending}
                        onClick={() => act.mutate({ userId: r.user_id, decision: "rejected" })}
                        className="font-mono text-[11px] uppercase tracking-widest"
                      >
                        Reject
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {requests.data?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No requests yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

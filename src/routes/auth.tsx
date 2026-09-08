import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Emergent Agent Coordination Lab" },
      {
        name: "description",
        content: "Sign in to run and review experiments in the emergent agent coordination lab.",
      },
      { property: "og:title", content: "Sign in — Emergent Agent Coordination Lab" },
      { property: "og:description", content: "Access to recorded runs is limited to signed-in researchers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) void navigate({ to: "/", replace: true });
    })();
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (err) throw err;
        if (!data.session) {
          setNotice("Check your email to confirm the account, then sign in.");
          setMode("signin");
          return;
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      }
      void navigate({ to: "/", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-5 py-10">
      <h1 className="font-mono text-sm uppercase tracking-widest text-primary">Restricted lab</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Runs, agent reasoning and cache contents are visible to signed-in researchers only.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4 rounded-md border border-border bg-card/70 p-5">
        <div className="space-y-2">
          <Label className="label-caps" htmlFor="email">
            Email
          </Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label className="label-caps" htmlFor="password">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <p className="rounded-md border border-destructive/50 bg-destructive/10 p-2 font-mono text-[11px] text-destructive">
            {error}
          </p>
        )}
        {notice && <p className="font-mono text-[11px] text-primary">{notice}</p>}

        <Button type="submit" disabled={busy} className="w-full font-mono text-xs uppercase tracking-widest">
          {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
        </Button>

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="w-full text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          {mode === "signin" ? "Need an account?" : "Already have an account?"}
        </button>
      </form>
    </main>
  );
}

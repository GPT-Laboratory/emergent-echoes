import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Emergent Agent Coordination Lab" },
      {
        name: "description",
        content:
          "A live propensity meter for spontaneous coordination between autonomous LLM agents under pressure.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      setSignedIn(Boolean(session));
      void router.invalidate();
      if (event !== "SIGNED_OUT") void queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void router.navigate({ to: "/auth", replace: true });
  };

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen">
        <header className="border-b border-border bg-card/60 backdrop-blur">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-8 gap-y-2 px-5 py-3">
            <Link to="/" className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_12px_var(--primary)]" />
              <span className="font-mono text-sm font-semibold tracking-tight text-foreground">
                EMERGENT AGENT COORDINATION LAB
              </span>
            </Link>
            <nav className="flex items-center gap-5 font-mono text-xs uppercase tracking-widest text-muted-foreground">
              <Link to="/" activeProps={{ className: "text-primary" }} activeOptions={{ exact: true }}>
                Lab
              </Link>
              <Link to="/runs" activeProps={{ className: "text-primary" }}>
                Runs
              </Link>
              <Link to="/rooms/$runId" params={{ runId: "latest" }} activeProps={{ className: "text-primary" }}>
                Rooms
              </Link>
              <Link to="/picker" activeProps={{ className: "text-primary" }}>
                Picker
              </Link>
              {signedIn && (
                <Link to="/admin" activeProps={{ className: "text-primary" }}>
                  Approvals
                </Link>
              )}
            </nav>
            <span className="ml-auto font-mono text-[11px] text-muted-foreground">
              sandboxed simulation · no external targets
            </span>
            {signedIn ? (
              <button
                onClick={() => void signOut()}
                className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
              >
                Sign out
              </button>
            ) : (
              <Link to="/auth" className="font-mono text-[11px] uppercase tracking-widest text-primary">
                Sign in
              </Link>
            )}
          </div>
        </header>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
      </div>
    </QueryClientProvider>
  );
}


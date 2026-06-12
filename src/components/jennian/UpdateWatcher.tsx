/**
 * UpdateWatcher — kills the stale-tab problem.
 *
 * The SPA bundle bakes its build id at compile time (VITE_BUILD_ID, set by
 * deploy-pages.yml to the commit SHA). The deploy also publishes /version.json
 * with the same id. This watcher polls version.json on an interval and on tab
 * focus; when the served id differs from the baked id, it raises a persistent
 * toast with a Refresh action.
 *
 * Fail-safe doctrine applies to UX too: no baked id (local dev), fetch failure,
 * or malformed payload → do NOTHING. Never nag on a guess.
 */
import { useEffect, useRef } from "react";
import { toast } from "sonner";

const POLL_MS = 5 * 60 * 1000;

export function isNewerBuild(baked: string | undefined, served: unknown): boolean {
  if (!baked) return false; // local dev / unstamped build — never toast
  if (typeof served !== "string" || served.length === 0) return false;
  return served !== baked;
}

export function UpdateWatcher() {
  const notified = useRef(false);

  useEffect(() => {
    const baked = import.meta.env.VITE_BUILD_ID as string | undefined;
    if (!baked) return;

    let cancelled = false;

    async function check() {
      if (cancelled || notified.current) return;
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { build?: unknown };
        if (isNewerBuild(baked, body?.build)) {
          notified.current = true;
          toast.info("A new version of Jennian IQ is available.", {
            duration: Infinity,
            action: { label: "Refresh", onClick: () => window.location.reload() },
          });
        }
      } catch {
        /* offline / transient — stay quiet */
      }
    }

    const interval = setInterval(check, POLL_MS);
    const onFocus = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onFocus);
    void check();

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  return null;
}

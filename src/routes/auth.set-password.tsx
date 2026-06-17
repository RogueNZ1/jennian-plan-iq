/**
 * /auth/set-password — landing page for Supabase invite links.
 *
 * Supabase redirects here after the invite token is verified.
 * The URL fragment contains the session tokens which Supabase JS
 * picks up automatically via detectSessionInUrl.
 *
 * This page prompts the invited user to choose their password
 * before entering the app, so they can log back in later.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { HouseFrame } from "@/components/jennian/HouseFrame";

export const Route = createFileRoute("/auth/set-password")({
  component: SetPasswordPage,
});

function SetPasswordPage() {
  const navigate = useNavigate();
  const { user, loading, refreshProfile } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  // Branded invite emails link straight here with ?token_hash=…&type=invite
  // (no supabase.co redirect hop). Detect it synchronously so the
  // "no session → back to login" redirect below waits for verification.
  const [hasTokenHash] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("token_hash"),
  );
  const [verifyState, setVerifyState] = useState<"idle" | "verifying" | "failed">(
    hasTokenHash ? "verifying" : "idle",
  );

  useEffect(() => {
    if (!hasTokenHash || user) return;
    const sp = new URLSearchParams(window.location.search);
    const tokenHash = sp.get("token_hash");
    if (!tokenHash) return;
    const type = (sp.get("type") ?? "invite") as
      | "invite"
      | "magiclink"
      | "recovery"
      | "signup"
      | "email";
    supabase.auth.verifyOtp({ type, token_hash: tokenHash }).then(({ error }) => {
      if (error) {
        setVerifyState("failed");
        toast.error(
          "This invite link has expired or has already been used. Ask for it to be resent.",
        );
        navigate({ to: "/login" });
      } else {
        setVerifyState("idle");
        // Drop the one-time token from the address bar.
        window.history.replaceState({}, "", window.location.pathname);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTokenHash]);

  // If not authenticated at all (e.g. token already expired or link re-used),
  // redirect to login after auth state settles. Token-hash links wait for
  // verification above instead.
  useEffect(() => {
    if (!loading && !user && !hasTokenHash) {
      toast.error(
        "This invite link has expired or has already been used. Please contact your administrator.",
      );
      navigate({ to: "/login" });
    }
  }, [user, loading, hasTokenHash, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      toast.error("Your invite session has expired. Please ask for the invite to be resent.");
      navigate({ to: "/login" });
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    const now = new Date().toISOString();
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        status: "active",
        accepted_at: now,
        last_login_at: now,
        updated_at: now,
      })
      .eq("id", user.id);
    if (profileError) {
      setBusy(false);
      toast.error(
        "Password saved, but account activation failed. Please contact your administrator.",
      );
      return;
    }
    await refreshProfile();
    setBusy(false);
    toast.success("Password set - welcome to Jennian IQ!");
    navigate({ to: "/jobs" });
  }

  // Show nothing while auth state loads
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!user) return null; // redirect handled in useEffect

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left panel — matches login.tsx branding */}
      <div className="hidden lg:flex flex-col justify-between bg-sidebar text-sidebar-foreground p-12 relative overflow-hidden">
        <HouseFrame className="absolute -right-10 bottom-10 w-[640px] text-white/[0.05]" />
        <div className="absolute inset-x-12 top-1/2 h-px bg-white/5" />

        <div className="relative flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-primary grid place-items-center text-primary-foreground font-semibold shadow-sm">
            J
          </div>
          <div className="leading-tight">
            <div className="text-white font-semibold tracking-tight text-[16px]">Jennian IQ</div>
            <div className="text-[10.5px] uppercase tracking-[0.18em] text-primary/90 font-medium mt-0.5">
              Jennian Homes Manawatū
            </div>
          </div>
        </div>

        <div className="relative">
          <h1 className="mt-3 text-[34px] font-semibold tracking-tight text-white max-w-md leading-[1.1]">
            Welcome to Jennian IQ.
          </h1>
          <p className="mt-5 text-sm text-sidebar-foreground/70 max-w-md leading-relaxed">
            Set your password to activate your account and start using the platform.
          </p>
        </div>

        <div className="relative flex items-end justify-between">
          <div className="text-[11px] text-sidebar-foreground/50">© Jennian Homes Manawatū</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/40">
            Plans · Quantities · Pricing · Procurement
          </div>
        </div>
      </div>

      {/* Right panel — set password form */}
      <div className="flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm space-y-6">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-primary font-medium">
              Account activation
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Set your password</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a strong password for <span className="font-medium">{user.email}</span>.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">New password</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                type="password"
                minLength={8}
                placeholder="At least 8 characters"
                className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Confirm password</label>
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                type="password"
                minLength={8}
                placeholder="Repeat your password"
                className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <button
            disabled={busy}
            type="submit"
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60 shadow-sm"
          >
            {busy ? "Saving…" : "Activate account"}
          </button>
        </form>
      </div>
    </div>
  );
}

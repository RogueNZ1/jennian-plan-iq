import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { HouseFrame } from "@/components/jennian/HouseFrame";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const navigate = useNavigate();
  const { user, loading, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/jobs" });
  }, [user, loading, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) return toast.error(error.message);
    // Don't navigate here — onAuthStateChange will update `user`, and the
    // effect above will redirect to "/". Navigating immediately races the
    // auth state propagation and AppLayout bounces us back to /login.
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between bg-sidebar text-sidebar-foreground p-12 relative overflow-hidden">
        {/* Subtle architectural backdrop */}
        <HouseFrame className="absolute -right-10 bottom-10 w-[640px] text-white/[0.05]" />
        <div className="absolute inset-x-12 top-1/2 h-px bg-white/5" />

        <div className="relative flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-primary grid place-items-center text-primary-foreground font-semibold shadow-sm">J</div>
          <div className="leading-tight">
            <div className="text-white font-semibold tracking-tight text-[16px]">Jennian IQ</div>
            <div className="text-[10.5px] uppercase tracking-[0.18em] text-primary/90 font-medium mt-0.5">Jennian Homes Manawatū</div>
          </div>
        </div>

        <div className="relative">
          <h1 className="mt-3 text-[34px] font-semibold tracking-tight text-white max-w-md leading-[1.1]">
            Better building starts with better information.
          </h1>
          <p className="mt-5 text-sm text-sidebar-foreground/70 max-w-md leading-relaxed">
            Jennian IQ helps standardise quantity review, plan analysis, and estimating preparation — creating greater consistency, visibility, and control across projects.
          </p>
        </div>

        <div className="relative flex items-end justify-between">
          <div className="text-[11px] text-sidebar-foreground/50">© Jennian Homes Manawatū</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/40">Plans · Quantities · Pricing · Procurement</div>
        </div>
      </div>

      <div className="flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm space-y-6">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-primary font-medium">
              <Sparkles className="h-3 w-3" /> Sign in
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Welcome back</h2>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to access your workspace.</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} required type="email" className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Password</label>
              <input value={password} onChange={(e) => setPassword(e.target.value)} required type="password" className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>

          <button disabled={busy} type="submit" className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60 shadow-sm">
            {busy ? "Signing in…" : "Sign in"}
          </button>

          <div className="text-[11px] text-muted-foreground text-center leading-relaxed">
            Please sign in using your Jennian Homes account.
          </div>
        </form>
      </div>
    </div>
  );
}
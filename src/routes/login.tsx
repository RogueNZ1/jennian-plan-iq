import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [user, loading, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between bg-sidebar text-sidebar-foreground p-12">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-md bg-primary grid place-items-center text-primary-foreground font-semibold">J</div>
          <div>
            <div className="text-white font-semibold tracking-tight">Jennian IQ</div>
            <div className="text-[11px] text-sidebar-foreground/60">Built Smarter.</div>
          </div>
        </div>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white max-w-sm leading-tight">
            The construction command centre for Jennian Homes Manawatū.
          </h1>
          <p className="mt-4 text-sm text-sidebar-foreground/70 max-w-md">
            AI-assisted quantity extraction and estimating preparation — feeding directly into your proprietary pricing workbook.
          </p>
        </div>
        <div className="text-[11px] text-sidebar-foreground/50">© Jennian Homes Manawatū</div>
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

          <div className="text-xs text-muted-foreground text-center">
            No account? <Link to="/signup" className="text-primary font-medium hover:underline">Create one</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
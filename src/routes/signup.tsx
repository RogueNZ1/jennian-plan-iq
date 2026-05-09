import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({ component: SignupPage });

function SignupPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name: fullName },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Account created. Check your email to confirm, then sign in.");
    navigate({ to: "/login" });
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
        <h1 className="text-3xl font-semibold tracking-tight text-white max-w-sm leading-tight">
          Quantity extraction, reviewed and ready for pricing.
        </h1>
        <div className="text-[11px] text-sidebar-foreground/50">© Jennian Homes Manawatū</div>
      </div>

      <div className="flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm space-y-6">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-primary font-medium">
              <Sparkles className="h-3 w-3" /> Create account
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Get started</h2>
            <p className="mt-1 text-sm text-muted-foreground">Set up your Jennian IQ workspace access.</p>
          </div>

          <div className="space-y-3">
            <Field label="Full name" value={fullName} onChange={setFullName} />
            <Field label="Email" type="email" value={email} onChange={setEmail} />
            <Field label="Password" type="password" value={password} onChange={setPassword} />
          </div>

          <button disabled={busy} type="submit" className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60 shadow-sm">
            {busy ? "Creating…" : "Create account"}
          </button>

          <div className="text-xs text-muted-foreground text-center">
            Already have an account? <Link to="/login" className="text-primary font-medium hover:underline">Sign in</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        required
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}
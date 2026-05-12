import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, PageHeader } from "@/components/jennian/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save, Lock } from "lucide-react";

export const Route = createFileRoute("/settings")({ component: Page });

const READ_ONLY_SETTINGS = [
  { title: "Workspace", desc: "Jennian Homes Manawatū" },
  { title: "Default template", desc: "SS-BW — Single Storey Brick & Weatherboard" },
  { title: "Confidence thresholds", desc: "High ≥ 90% · Review 70–89% · Low < 70%" },
  { title: "Pricing workbook integration", desc: "Mapped fields synced with proprietary Excel" },
];

function Page() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [originalName, setOriginalName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        const name = data?.full_name ?? "";
        setDisplayName(name);
        setOriginalName(name);
      });
  }, [user]);

  async function save() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: displayName.trim() })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      setOriginalName(displayName.trim());
      toast.success("Display name updated.");
    }
  }

  return (
    <AppLayout>
      <div className="px-8 py-8 max-w-3xl">
        <PageHeader title="Settings" subtitle="Workspace and review defaults." />

        <div className="mb-6 rounded-xl border border-border bg-card p-5">
          <div className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted-foreground mb-4">Your Profile</div>
          <div className="space-y-4">
            <div>
              <label className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground block mb-1.5">
                Display name
              </label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your full name"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground block mb-1.5">
                Email address
              </label>
              <input
                value={user?.email ?? ""}
                disabled
                className="w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Email is managed by your account provider.</p>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={save}
              disabled={saving || displayName.trim() === originalName}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {READ_ONLY_SETTINGS.map((s) => (
            <div key={s.title} className="rounded-lg border border-border bg-card p-5 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">{s.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.desc}</div>
              </div>
              <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
                <Lock className="h-3 w-3" /> Admin only
              </div>
            </div>
          ))}
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Workspace settings can only be changed by an administrator. Contact your workspace owner to update these values.
        </p>
      </div>
    </AppLayout>
  );
}

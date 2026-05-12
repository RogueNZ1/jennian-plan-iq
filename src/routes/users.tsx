import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, PageHeader } from "@/components/jennian/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRoles, ROLE_LABEL, ROLE_DESCRIPTION, type AppRole } from "@/hooks/use-roles";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import {
  UserPlus, Search, Mail, Trash2, Power, RefreshCw, Pencil, Shield,
  History, X, ChevronDown, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/users")({ component: UsersPage });

const ROLES: AppRole[] = ["owner", "admin", "estimator", "project_manager", "viewer"];

const BRANCHES = ["Manawatū", "Wellington", "Hawke's Bay", "Taranaki", "Other"];

type ProfileStatus = "invited" | "active" | "suspended";

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  status: ProfileStatus;
  branch: string | null;
  invited_by: string | null;
  invited_at: string | null;
  accepted_at: string | null;
  last_login_at: string | null;
  created_at: string;
};

type RoleRow = { user_id: string; role: AppRole };

type InvitationRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: AppRole;
  branch: string | null;
  welcome_message: string | null;
  invited_by: string;
  status: string;
  created_at: string;
};

type AuditRow = {
  id: string;
  action: string;
  table_name: string | null;
  record_id: string | null;
  actor_user_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

/** Combined user row for the table (real profile or pending invite). */
type UserListRow = {
  kind: "profile" | "invite";
  id: string;
  name: string;
  email: string;
  role: AppRole;
  status: "active" | "disabled" | "pending";
  branch: string | null;
  lastActive: string | null;
  invitedBy: string | null;
  raw: ProfileRow | InvitationRow;
};

function UsersPage() {
  const { user } = useAuth();
  const roles = useRoles();

  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [roleRows, setRoleRows] = useState<RoleRow[]>([]);
  const [invites, setInvites] = useState<InvitationRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<"all" | AppRole>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "disabled" | "pending">("all");
  const [filterBranch, setFilterBranch] = useState<"all" | string>("all");
  const [showInvite, setShowInvite] = useState(false);
  const [editing, setEditing] = useState<UserListRow | null>(null);
  const [showActivity, setShowActivity] = useState(false);

  const canManage = roles.canManageUsers;

  async function load() {
    setLoading(true);
    const [{ data: p }, { data: r }, { data: i }, { data: a }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("user_invitations").select("*").order("created_at", { ascending: false }),
      supabase
        .from("audit_logs")
        .select("id, action, table_name, record_id, actor_user_id, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(40),
    ]);
    setProfiles((p ?? []) as ProfileRow[]);
    setRoleRows((r ?? []) as RoleRow[]);
    setInvites((i ?? []) as InvitationRow[]);
    setAudit((a ?? []) as AuditRow[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const roleByUser = useMemo(() => {
    const m: Record<string, AppRole> = {};
    // Take highest-privilege role per user
    const order: AppRole[] = ["owner", "admin", "estimator", "project_manager", "viewer"];
    for (const rr of roleRows) {
      const cur = m[rr.user_id];
      if (!cur || order.indexOf(rr.role) < order.indexOf(cur)) m[rr.user_id] = rr.role;
    }
    return m;
  }, [roleRows]);

  const profileById = useMemo(() => {
    const m: Record<string, ProfileRow> = {};
    for (const p of profiles) m[p.id] = p;
    return m;
  }, [profiles]);

  const rows: UserListRow[] = useMemo(() => {
    const inviteEmailByName = new Map<string, string>();
    for (const i of invites) {
      const name = [i.first_name, i.last_name].filter(Boolean).join(" ");
      if (name) inviteEmailByName.set(name.toLowerCase(), i.email);
    }

    const live: UserListRow[] = profiles.map((p) => ({
      kind: "profile",
      id: p.id,
      name: p.full_name || (p.email ?? "—"),
      email: p.email ?? inviteEmailByName.get((p.full_name ?? "").toLowerCase()) ?? "",
      role: roleByUser[p.id] ?? "viewer",
      status: p.status === "suspended" ? "disabled" : p.status === "invited" ? "pending" : "active",
      branch: p.branch,
      lastActive: p.last_login_at,
      invitedBy: p.invited_by ? (profileById[p.invited_by]?.full_name ?? profileById[p.invited_by]?.email ?? null) : null,
      raw: p,
    }));
    const pending: UserListRow[] = invites
      .filter((i) => i.status === "pending")
      .map((i) => ({
        kind: "invite",
        id: i.id,
        name: [i.first_name, i.last_name].filter(Boolean).join(" ") || i.email,
        email: i.email,
        role: i.role,
        status: "pending" as const,
        branch: i.branch,
        lastActive: null,
        invitedBy: profileById[i.invited_by]?.full_name ?? profileById[i.invited_by]?.email ?? null,
        raw: i,
      }));
    return [...live, ...pending];
  }, [profiles, invites, roleByUser, profileById]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterRole !== "all" && r.role !== filterRole) return false;
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (filterBranch !== "all" && (r.branch ?? "") !== filterBranch) return false;
      if (q && !(`${r.name} ${r.email}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, search, filterRole, filterStatus, filterBranch]);

  async function logAction(action: string, tableName: string, recordId: string, metadata: Record<string, unknown>) {
    if (!user) return;
    await supabase.from("audit_logs").insert({
      actor_user_id: user.id,
      action,
      table_name: tableName,
      record_id: recordId,
      metadata: metadata as unknown as Json,
    });
  }

  async function setUserRole(targetUserId: string, role: AppRole) {
    if (!canManage) return toast.error("You don't have permission to change roles.");
    if (!user) return;
    const prev = roleByUser[targetUserId] ?? null;
    const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", targetUserId);
    if (delErr) return toast.error(delErr.message);
    const { error: insErr } = await supabase.from("user_roles").insert({ user_id: targetUserId, role });
    if (insErr) return toast.error(insErr.message);
    await logAction("role_change", "user_roles", targetUserId, { previous: prev, next: role });
    toast.success(`Role updated to ${ROLE_LABEL[role]}.`);
    load();
  }

  async function setProfileStatus(targetUserId: string, status: "active" | "disabled") {
    if (!canManage) return toast.error("You don't have permission to change user status.");
    const prev = profileById[targetUserId]?.status;
    const dbStatus: ProfileStatus = status === "disabled" ? "suspended" : "active";
    const { error } = await supabase.from("profiles").update({ status: dbStatus }).eq("id", targetUserId);
    if (error) return toast.error(error.message);
    await logAction(status === "disabled" ? "user_disabled" : "user_enabled", "profiles", targetUserId, { previous: prev, next: status });
    toast.success(status === "disabled" ? "User disabled." : "User enabled.");
    load();
  }

  async function removeProfile(targetUserId: string) {
    if (!canManage) return;
    if (targetUserId === user?.id) return toast.error("You cannot remove yourself.");
    if (!confirm("Remove this user's access to Jennian IQ?")) return;
    const { error: rErr } = await supabase.from("user_roles").delete().eq("user_id", targetUserId);
    if (rErr) return toast.error(rErr.message);
    const { error: pErr } = await supabase.from("profiles").update({ status: "suspended" }).eq("id", targetUserId);
    if (pErr) return toast.error(pErr.message);
    await logAction("user_removed", "profiles", targetUserId, {});
    toast.success("User access removed.");
    load();
  }

  async function resendInvite(inviteId: string) {
    if (!canManage) return;
    const { error } = await supabase
      .from("user_invitations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", inviteId);
    if (error) return toast.error(error.message);
    await logAction("invite_resent", "user_invitations", inviteId, {});
    toast.success("Invitation re-sent.");
    load();
  }

  async function cancelInvite(inviteId: string) {
    if (!canManage) return;
    const { error } = await supabase.from("user_invitations").update({ status: "cancelled" }).eq("id", inviteId);
    if (error) return toast.error(error.message);
    await logAction("invite_cancelled", "user_invitations", inviteId, {});
    toast.success("Invitation cancelled.");
    load();
  }

  return (
    <AppLayout>
      <div className="px-8 py-8 max-w-7xl">
        <PageHeader
          title="Users"
          subtitle="Invite, manage and assign roles for everyone using Jennian IQ."
          actions={
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowActivity((v) => !v)}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3.5 py-2 text-sm font-medium hover:bg-accent"
              >
                <History className="h-4 w-4" /> Activity log
              </button>
              <button
                onClick={() => setShowInvite(true)}
                disabled={!canManage}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 shadow-sm disabled:opacity-60"
                title={canManage ? "Invite a new user" : "Only Owners and Admins can invite"}
              >
                <UserPlus className="h-4 w-4" /> Invite User
              </button>
            </div>
          }
        />

        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="pl-8 pr-3 py-2 w-72 rounded-md border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Select value={filterRole} onChange={(v) => setFilterRole(v as "all" | AppRole)}
            options={[{ v: "all", label: "All roles" }, ...ROLES.map((r) => ({ v: r, label: ROLE_LABEL[r] }))]} />
          <Select value={filterStatus} onChange={(v) => setFilterStatus(v as typeof filterStatus)}
            options={[
              { v: "all", label: "Any status" },
              { v: "active", label: "Active" },
              { v: "disabled", label: "Inactive" },
              { v: "pending", label: "Pending" },
            ]} />
          <Select value={filterBranch} onChange={(v) => setFilterBranch(v)}
            options={[{ v: "all", label: "All branches" }, ...BRANCHES.map((b) => ({ v: b, label: b }))]} />
          <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">{filtered.length} of {rows.length}</span>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-[0_1px_0_rgba(0,0,0,0.02)]">
          {loading ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Loading users…</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No users match the current filters.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Branch</th>
                  <th className="px-4 py-3 font-medium">Last Active</th>
                  <th className="px-4 py-3 font-medium">Invited By</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={`${r.kind}:${r.id}`} className="border-t border-border hover:bg-muted/25 transition-colors">
                    <td className="pl-6 pr-4 py-3 font-medium">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-secondary grid place-items-center text-[11px] font-semibold">
                          {initials(r.name || r.email)}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate">{r.name || "—"}</div>
                          {r.kind === "invite" && (
                            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Pending invitation</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.email}</td>
                    <td className="px-4 py-3"><RoleBadge role={r.role} /></td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{r.branch ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">
                      {r.lastActive ? new Date(r.lastActive).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.invitedBy ?? "—"}</td>
                    <td className="pr-6 pl-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {r.kind === "profile" ? (
                          <>
                            <IconBtn title="Edit role" onClick={() => setEditing(r)} disabled={!canManage}>
                              <Pencil className="h-3 w-3" />
                            </IconBtn>
                            {r.status === "disabled" ? (
                              <IconBtn title="Enable user" onClick={() => setProfileStatus(r.id, "active")} disabled={!canManage}>
                                <Power className="h-3 w-3 text-confidence-high" />
                              </IconBtn>
                            ) : (
                              <IconBtn title="Disable user" onClick={() => setProfileStatus(r.id, "disabled")} disabled={!canManage || r.id === user?.id}>
                                <Power className="h-3 w-3" />
                              </IconBtn>
                            )}
                            <IconBtn title="Remove user" onClick={() => removeProfile(r.id)} disabled={!canManage || r.id === user?.id}>
                              <Trash2 className="h-3 w-3" />
                            </IconBtn>
                          </>
                        ) : (
                          <>
                            <IconBtn title="Resend invite" onClick={() => resendInvite(r.id)} disabled={!canManage}>
                              <RefreshCw className="h-3 w-3" />
                            </IconBtn>
                            <IconBtn title="Cancel invite" onClick={() => cancelInvite(r.id)} disabled={!canManage}>
                              <X className="h-3 w-3" />
                            </IconBtn>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {showActivity && <ActivityPanel rows={audit} profileById={profileById} onClose={() => setShowActivity(false)} />}
      </div>

      {showInvite && canManage && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onCreated={async (payload) => {
            if (!user) return;
            const { data, error } = await supabase
              .from("user_invitations")
              .insert({ ...payload, invited_by: user.id })
              .select()
              .single();
            if (error) { toast.error(error.message); return; }
            await logAction("invite_created", "user_invitations", data!.id, { email: payload.email, role: payload.role });
            toast.success(`Invitation queued for ${payload.email}.`);
            setShowInvite(false);
            load();
          }}
        />
      )}

      {editing && (
        <RoleModal
          row={editing}
          onClose={() => setEditing(null)}
          onSave={async (role) => {
            await setUserRole(editing.id, role);
            setEditing(null);
          }}
        />
      )}
    </AppLayout>
  );
}

function initials(name: string) {
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "U";
}

function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void;
  options: Array<{ v: string; label: string }>;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none pl-3 pr-8 py-2 rounded-md border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {options.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
    </div>
  );
}

function IconBtn({ children, onClick, title, disabled }: {
  children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1.5 text-[11px] font-medium hover:bg-accent hover:border-primary/30 transition disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

function RoleBadge({ role }: { role: AppRole }) {
  const cls: Record<AppRole, string> = {
    owner:           "bg-primary/10 text-primary border-transparent",
    admin:           "bg-primary/10 text-primary border-transparent",
    estimator:       "bg-confidence-high-bg text-confidence-high border-transparent",
    project_manager: "bg-confidence-mid-bg text-confidence-mid border-transparent",
    viewer:          "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-medium", cls[role])}>
      {role === "owner" && <Shield className="h-3 w-3 mr-1" />}
      {ROLE_LABEL[role]}
    </span>
  );
}

function StatusBadge({ status }: { status: "active" | "disabled" | "pending" }) {
  const map = {
    active:   { cls: "bg-confidence-high-bg text-confidence-high", label: "Active" },
    disabled: { cls: "bg-muted text-muted-foreground", label: "Inactive" },
    pending:  { cls: "bg-confidence-mid-bg text-confidence-mid", label: "Pending" },
  } as const;
  const m = map[status];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium", m.cls)}>
      {m.label}
    </span>
  );
}

/* ---------- Invite Modal ---------- */

const inviteSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(80),
  last_name:  z.string().trim().min(1, "Last name is required").max(80),
  email:      z.string().trim().toLowerCase().email("Enter a valid email").max(255),
  role:       z.enum(["owner", "admin", "estimator", "project_manager", "viewer"]),
  branch:     z.string().trim().max(80).nullable(),
  welcome_message: z.string().trim().max(500).nullable(),
});

type InvitePayload = z.infer<typeof inviteSchema>;

function InviteModal({ onClose, onCreated }: {
  onClose: () => void; onCreated: (p: InvitePayload) => Promise<void> | void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("estimator");
  const [branch, setBranch] = useState<string>("Manawatū");
  const [welcome, setWelcome] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const parsed = inviteSchema.safeParse({
      first_name: firstName,
      last_name: lastName,
      email,
      role,
      branch: branch || null,
      welcome_message: welcome || null,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the invite details.");
      setBusy(false);
      return;
    }
    await onCreated(parsed.data);
    setBusy(false);
  }

  return (
    <ModalShell title="Invite User" subtitle="Send a Jennian IQ invitation." onClose={onClose}>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="First Name" value={firstName} onChange={setFirstName} />
        <Field label="Last Name" value={lastName} onChange={setLastName} />
        <div className="sm:col-span-2">
          <Field label="Email Address" value={email} onChange={setEmail} placeholder="name@jennian.co.nz" type="email" />
        </div>
        <div>
          <Label>Role</Label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as AppRole)}
            className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
          <p className="mt-1 text-[11px] text-muted-foreground">{ROLE_DESCRIPTION[role]}</p>
        </div>
        <div>
          <Label>Branch</Label>
          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <Label>Welcome message <span className="text-muted-foreground/60 text-[10px]">(optional)</span></Label>
          <textarea
            value={welcome}
            onChange={(e) => setWelcome(e.target.value)}
            rows={3}
            placeholder="Add a short note to include in the invitation."
            className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>
      </div>
      <div className="mt-6 flex items-center justify-end gap-2">
        <button onClick={onClose} className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent">Cancel</button>
        <button
          onClick={submit}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          <Mail className="h-4 w-4" /> {busy ? "Sending…" : "Send Invitation"}
        </button>
      </div>
    </ModalShell>
  );
}

/* ---------- Role Modal ---------- */

function RoleModal({ row, onClose, onSave }: {
  row: UserListRow; onClose: () => void; onSave: (r: AppRole) => Promise<void> | void;
}) {
  const [role, setRole] = useState<AppRole>(row.role);
  return (
    <ModalShell title="Edit Role" subtitle={`${row.name} · ${row.email}`} onClose={onClose}>
      <div className="space-y-2">
        {ROLES.map((r) => {
          const active = role === r;
          const isOwnerRole = r === "owner";
          return (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              disabled={isOwnerRole && row.role !== "owner"}
              className={cn(
                "w-full text-left rounded-lg border px-4 py-3 transition",
                active ? "border-primary/60 bg-primary/5" : "border-border bg-card hover:bg-accent",
                isOwnerRole && row.role !== "owner" && "opacity-50 cursor-not-allowed",
              )}
              title={isOwnerRole && row.role !== "owner" ? "Owner role is restricted" : ""}
            >
              <div className="flex items-center justify-between">
                <div className="text-[13px] font-semibold tracking-tight">{ROLE_LABEL[r]}</div>
                {active && <CheckCircle2 className="h-4 w-4 text-primary" />}
              </div>
              <p className="mt-1 text-[11.5px] text-muted-foreground leading-relaxed">{ROLE_DESCRIPTION[r]}</p>
            </button>
          );
        })}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent">Cancel</button>
        <button
          onClick={() => onSave(role)}
          disabled={role === row.role}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          Save Role
        </button>
      </div>
    </ModalShell>
  );
}

/* ---------- Activity Panel ---------- */

function ActivityPanel({ rows, profileById, onClose }: {
  rows: AuditRow[];
  profileById: Record<string, ProfileRow>;
  onClose: () => void;
}) {
  return (
    <div className="mt-8 rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold tracking-tight inline-flex items-center gap-2">
            <History className="h-3.5 w-3.5" /> Audit trail
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Latest 40 activity events.</div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      {rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">No activity recorded yet.</div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => {
            const actor = r.actor_user_id ? (profileById[r.actor_user_id]?.full_name ?? profileById[r.actor_user_id]?.email ?? "Unknown") : "System";
            return (
              <li key={r.id} className="px-5 py-3 text-sm flex items-start gap-3">
                <div className="h-7 w-7 rounded-full bg-secondary grid place-items-center text-[10px] font-semibold mt-0.5">
                  {initials(actor)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px]">
                    <span className="font-medium">{actor}</span>{" "}
                    <span className="text-muted-foreground">{prettyAction(r.action)}</span>
                    {r.table_name && <span className="text-muted-foreground"> · {r.table_name}</span>}
                  </div>
                  {r.metadata && Object.keys(r.metadata).length > 0 && (
                    <div className="text-[11px] text-muted-foreground mt-0.5 break-words">
                      {Object.entries(r.metadata).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(" · ")}
                    </div>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString()}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function prettyAction(a: string) {
  const map: Record<string, string> = {
    role_change:       "changed a user's role",
    user_disabled:     "disabled a user",
    user_enabled:      "enabled a user",
    user_removed:      "removed a user",
    invite_created:    "sent an invitation",
    invite_resent:     "re-sent an invitation",
    invite_cancelled:  "cancelled an invitation",
  };
  return map[a] ?? a.replace(/_/g, " ");
}

/* ---------- Modal scaffolding ---------- */

function ModalShell({ title, subtitle, onClose, children }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
            {subtitle && <p className="text-[11.5px] text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{children}</label>;
}
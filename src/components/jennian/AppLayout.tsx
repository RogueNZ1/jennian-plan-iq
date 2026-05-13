import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, Briefcase, Upload, ClipboardCheck, FileText,
  LayoutTemplate, BarChart3, Users, Settings, Search, Bell, LogOut, Layers,
  CheckCircle2, FileSpreadsheet, AlertTriangle, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth, initialsFor } from "@/hooks/use-auth";
import { useEffect, useState, useRef } from "react";
import { HouseFrame } from "./HouseFrame";
import { useRoles } from "@/hooks/use-roles";
import { supabase } from "@/integrations/supabase/client";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; gate?: "admin" | "owner" };
const nav: NavItem[] = [
  { to: "/",               label: "Dashboard",       icon: LayoutDashboard },
  { to: "/jobs",           label: "Jobs",            icon: Briefcase },
  { to: "/upload",         label: "Upload Plan",     icon: Upload },
  { to: "/review",         label: "Quantity Review", icon: ClipboardCheck },
  { to: "/modules",        label: "Modules",         icon: Layers },
  { to: "/specifications", label: "Specifications",  icon: FileText },
  { to: "/templates",      label: "Templates",       icon: LayoutTemplate },
  { to: "/reports",        label: "Reports",         icon: BarChart3 },
  { to: "/users",          label: "Users",           icon: Users,    gate: "admin" },
  { to: "/settings",       label: "Settings",        icon: Settings, gate: "owner" },
];

type SearchResult = { id: string; job_number: string; client_name: string; address: string };
type NotifItem = { id: string; job_number: string; client_name: string; status: string; created_at: string };

function notifIcon(status: string) {
  if (status === "approved") return <CheckCircle2 className="h-3.5 w-3.5 text-confidence-high shrink-0" />;
  if (status === "exported") return <FileSpreadsheet className="h-3.5 w-3.5 text-primary shrink-0" />;
  return <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />;
}

function notifLabel(status: string, jobNumber: string, clientName: string) {
  if (status === "approved") return `${jobNumber} approved`;
  if (status === "exported") return `${jobNumber} exported`;
  return `${jobNumber} requires review`;
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { user, loading, signOut } = useAuth();
  const { isOwner, isAdmin, loading: rolesLoading } = useRoles();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const [notifications, setNotifications] = useState<NotifItem[]>([]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  // Load notifications once on mount
  useEffect(() => {
    supabase
      .from("jobs")
      .select("id, job_number, client_name, status, created_at")
      .in("status", ["approved", "exported", "review_required"])
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => setNotifications((data ?? []) as NotifItem[]));
  }, []);

  // Outside-click handler for all dropdowns
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Debounced search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (searchQuery.length < 2) { setSearchResults([]); setSearchOpen(false); return; }
    searchTimer.current = setTimeout(async () => {
      const q = searchQuery.replace(/'/g, "''");
      const { data } = await supabase
        .from("jobs")
        .select("id, job_number, client_name, address")
        .or(`job_number.ilike.%${q}%,client_name.ilike.%${q}%,address.ilike.%${q}%`)
        .limit(8);
      setSearchResults((data ?? []) as SearchResult[]);
      setSearchOpen(true);
    }, 300);
  }, [searchQuery]);

  if (loading || !user) {
    return <div className="min-h-screen grid place-items-center bg-background text-sm text-muted-foreground">Loading…</div>;
  }

  const initials = initialsFor(user);
  const displayName = (user.user_metadata?.full_name as string | undefined) || user.email || "";

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border relative">
        {/* Top red rule — proprietary brand cue */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary/90" />

        <div className="px-6 pt-7 pb-5">
          <div className="leading-none">
            <div className="text-[22px] font-semibold tracking-tight text-white">
              Jennian <span className="text-primary">IQ</span>
            </div>
            <div className="mt-2 text-[11.5px] text-sidebar-foreground/55 leading-snug">
              Plans · Quantities · Pricing · Procurement
            </div>
          </div>
          <div className="mt-5 h-px bg-sidebar-border/70" />
        </div>

        <nav className="px-3 flex-1 space-y-0.5 overflow-y-auto">
          {nav.filter((item) => {
            if (rolesLoading) return true;
            if (item.gate === "owner") return isOwner;
            if (item.gate === "admin") return isAdmin;
            return true;
          }).map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? path === "/" : path.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "group relative flex items-center gap-3 rounded-md px-3 py-2 text-[13.5px] font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-white"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-white",
                )}
              >
                {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary" />}
                <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground")} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mx-3 mb-4 mt-4 rounded-lg bg-[oklch(0.18_0.01_260)] border border-sidebar-border/70 overflow-hidden">
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center gap-1.5">
              <span className="h-px w-5 bg-primary" />
              <span className="text-[9.5px] uppercase tracking-[0.22em] text-sidebar-foreground/55 font-medium">Estimating workspace</span>
            </div>
            <div className="mt-1 text-[12.5px] text-sidebar-foreground/85 leading-snug">Plans, quantities and pricing preparation.</div>
          </div>
          <div className="px-3 pb-2">
            <HouseFrame className="w-full text-sidebar-foreground/65" />
          </div>
          <div className="mx-4 my-2 h-px bg-sidebar-border/70" />
          <div className="px-4 pb-3.5">
            <div className="text-[9.5px] uppercase tracking-[0.22em] text-sidebar-foreground/45 font-medium">Workspace</div>
            <div className="mt-0.5 text-[13px] font-medium text-white">Jennian Homes Manawatū</div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border bg-background/80 backdrop-blur sticky top-0 z-10 flex items-center justify-between px-6">
          {/* Search */}
          <div ref={searchRef} className="relative flex items-center gap-2 text-sm text-muted-foreground">
            <Search className="h-4 w-4 shrink-0" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
              placeholder="Search jobs, clients, addresses…"
              className="bg-transparent outline-none placeholder:text-muted-foreground/70 w-80"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => { setSearchQuery(""); setSearchResults([]); setSearchOpen(false); }}
                className="text-muted-foreground/60 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            {searchOpen && searchResults.length > 0 && (
              <div className="absolute top-full left-0 mt-2 w-[420px] rounded-md border border-border bg-card shadow-md py-1 z-30">
                {searchResults.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setSearchOpen(false);
                      navigate({ to: "/jobs/$jobId", params: { jobId: r.id } });
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-accent transition-colors flex items-start gap-3"
                  >
                    <div className="mt-0.5 h-6 w-6 rounded bg-muted grid place-items-center shrink-0">
                      <Briefcase className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium truncate">{r.job_number} · {r.client_name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{r.address}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {searchOpen && searchQuery.length >= 2 && searchResults.length === 0 && (
              <div className="absolute top-full left-0 mt-2 w-80 rounded-md border border-border bg-card shadow-md py-3 px-4 z-30 text-sm text-muted-foreground">
                No jobs found.
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            {/* Bell */}
            <div ref={bellRef} className="relative">
              <button
                type="button"
                onClick={() => setBellOpen((v) => !v)}
                className="relative text-muted-foreground hover:text-foreground"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
                {notifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />
                )}
              </button>
              {bellOpen && (
                <div className="absolute right-0 mt-2 w-72 rounded-md border border-border bg-card shadow-md py-1 z-20">
                  <div className="px-3 py-2 border-b border-border">
                    <div className="text-[12px] font-semibold">Notifications</div>
                  </div>
                  {notifications.length === 0 ? (
                    <div className="px-4 py-5 text-[12px] text-muted-foreground text-center">No notifications</div>
                  ) : (
                    <ul className="max-h-72 overflow-y-auto divide-y divide-border">
                      {notifications.map((n) => (
                        <li key={n.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setBellOpen(false);
                              navigate({ to: "/jobs/$jobId", params: { jobId: n.id } });
                            }}
                            className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors flex items-start gap-2"
                          >
                            {notifIcon(n.status)}
                            <div className="min-w-0">
                              <div className="text-[12px] font-medium truncate">
                                {notifLabel(n.status, n.job_number, n.client_name)}
                              </div>
                              <div className="text-[10.5px] text-muted-foreground">{n.client_name}</div>
                              <div className="text-[10px] text-muted-foreground/70 tabular-nums">
                                {new Date(n.created_at).toLocaleDateString()}
                              </div>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* User menu */}
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="h-8 w-8 rounded-full bg-secondary grid place-items-center text-[12px] font-semibold hover:ring-2 hover:ring-primary/30 transition"
                aria-label="User menu"
              >
                {initials}
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-md border border-border bg-card shadow-md py-1 z-20">
                  <div className="px-3 py-2 border-b border-border">
                    <div className="text-[13px] font-medium truncate">{displayName}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{user.email}</div>
                  </div>
                  <button
                    onClick={async () => { await signOut(); navigate({ to: "/login" }); }}
                    className="w-full text-left px-3 py-2 text-[13px] hover:bg-accent flex items-center gap-2"
                  >
                    <LogOut className="h-3.5 w-3.5" /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function ConfidencePill({ level }: { level: "high" | "mid" | "low" }) {
  const map = {
    high: { bg: "bg-confidence-high-bg", text: "text-confidence-high", label: "High" },
    mid:  { bg: "bg-confidence-mid-bg",  text: "text-confidence-mid",  label: "Review" },
    low:  { bg: "bg-confidence-low-bg",  text: "text-confidence-low",  label: "Low" },
  } as const;
  const m = map[level];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium", m.bg, m.text)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", level === "high" && "bg-confidence-high", level === "mid" && "bg-confidence-mid", level === "low" && "bg-confidence-low")} />
      {m.label}
    </span>
  );
}

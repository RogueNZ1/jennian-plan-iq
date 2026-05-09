import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Briefcase, Upload, ClipboardCheck, FileText,
  LayoutTemplate, BarChart3, Users, Settings, Search, Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/",                 label: "Dashboard",        icon: LayoutDashboard },
  { to: "/jobs",             label: "Jobs",             icon: Briefcase },
  { to: "/upload",           label: "Upload Plan",      icon: Upload },
  { to: "/review",           label: "Quantity Review",  icon: ClipboardCheck },
  { to: "/specifications",   label: "Specifications",   icon: FileText },
  { to: "/templates",        label: "Templates",        icon: LayoutTemplate },
  { to: "/reports",          label: "Reports",          icon: BarChart3 },
  { to: "/users",            label: "Users",            icon: Users },
  { to: "/settings",         label: "Settings",         icon: Settings },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="px-6 pt-7 pb-6">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-md bg-primary grid place-items-center text-primary-foreground font-semibold text-sm tracking-tight">
              J
            </div>
            <div className="leading-tight">
              <div className="text-[15px] font-semibold tracking-tight text-white">Jennian IQ</div>
              <div className="text-[11px] text-sidebar-foreground/60">Built Smarter.</div>
            </div>
          </div>
        </div>

        <nav className="px-3 flex-1 space-y-0.5">
          {nav.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? path === "/" : path.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "group flex items-center gap-3 rounded-md px-3 py-2 text-[13.5px] font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-white"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-white",
                )}
              >
                <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground")} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 mx-3 mb-4 rounded-md bg-sidebar-accent/60 border border-sidebar-border/60">
          <div className="text-[11px] uppercase tracking-wide text-sidebar-foreground/50">Workspace</div>
          <div className="mt-1 text-[13px] font-medium text-white">Jennian Homes Manawatū</div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border bg-background/80 backdrop-blur sticky top-0 z-10 flex items-center justify-between px-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Search className="h-4 w-4" />
            <input placeholder="Search jobs, clients, addresses…" className="bg-transparent outline-none placeholder:text-muted-foreground/70 w-80" />
          </div>
          <div className="flex items-center gap-4">
            <button className="text-muted-foreground hover:text-foreground"><Bell className="h-4 w-4" /></button>
            <div className="h-8 w-8 rounded-full bg-secondary grid place-items-center text-[12px] font-semibold">RM</div>
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

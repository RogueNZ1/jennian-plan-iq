import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";

export type AppRole = "owner" | "admin" | "estimator" | "project_manager" | "viewer";

export const ROLE_LABEL: Record<AppRole, string> = {
  owner:           "Owner",
  admin:           "Admin",
  estimator:       "Estimator",
  project_manager: "Project Manager",
  viewer:          "Viewer",
};

export const ROLE_DESCRIPTION: Record<AppRole, string> = {
  owner:           "Full access including users, settings, templates and exports.",
  admin:           "Manages jobs, modules, templates, reports and users (cannot edit Owner).",
  estimator:       "Uploads plans, runs quantity review, edits and approves modules, exports.",
  project_manager: "Reviews modules, adds notes, flags issues and comments on quantities.",
  viewer:          "Read-only access to jobs, reports and approved quantities.",
};

export function useRoles() {
  const { user, loading: authLoading } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (authLoading) return;
    if (!user) { setRoles([]); setLoading(false); return; }
    setLoading(true);
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (cancelled) return;
        setRoles(((data ?? []) as Array<{ role: AppRole }>).map((r) => r.role));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user, authLoading]);

  const isLoading = loading || authLoading;
  // While roles are still loading we MUST default every capability flag to
  // `false`. Otherwise admin/owner-only menu items can flash for users who
  // do not have the role before the fetch resolves.
  const has = (r: AppRole) => !isLoading && roles.includes(r);
  const hasAny = (...rs: AppRole[]) => !isLoading && rs.some((r) => roles.includes(r));

  return {
    roles,
    loading: isLoading,
    has,
    hasAny,
    isOwner:          has("owner"),
    isAdmin:          hasAny("owner", "admin"),
    canWrite:         hasAny("owner", "admin", "estimator"),
    canManageUsers:   hasAny("owner", "admin"),
    canEditSettings:  hasAny("owner", "admin"),
    canEditTemplates: hasAny("owner", "admin"),
    canApprove:       hasAny("owner", "admin", "estimator"),
    canReview:        hasAny("owner", "admin", "estimator", "project_manager"),
    canComment:       hasAny("owner", "admin", "estimator", "project_manager"),
  };
}
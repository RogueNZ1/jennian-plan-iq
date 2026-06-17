import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthError, Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { ProfileStatus } from "@/lib/auth/activation";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  profileStatus: ProfileStatus | null;
  requiresPasswordSetup: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  profileStatus: null,
  requiresPasswordSetup: false,
  loading: true,
  signIn: async () => ({ error: null }),
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let authEventSeen = false;

    async function applySession(s: Session | null) {
      if (!active) return;
      setSession(s);
      if (!s?.user) {
        setProfileStatus(null);
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("status")
        .eq("id", s.user.id)
        .maybeSingle();
      if (!active) return;
      setProfileStatus((data?.status ?? "invited") as ProfileStatus);
      setLoading(false);
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!active) return;
      authEventSeen = true;
      void applySession(s);
    });

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active || authEventSeen) return;
        void applySession(data.session);
      })
      .catch(() => {
        if (!active) return;
        setSession(null);
        setProfileStatus(null);
        setLoading(false);
      });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <Ctx.Provider
      value={{
        user: session?.user ?? null,
        session,
        profileStatus,
        requiresPasswordSetup: profileStatus === "invited",
        loading,
        signIn: async (email, password) => {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          if (!error) {
            setLoading(true);
            setSession(data.session);
            if (data.session?.user) {
              const { data: profile } = await supabase
                .from("profiles")
                .select("status")
                .eq("id", data.session.user.id)
                .maybeSingle();
              setProfileStatus((profile?.status ?? "invited") as ProfileStatus);
            } else {
              setProfileStatus(null);
            }
            setLoading(false);
          }
          return { error };
        },
        signOut: async () => {
          setSession(null);
          setProfileStatus(null);
          await supabase.auth.signOut();
        },
        refreshProfile: async () => {
          const current = session?.user;
          if (!current) {
            setProfileStatus(null);
            return;
          }
          const { data } = await supabase
            .from("profiles")
            .select("status")
            .eq("id", current.id)
            .maybeSingle();
          setProfileStatus((data?.status ?? "invited") as ProfileStatus);
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  return useContext(Ctx);
}

export function initialsFor(user: User | null): string {
  if (!user) return "·";
  const meta = (user.user_metadata?.full_name as string | undefined) || user.email || "";
  const parts = meta.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "U";
}

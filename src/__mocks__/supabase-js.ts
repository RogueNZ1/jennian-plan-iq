// Lightweight fetch-based Supabase client stub for the Lovable sandbox.
// Implements just enough of @supabase/supabase-js for auth + PostgREST queries.

type Session = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
  user: any;
} | null;

type AuthChangeCb = (event: string, session: Session) => void;

const STORAGE_KEY = "sb-auth-session";

function loadSession(): Session {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(s: Session) {
  if (typeof localStorage === "undefined") return;
  try {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function createClient(url: string, key: string, _opts?: any) {
  let session: Session = loadSession();
  const listeners = new Set<AuthChangeCb>();

  const authHeaders = () => ({
    apikey: key,
    Authorization: `Bearer ${session?.access_token ?? key}`,
  });

  function emit(event: string) {
    for (const cb of listeners) {
      try { cb(event, session); } catch {}
    }
  }

  async function refreshIfNeeded() {
    if (!session?.refresh_token) return;
    const exp = session.expires_at ? session.expires_at * 1000 : 0;
    if (exp && exp - Date.now() > 60_000) return;
    try {
      const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { apikey: key, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      if (res.ok) {
        const data = await res.json();
        session = data as Session;
        saveSession(session);
        emit("TOKEN_REFRESHED");
      } else {
        session = null;
        saveSession(null);
        emit("SIGNED_OUT");
      }
    } catch {}
  }

  const auth = {
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      try {
        const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
          method: "POST",
          headers: { apikey: key, "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          return { data: { user: null, session: null }, error: { message: data.error_description || data.msg || data.message || "Sign-in failed", status: res.status, name: "AuthError" } };
        }
        session = data as Session;
        saveSession(session);
        emit("SIGNED_IN");
        return { data: { user: session?.user ?? null, session }, error: null };
      } catch (e: any) {
        return { data: { user: null, session: null }, error: { message: e?.message || "Network error", name: "AuthError" } };
      }
    },
    async signUp({ email, password, options }: any) {
      try {
        const res = await fetch(`${url}/auth/v1/signup`, {
          method: "POST",
          headers: { apikey: key, "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, data: options?.data, gotrue_meta_security: {} }),
        });
        const data = await res.json();
        if (!res.ok) return { data: { user: null, session: null }, error: { message: data.error_description || data.msg || "Sign-up failed", name: "AuthError" } };
        if (data.access_token) {
          session = data as Session;
          saveSession(session);
          emit("SIGNED_IN");
        }
        return { data: { user: data.user ?? null, session: data.access_token ? session : null }, error: null };
      } catch (e: any) {
        return { data: { user: null, session: null }, error: { message: e?.message, name: "AuthError" } };
      }
    },
    async signOut() {
      try {
        if (session?.access_token) {
          await fetch(`${url}/auth/v1/logout`, {
            method: "POST",
            headers: { apikey: key, Authorization: `Bearer ${session.access_token}` },
          });
        }
      } catch {}
      session = null;
      saveSession(null);
      emit("SIGNED_OUT");
      return { error: null };
    },
    async getSession() {
      await refreshIfNeeded();
      return { data: { session }, error: null };
    },
    async getUser() {
      await refreshIfNeeded();
      return { data: { user: session?.user ?? null }, error: null };
    },
    onAuthStateChange(cb: AuthChangeCb) {
      listeners.add(cb);
      // Fire INITIAL_SESSION asynchronously like the real client.
      Promise.resolve().then(() => {
        try { cb("INITIAL_SESSION", session); } catch {}
      });
      return {
        data: {
          subscription: {
            id: Math.random().toString(36).slice(2),
            callback: cb,
            unsubscribe: () => listeners.delete(cb),
          },
        },
      };
    },
    async resetPasswordForEmail(email: string, options?: any) {
      try {
        await fetch(`${url}/auth/v1/recover`, {
          method: "POST",
          headers: { apikey: key, "Content-Type": "application/json" },
          body: JSON.stringify({ email, gotrue_meta_security: {}, redirect_to: options?.redirectTo }),
        });
        return { data: {}, error: null };
      } catch (e: any) {
        return { data: null, error: { message: e?.message, name: "AuthError" } };
      }
    },
    async updateUser(attrs: any) {
      try {
        const res = await fetch(`${url}/auth/v1/user`, {
          method: "PUT",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(attrs),
        });
        const data = await res.json();
        if (!res.ok) return { data: { user: null }, error: { message: data.msg || "Update failed", name: "AuthError" } };
        if (session) { session.user = data; saveSession(session); }
        return { data: { user: data }, error: null };
      } catch (e: any) {
        return { data: { user: null }, error: { message: e?.message, name: "AuthError" } };
      }
    },
  };

  // ---- PostgREST query builder ----
  function buildQuery(table: string, schema = "public") {
    const filters: string[] = [];
    let method: "GET" | "POST" | "PATCH" | "DELETE" = "GET";
    let body: any = undefined;
    let selectCols = "*";
    let order: string | undefined;
    let limit: number | undefined;
    let rangeFrom: number | undefined;
    let rangeTo: number | undefined;
    let single = false;
    let maybeSingle = false;
    let prefer: string[] = [];
    let csv = false;

    const qb: any = {};

    function exec() {
      const params = new URLSearchParams();
      if (selectCols) params.set("select", selectCols);
      for (const f of filters) {
        const [k, v] = f.split("=", 2);
        params.append(k, v);
      }
      if (order) params.set("order", order);
      if (limit != null) params.set("limit", String(limit));

      const headers: Record<string, string> = { ...authHeaders(), "Content-Type": "application/json" };
      if (schema !== "public") headers["Accept-Profile"] = schema;
      if (schema !== "public" && method !== "GET") headers["Content-Profile"] = schema;
      if (rangeFrom != null) headers["Range"] = `${rangeFrom}-${rangeTo ?? ""}`;
      if (single) headers["Accept"] = "application/vnd.pgrst.object+json";
      else if (maybeSingle) headers["Accept"] = "application/vnd.pgrst.object+json";
      if (csv) headers["Accept"] = "text/csv";
      if (prefer.length) headers["Prefer"] = prefer.join(",");

      const init: RequestInit = { method, headers };
      if (body !== undefined) init.body = JSON.stringify(body);

      return fetch(`${url}/rest/v1/${table}?${params.toString()}`, init)
        .then(async (res) => {
          const ct = res.headers.get("content-type") || "";
          let data: any = null;
          if (res.status !== 204) {
            if (ct.includes("application/json")) data = await res.json().catch(() => null);
            else data = await res.text().catch(() => null);
          }
          if (!res.ok) {
            if (maybeSingle && res.status === 406) return { data: null, error: null, count: null, status: res.status, statusText: res.statusText };
            const err = data && typeof data === "object" ? data : { message: typeof data === "string" ? data : res.statusText };
            return { data: null, error: { ...err, status: res.status, name: "PostgrestError" }, count: null, status: res.status, statusText: res.statusText };
          }
          return { data, error: null, count: null, status: res.status, statusText: res.statusText };
        })
        .catch((e) => ({ data: null, error: { message: e?.message || "Network error", name: "PostgrestError" }, count: null, status: 0, statusText: "" }));
    }

    qb.select = (cols = "*", opts?: { head?: boolean; count?: string }) => {
      selectCols = cols;
      if (opts?.head) method = "GET";
      return qb;
    };
    qb.insert = (values: any, _opts?: any) => { method = "POST"; body = values; prefer.push("return=representation"); return qb; };
    qb.upsert = (values: any, opts?: any) => {
      method = "POST"; body = values;
      prefer.push("return=representation", `resolution=${opts?.ignoreDuplicates ? "ignore-duplicates" : "merge-duplicates"}`);
      if (opts?.onConflict) filters.push(`on_conflict=${opts.onConflict}`);
      return qb;
    };
    qb.update = (values: any) => { method = "PATCH"; body = values; prefer.push("return=representation"); return qb; };
    qb.delete = () => { method = "DELETE"; prefer.push("return=representation"); return qb; };

    const addFilter = (col: string, op: string, val: any) => {
      const v = Array.isArray(val) ? `(${val.map((x) => String(x)).join(",")})` : String(val);
      filters.push(`${col}=${op}.${v}`);
      return qb;
    };
    qb.eq = (c: string, v: any) => addFilter(c, "eq", v);
    qb.neq = (c: string, v: any) => addFilter(c, "neq", v);
    qb.gt = (c: string, v: any) => addFilter(c, "gt", v);
    qb.gte = (c: string, v: any) => addFilter(c, "gte", v);
    qb.lt = (c: string, v: any) => addFilter(c, "lt", v);
    qb.lte = (c: string, v: any) => addFilter(c, "lte", v);
    qb.like = (c: string, v: any) => addFilter(c, "like", v);
    qb.ilike = (c: string, v: any) => addFilter(c, "ilike", v);
    qb.is = (c: string, v: any) => addFilter(c, "is", v);
    qb.in = (c: string, v: any[]) => addFilter(c, "in", v);
    qb.contains = (c: string, v: any) => addFilter(c, "cs", typeof v === "string" ? v : JSON.stringify(v));
    qb.containedBy = (c: string, v: any) => addFilter(c, "cd", typeof v === "string" ? v : JSON.stringify(v));
    qb.not = (c: string, op: string, v: any) => { filters.push(`${c}=not.${op}.${v}`); return qb; };
    qb.or = (expr: string) => { filters.push(`or=(${expr})`); return qb; };
    qb.filter = (c: string, op: string, v: any) => addFilter(c, op, v);
    qb.match = (obj: Record<string, any>) => { for (const [k, v] of Object.entries(obj)) addFilter(k, "eq", v); return qb; };

    qb.order = (col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) => {
      const dir = opts?.ascending === false ? "desc" : "asc";
      const nulls = opts?.nullsFirst ? ".nullsfirst" : ".nullslast";
      order = `${col}.${dir}${nulls}`;
      return qb;
    };
    qb.limit = (n: number) => { limit = n; return qb; };
    qb.range = (from: number, to: number) => { rangeFrom = from; rangeTo = to; return qb; };
    qb.single = () => { single = true; return qb; };
    qb.maybeSingle = () => { maybeSingle = true; return qb; };
    qb.csv = () => { csv = true; return qb; };

    qb.then = (onF: any, onR: any) => exec().then(onF, onR);
    qb.catch = (onR: any) => exec().catch(onR);

    return qb;
  }

  const storage = {
    from(bucket: string) {
      return {
        async upload(path: string, file: any, opts?: any) {
          try {
            const headers: Record<string, string> = { ...authHeaders() };
            if (opts?.contentType) headers["Content-Type"] = opts.contentType;
            if (opts?.upsert) headers["x-upsert"] = "true";
            const res = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, { method: "POST", headers, body: file });
            const data = await res.json().catch(() => null);
            if (!res.ok) return { data: null, error: { message: data?.message || "Upload failed", name: "StorageError" } };
            return { data: { path, ...(data || {}) }, error: null };
          } catch (e: any) {
            return { data: null, error: { message: e?.message, name: "StorageError" } };
          }
        },
        async download(path: string) {
          try {
            const res = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, { headers: authHeaders() });
            if (!res.ok) return { data: null, error: { message: "Download failed", name: "StorageError" } };
            return { data: await res.blob(), error: null };
          } catch (e: any) {
            return { data: null, error: { message: e?.message, name: "StorageError" } };
          }
        },
        async remove(paths: string[]) {
          try {
            const res = await fetch(`${url}/storage/v1/object/${bucket}`, {
              method: "DELETE",
              headers: { ...authHeaders(), "Content-Type": "application/json" },
              body: JSON.stringify({ prefixes: paths }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) return { data: null, error: { message: data?.message || "Remove failed", name: "StorageError" } };
            return { data, error: null };
          } catch (e: any) {
            return { data: null, error: { message: e?.message, name: "StorageError" } };
          }
        },
        async createSignedUrl(path: string, expiresIn: number) {
          try {
            const res = await fetch(`${url}/storage/v1/object/sign/${bucket}/${path}`, {
              method: "POST",
              headers: { ...authHeaders(), "Content-Type": "application/json" },
              body: JSON.stringify({ expiresIn }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) return { data: null, error: { message: data?.message || "Signing failed", name: "StorageError" } };
            return { data: { signedUrl: `${url}/storage/v1${data.signedURL || data.signedUrl || ""}`, ...(data || {}) }, error: null };
          } catch (e: any) {
            return { data: null, error: { message: e?.message, name: "StorageError" } };
          }
        },
        getPublicUrl(path: string) {
          return { data: { publicUrl: `${url}/storage/v1/object/public/${bucket}/${path}` } };
        },
      };
    },
  };

  async function functionsInvoke(name: string, opts?: { body?: any; headers?: Record<string, string> }) {
    try {
      const res = await fetch(`${url}/functions/v1/${name}`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json", ...(opts?.headers || {}) },
        body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
      const ct = res.headers.get("content-type") || "";
      const data = ct.includes("application/json") ? await res.json().catch(() => null) : await res.text().catch(() => null);
      if (!res.ok) return { data: null, error: { message: (data && (data as any).message) || "Function error", name: "FunctionsError", status: res.status } };
      return { data, error: null };
    } catch (e: any) {
      return { data: null, error: { message: e?.message, name: "FunctionsError" } };
    }
  }

  function channel(_name: string, _opts?: any) {
    const ch: any = {
      on: () => ch,
      subscribe: (cb?: any) => { try { cb && cb("SUBSCRIBED"); } catch {} return ch; },
      unsubscribe: async () => ({ error: null }),
      send: async () => ({ error: null }),
    };
    return ch;
  }

  return {
    auth,
    from: (table: string) => buildQuery(table),
    schema: (s: string) => ({ from: (table: string) => buildQuery(table, s) }),
    storage,
    functions: { invoke: functionsInvoke },
    channel,
    removeChannel: async (_ch: any) => "ok",
    getChannels: () => [],
    rpc: async (fn: string, args?: any) => {
      try {
        const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(args || {}),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) return { data: null, error: { message: (data && (data as any).message) || "RPC failed", name: "PostgrestError", status: res.status } };
        return { data, error: null };
      } catch (e: any) {
        return { data: null, error: { message: e?.message, name: "PostgrestError" } };
      }
    },
  };
}

// Stub for @supabase/supabase-js — not available in the sandbox npm registry.
// The real package loads in the Lovable dev/prod environment.

type AnyFn = (...args: unknown[]) => unknown;

const noop = () => undefined;
const chainable: Record<string, AnyFn> = new Proxy({}, {
  get: () => () => chainable,
}) as Record<string, AnyFn>;

const queryBuilder = () => chainable;

export function createClient(_url: string, _key: string, _opts?: unknown) {
  return {
    from: () => ({
      select: queryBuilder,
      insert: queryBuilder,
      update: queryBuilder,
      delete: queryBuilder,
      upsert: queryBuilder,
      eq: queryBuilder,
      neq: queryBuilder,
      or: queryBuilder,
      in: queryBuilder,
      gte: queryBuilder,
      lte: queryBuilder,
      gt: queryBuilder,
      lt: queryBuilder,
      not: queryBuilder,
      order: queryBuilder,
      limit: queryBuilder,
      single: queryBuilder,
      maybeSingle: queryBuilder,
      count: queryBuilder,
    }),
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: noop } } }),
      signInWithPassword: async () => ({ data: { user: null, session: null }, error: null }),
      signOut: async () => ({ error: null }),
    },
    storage: {
      from: () => ({
        download: async () => ({ data: null, error: new Error("Stub") }),
        upload: async () => ({ data: null, error: null }),
        createSignedUrl: async () => ({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
      }),
    },
    channel: () => ({ on: () => ({ subscribe: noop }) }),
    removeChannel: noop,
    rpc: async () => ({ data: null, error: null }),
  };
}

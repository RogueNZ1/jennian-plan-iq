// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { resolve } from "path";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    resolve: {
      alias: [
        // Aliased to local stubs so the build resolves without the packages.
        // Order matters — more specific entries must come first.
        { find: /^pdfjs-dist\/build\/pdf\.worker\.min\.mjs$/, replacement: resolve("src/lib/pdfjs-worker-stub.mjs") },
        { find: /^pdfjs-dist$/, replacement: resolve("src/__mocks__/pdfjs-dist.ts") },
        { find: "@supabase/supabase-js", replacement: resolve("src/__mocks__/supabase-js.ts") },
      ],
    },
  },
});

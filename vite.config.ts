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
      alias: {
        // xlsx, pdfjs-dist, and @supabase/supabase-js are not in the sandbox registry.
        // Aliased to local stubs so the build resolves.
        "xlsx": resolve("src/__mocks__/xlsx.ts"),
        "pdfjs-dist": resolve("src/__mocks__/pdfjs-dist.ts"),
        "@supabase/supabase-js": resolve("src/__mocks__/supabase-js.ts"),
      },
    },
  },
});

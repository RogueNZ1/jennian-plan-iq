/**
 * LIVE validation config — used ONLY by the live-validate GitHub Actions workflow.
 * Differs from vitest.config.ts in exactly one way that matters: NO mock aliases.
 * The real @supabase/supabase-js connects to the real project (env-gated), so the
 * tests in tests/live/ exercise the production export code path end to end.
 */
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: true,
    include: ["tests/live/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});

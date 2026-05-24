import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { resolve } from "path";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      xlsx: resolve(__dirname, "src/__mocks__/xlsx.ts"),
      "@supabase/supabase-js": resolve(__dirname, "src/__mocks__/supabase-js.ts"),
    },
  },
  test: {
    environment: "happy-dom",
    globals: true,
    exclude: ["**/node_modules/**", "**/e2e/**"],
  },
});

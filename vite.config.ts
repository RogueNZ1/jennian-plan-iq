import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { resolve } from "path";

export default defineConfig({
  plugins: [
    ...tanstackStart({
      server: { preset: "vercel" },
    }),
    react(),
    tailwindcss(),
    tsConfigPaths(),
  ],
  resolve: {
    alias: [
      { find: /^pdfjs-dist\/build\/pdf\.worker\.min\.mjs$/, replacement: resolve("src/lib/pdfjs-worker-stub.mjs") },
      { find: /^pdfjs-dist$/, replacement: resolve("src/__mocks__/pdfjs-dist.ts") },
    ],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor';
          }
        },
      },
    },
  },
});

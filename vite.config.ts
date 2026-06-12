import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [...tanstackStart(), react(), tailwindcss(), tsConfigPaths()],
  // pdfjs-dist aliases removed — the library is now bundled directly by Vite.
  // pdf-pages.ts and pdf-thumbnail.ts import the worker via
  // "pdfjs-dist/build/pdf.worker.mjs?url" so Vite emits it as a hashed
  // static asset and the worker URL stays same-origin (CSP: worker-src 'self').
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
            return "react-vendor";
          }
        },
      },
    },
  },
});

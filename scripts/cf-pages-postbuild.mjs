/**
 * Post-build step for Cloudflare Pages deployment.
 *
 * TanStack Start outputs:
 *   dist/server/server.js          — WinterCG fetch handler
 *   dist/server/assets/            — SSR asset chunks (some import ../server.js)
 *   dist/client/assets/            — client-side asset chunks
 *
 * Cloudflare Pages needs everything under dist/client/:
 *   dist/client/_worker.js         — CF Pages worker entry with ASSETS binding
 *   dist/client/server.js          — satisfies `../server.js` import from client/assets/
 *   dist/client/assets/            — merged client + server assets
 *
 * In CF Pages Advanced Mode (_worker.js), ALL requests go through the worker —
 * including /assets/*.js and .css files. We must serve static assets via the
 * env.ASSETS binding before falling back to the SSR handler.
 */

import { writeFileSync, copyFileSync, cpSync, mkdirSync } from "fs";
import { join } from "path";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const serverJs = join(root, "dist", "server", "server.js");
const serverAssets = join(root, "dist", "server", "assets");
const clientDir = join(root, "dist", "client");
const clientAssets = join(root, "dist", "client", "assets");

mkdirSync(clientAssets, { recursive: true });

// server.js is imported by name from client/assets/ chunks via `../server.js`
copyFileSync(serverJs, join(clientDir, "server.js"));

// _worker.js wraps server.js: serves static assets via env.ASSETS first,
// then falls back to SSR for everything else.
const workerWrapper = `
import { default as handler } from "./server.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Cloudflare Pages does not auto-populate process.env from bindings.
    // Inject all string-valued bindings so SSR server functions can read them.
    for (const [k, v] of Object.entries(env)) {
      if (typeof v === "string") process.env[k] = v;
    }

    if (env.ASSETS) {
      const isStaticAsset =
        url.pathname.startsWith("/assets/") ||
        /\\.(js|css|woff2?|ttf|otf|png|jpg|jpeg|gif|svg|ico|webp|map)$/.test(url.pathname);
      if (isStaticAsset) {
        const assetRes = await env.ASSETS.fetch(request.clone());
        if (assetRes.status !== 404) return assetRes;
      }
    }
    return handler.fetch(request, env, ctx);
  },
};
`.trimStart();

writeFileSync(join(clientDir, "_worker.js"), workerWrapper);

cpSync(serverAssets, clientAssets, { recursive: true, force: true });

console.log("✓ Cloudflare Pages: wrote _worker.js (with ASSETS binding), server.js and server assets into dist/client/");

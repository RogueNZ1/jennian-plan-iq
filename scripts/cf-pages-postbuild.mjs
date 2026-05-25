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

// Security headers applied to every response.
// Keeps the list in one place so it's easy to audit and tighten over time.
const SECURITY_HEADERS = {
  // Enforce HTTPS for 1 year, include sub-domains
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  // Prevent clickjacking / framing by third-party sites
  "X-Frame-Options": "SAMEORIGIN",
  // Stop browsers from MIME-sniffing the declared content-type
  "X-Content-Type-Options": "nosniff",
  // Only send origin (not full URL) on cross-origin requests
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Disable features this app doesn't use
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  // CSP: lock down script/style origins; allow Supabase + Cloudflare endpoints
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",   // unsafe-* required by TanStack SSR hydration
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://jennian-iq-geometry-api-production.up.railway.app https://api.resend.com",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join("; "),
};

function applySecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// _worker.js wraps server.js: serves static assets via env.ASSETS first,
// then falls back to SSR for everything else.
// Security headers are injected on every outbound response.
const workerWrapper = `
import { default as handler } from "./server.js";

const SECURITY_HEADERS = ${JSON.stringify(SECURITY_HEADERS, null, 2)};

function applySecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

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
        if (assetRes.status !== 404) return applySecurityHeaders(assetRes);
      }
    }
    const res = await handler.fetch(request, env, ctx);
    return applySecurityHeaders(res);
  },
};
`.trimStart();

writeFileSync(join(clientDir, "_worker.js"), workerWrapper);

cpSync(serverAssets, clientAssets, { recursive: true, force: true });

console.log("✓ Cloudflare Pages: wrote _worker.js (with ASSETS binding, security headers), server.js and server assets into dist/client/");

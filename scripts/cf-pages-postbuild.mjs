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

import { writeFileSync, copyFileSync, cpSync, mkdirSync, readdirSync, readFileSync } from "fs";
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
  // CSP: lock down script/style origins; allow Supabase + Cloudflare endpoints.
  // The geometry API is now proxied through /api/geometry/* (same-origin), so
  // Railway's URL no longer needs to appear in connect-src.
  //
  // blob: is required in script-src + worker-src because pdf.js (pdfjs-dist)
  // creates Web Workers via blob: URLs for PDF rendering.  It is also required
  // in img-src because the page-selection thumbnail URLs are created with
  // URL.createObjectURL() which returns blob: scheme URLs.
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",   // unsafe-* for SSR hydration; blob: for pdf.js workers
    "worker-src 'self' blob:",                                  // explicit: pdf.js Web Worker
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.resend.com",
    "img-src 'self' data: blob: https:",                       // blob: for pdf.js page thumbnails
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

const GEOMETRY_API_UPSTREAM = "https://jennian-iq-geometry-api-production.up.railway.app";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Cloudflare Pages does not auto-populate process.env from bindings.
    // Inject all string-valued bindings so SSR server functions can read them.
    for (const [k, v] of Object.entries(env)) {
      if (typeof v === "string") process.env[k] = v;
    }

    // ── Geometry API proxy ─────────────────────────────────────────────────────
    // The browser POSTs to /api/geometry/* (same-origin, key never sent to client).
    // The worker injects GEOMETRY_API_KEY and forwards to the Railway service.
    if (url.pathname.startsWith("/api/geometry/")) {
      const apiKey = env.GEOMETRY_API_KEY;
      if (!apiKey) {
        return applySecurityHeaders(new Response("Geometry API not configured", { status: 503 }));
      }
      const upstreamPath = url.pathname.replace("/api/geometry", "");
      const upstreamUrl = GEOMETRY_API_UPSTREAM + upstreamPath + url.search;
      const proxied = new Request(upstreamUrl, {
        method: request.method,
        headers: (() => {
          const h = new Headers(request.headers);
          h.set("X-API-Key", apiKey);
          // Strip host header so Railway doesn't see our Pages domain
          h.delete("host");
          return h;
        })(),
        body: request.body,
        // Required to stream the multipart PDF body through
        duplex: "half",
      });
      const upstream = await fetch(proxied);
      // Rebuild response with security headers (no CORS headers — same-origin proxy)
      return applySecurityHeaders(new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: upstream.headers,
      }));
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

// ── Guard (v1.2.1): the geometry base must NOT leak into the prod bundle ──────────────
// Prod must resolve geometry to the same-origin proxy (/api/geometry). A dev override of
// VITE_GEOMETRY_API_BASE (e.g. http://localhost:8000 in .env.local) bakes into `vite build`
// and ships to prod — every browser then fetches localhost (nothing there) → measurePlanGeometry
// returns null → takeoffs silently fall back to vision-only. Scan the FINAL app bundle and fail
// the build if a non-proxy geometry base appears. _worker.js is excluded: it legitimately holds
// the Railway proxy upstream (GEOMETRY_API_UPSTREAM) — that's the server-side hop, not the bundle.
const GEOMETRY_LEAK_PATTERNS = [
  "http://localhost",
  "localhost:8000",
  "jennian-iq-geometry-api-production.up.railway.app",
];

// Narrow to the geometry-api chunk: GEOMETRY_API_BASE is a module-level const in
// geometry-api.ts, so any baked override lands in `geometry-api-*.js` (client + SSR copies).
// Scanning the whole bundle false-positives on unrelated third-party localhost refs
// (supabase-realtime's localhost:9999, a window.origin fallback) in index-*.js, and on
// _worker.js's legitimate Railway proxy upstream.
const geometryChunks = [];
const geometryLeaks = [];
for (const entry of readdirSync(clientDir, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
  if (!entry.name.includes("geometry-api")) continue;
  const dir = entry.parentPath ?? entry.path;
  const full = join(dir, entry.name);
  geometryChunks.push(full);
  const text = readFileSync(full, "utf8");
  for (const pat of GEOMETRY_LEAK_PATTERNS) {
    if (text.includes(pat)) geometryLeaks.push({ file: full.replace(root, "."), match: pat });
  }
}

if (geometryChunks.length === 0) {
  // The guard couldn't find its target — chunk naming may have changed. Don't silently pass.
  console.warn(
    "⚠ Geometry-base guard: no geometry-api chunk found to scan — verify the geometry base manually (chunk naming may have changed).",
  );
}

if (geometryLeaks.length > 0) {
  const first = geometryLeaks[0];
  console.error(
    `\n✗ Geometry base leaked into the prod bundle (found '${first.match}' in ${first.file}).\n` +
      "  Prod must resolve geometry to /api/geometry — a dev override of VITE_GEOMETRY_API_BASE\n" +
      "  has leaked; move it from .env.local to .env.development.local.",
  );
  if (geometryLeaks.length > 1) {
    console.error(
      "  matches: " + geometryLeaks.map((l) => `${l.match} @ ${l.file}`).join(", "),
    );
  }
  process.exit(1);
}
console.log("✓ Geometry-base guard: bundle resolves geometry to the /api/geometry proxy (no dev override leaked).");

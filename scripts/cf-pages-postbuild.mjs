/**
 * Post-build step for Cloudflare Pages deployment.
 *
 * TanStack Start outputs:
 *   dist/server/server.js          — WinterCG fetch handler
 *   dist/server/assets/            — SSR asset chunks (some import ../server.js)
 *   dist/client/assets/            — client-side asset chunks
 *
 * Cloudflare Pages needs everything under dist/client/:
 *   dist/client/_worker.js         — CF Pages worker entry (copy of server.js)
 *   dist/client/server.js          — satisfies `../server.js` import from client/assets/
 *   dist/client/assets/            — merged client + server assets
 */

import { copyFileSync, cpSync, mkdirSync } from "fs";
import { join } from "path";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const serverJs = join(root, "dist", "server", "server.js");
const serverAssets = join(root, "dist", "server", "assets");
const clientDir = join(root, "dist", "client");
const clientAssets = join(root, "dist", "client", "assets");

mkdirSync(clientAssets, { recursive: true });

copyFileSync(serverJs, join(clientDir, "_worker.js"));
copyFileSync(serverJs, join(clientDir, "server.js"));
cpSync(serverAssets, clientAssets, { recursive: true, force: true });

console.log("✓ Cloudflare Pages: copied _worker.js, server.js and server assets into dist/client/");

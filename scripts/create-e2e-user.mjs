/**
 * One-time script: create (or reset) the E2E test user in Supabase production.
 *
 * Usage: node scripts/create-e2e-user.mjs
 *
 * Reads VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY from .env in the project root.
 * Updates .env.local with PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");

// ── Parse .env without dotenv dep ────────────────────────────────────────────
function parseEnv(filePath) {
  try {
    return Object.fromEntries(
      readFileSync(filePath, "utf8")
        .split("\n")
        .filter((l) => l && !l.startsWith("#") && l.includes("="))
        .map((l) => {
          const idx = l.indexOf("=");
          return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
        }),
    );
  } catch {
    return {};
  }
}

const env = { ...parseEnv(resolve(root, ".env")), ...parseEnv(resolve(root, ".env.local")) };

const SUPABASE_URL = env.VITE_SUPABASE_URL ?? env.SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌  Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_KEY in .env");
  process.exit(1);
}

const TEST_EMAIL = "test@jennian-iq.internal";
const TEST_PASSWORD = "JenniQ-E2E-2026!";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── 1. Find or create the user ────────────────────────────────────────────────
console.log(`\n→ Looking for existing user ${TEST_EMAIL}…`);

let userId;

const { data: listData, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listErr) {
  console.error("❌  listUsers:", listErr.message);
  process.exit(1);
}

const existing = listData.users.find((u) => u.email?.toLowerCase() === TEST_EMAIL.toLowerCase());

if (existing) {
  console.log(`   Found existing user ${existing.id} — resetting password…`);
  const { error: upErr } = await admin.auth.admin.updateUserById(existing.id, {
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (upErr) {
    console.error("❌  updateUserById:", upErr.message);
    process.exit(1);
  }
  userId = existing.id;
  console.log(`✓  Password reset for ${TEST_EMAIL}`);
} else {
  console.log(`   Not found — creating…`);
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name: "E2E Test User",
      role: "estimator",
    },
  });
  if (createErr) {
    console.error("❌  createUser:", createErr.message);
    process.exit(1);
  }
  userId = created.user.id;
  console.log(`✓  Created user ${userId} (${TEST_EMAIL})`);
}

// ── 2. Assign estimator role ──────────────────────────────────────────────────
console.log(`\n→ Assigning estimator role to ${userId}…`);

// Delete any existing roles first (mirror what the app does)
await admin.from("user_roles").delete().eq("user_id", userId);
const { error: roleErr } = await admin
  .from("user_roles")
  .insert({ user_id: userId, role: "estimator" });
if (roleErr) {
  console.error("❌  insert user_roles:", roleErr.message);
  process.exit(1);
}
console.log(`✓  Role set to estimator`);

// ── 3. Update .env.local ──────────────────────────────────────────────────────
console.log(`\n→ Updating .env.local…`);

const localEnvPath = resolve(root, ".env.local");
let localContent = "";
try {
  localContent = readFileSync(localEnvPath, "utf8");
} catch {
  /* ok — file may not exist */
}

function setEnvVar(content, key, value) {
  const re = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${value}`;
  return re.test(content)
    ? content.replace(re, line)
    : content + (content.endsWith("\n") ? "" : "\n") + line + "\n";
}

localContent = setEnvVar(localContent, "PLAYWRIGHT_TEST_EMAIL", TEST_EMAIL);
localContent = setEnvVar(localContent, "PLAYWRIGHT_TEST_PASSWORD", TEST_PASSWORD);

writeFileSync(localEnvPath, localContent, "utf8");
console.log(`✓  .env.local updated`);

console.log(`
╔══════════════════════════════════════════════════════╗
║  E2E test user ready                                 ║
║  Email:    ${TEST_EMAIL.padEnd(42)}║
║  Password: ${TEST_PASSWORD.padEnd(42)}║
╚══════════════════════════════════════════════════════╝
`);

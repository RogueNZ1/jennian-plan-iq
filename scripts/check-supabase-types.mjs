import "dotenv/config";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import prettier from "prettier";

const projectId =
  process.env.SUPABASE_PROJECT_ID || process.env.VITE_SUPABASE_PROJECT_ID || "ukegudqobnmiesudtjen";
const targetPath = resolve("src/integrations/supabase/types.ts");
const scratchPath = resolve(".codex-scratch/supabase-types.generated.ts");

if (!process.env.SUPABASE_ACCESS_TOKEN) {
  throw new Error(
    "SUPABASE_ACCESS_TOKEN is required to generate live Supabase types. Add it to CI secrets or local .env.",
  );
}

const generated = execSync(`npx supabase gen types typescript --project-id ${projectId}`, {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
});

const prettierConfig = (await prettier.resolveConfig(targetPath)) ?? {};
const formattedGenerated = await prettier.format(generated, {
  ...prettierConfig,
  filepath: targetPath,
});
const checkedIn = readFileSync(targetPath, "utf8");
const normalize = (text) => text.replace(/\r\n/g, "\n").trimEnd();

if (normalize(formattedGenerated) !== normalize(checkedIn)) {
  mkdirSync(dirname(scratchPath), { recursive: true });
  writeFileSync(scratchPath, formattedGenerated, "utf8");
  throw new Error(
    `Supabase live types differ from ${targetPath}. Regenerate with: npx supabase gen types typescript --project-id ${projectId} > src/integrations/supabase/types.ts`,
  );
}

console.log(`Supabase types match live project ${projectId}.`);

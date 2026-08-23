/**
 * Remove a capture from the published catalog.
 *
 *   node scripts/remove-capture.mts <id-or-url> [--dry-run]
 *
 * Honouring a removal request is the one operation this site promises its
 * subjects, so it must be a single step.
 *
 * Splat Spots holds nothing but the record: no capture files, no copies of
 * anyone's imagery. Deleting the JSON is therefore the whole removal — the
 * next build simply has one fewer page.
 */

import { rm, stat } from "node:fs/promises";
import path from "node:path";
import { capturePath, normalizeCaptureInput, readCapture } from "./lib/catalog.mts";

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

const input = process.argv[2];
if (!input || input.startsWith("--")) {
  console.error("Usage: node scripts/remove-capture.mts <id-or-url> [--dry-run]");
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");
const id = normalizeCaptureInput(input);

const record = capturePath(id);

if (!(await exists(record))) {
  console.log(`${id} is not in the catalog. Nothing to remove.`);
  process.exit(0);
}

const capture = await readCapture(id);
console.log(`removing  ${capture.title}`);
console.log(`          ${id}`);

const rel = path.relative(process.cwd(), record);
if (dryRun) {
  console.log(`  would   remove ${rel}`);
} else {
  await rm(record, { force: true });
  console.log(`  removed ${rel}`);
}

console.log(
  dryRun
    ? "\nDry run. Nothing was removed."
    : "\nCommit and push to take it off the published site.",
);

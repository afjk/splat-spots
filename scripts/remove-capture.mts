/**
 * Remove a capture from the published catalog.
 *
 *   node scripts/remove-capture.mts <id-or-url> [--dry-run]
 *
 * Honouring a removal request is the one operation this site promises its
 * subjects, so it must not be a checklist someone can half-perform. The
 * record and every derived thumbnail go together: deleting the JSON alone
 * would unlist the capture while leaving images of the place served at a
 * guessable URL.
 */

import { rm, stat } from "node:fs/promises";
import path from "node:path";
import { capturePath, normalizeCaptureInput, readCapture } from "./lib/catalog.mts";

const THUMBS_DIR = path.join(process.cwd(), "public", "thumbs");

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
const thumbs = path.join(THUMBS_DIR, id);

if (!(await exists(record)) && !(await exists(thumbs))) {
  console.log(`${id} is not in the catalog. Nothing to remove.`);
  process.exit(0);
}

if (await exists(record)) {
  const capture = await readCapture(id);
  console.log(`removing  ${capture.title}`);
  console.log(`          ${id}`);
}

const targets = [
  { label: "record", target: record },
  { label: "thumbnails", target: thumbs },
];

for (const { label, target } of targets) {
  const present = await exists(target);
  const rel = path.relative(process.cwd(), target);
  if (!present) {
    console.log(`  skip    ${label}: ${rel} (absent)`);
    continue;
  }
  if (dryRun) {
    console.log(`  would   remove ${label}: ${rel}`);
  } else {
    await rm(target, { recursive: true, force: true });
    console.log(`  removed ${label}: ${rel}`);
  }
}

console.log(
  dryRun
    ? "\nDry run. Nothing was removed."
    : "\nCommit and push to take it off the published site." +
      "\nNote: thumbnails stay in git history; rewriting history is a separate,\n" +
      "deliberate step if the requester needs that too.",
);

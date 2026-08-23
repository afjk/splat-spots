/**
 * Remove a capture from the published catalog.
 *
 *   node scripts/remove-capture.mts <id-or-url> [--dry-run]
 *
 * Honouring a removal request is the one operation this site promises its
 * subjects, so it must be a single step.
 *
 * Splat Spots holds no capture files and no copies of anyone's imagery, so
 * deleting the JSON is the whole removal on the git side — but listings are
 * now published straight into D1, so a listing that was never committed has no
 * file to delete, and one that was can still be re-served from its D1 row. A
 * submitted thumbnail lives there too, and is bytes rather than a link, so it
 * has to be deleted rather than merely hidden. This prints both statements
 * every time rather than leaving them to memory.
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

/** The live half. Deleting the file does not touch it. */
function unlistCommand(captureId: string): string {
  const statements = [
    `UPDATE submissions SET status='removed' WHERE capture_id='${captureId}'`,
    // The picture is bytes we hold, so it goes rather than being hidden.
    `DELETE FROM thumbnails WHERE capture_id='${captureId}'`,
  ];
  return [
    "npx wrangler d1 execute splat-spots --remote -c worker/wrangler.toml \\",
    `  --command "${statements.join("; ")}"`,
  ].join("\n");
}

if (await exists(record)) {
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
      : "\nCommit and push to take it off the built site.",
  );
} else {
  console.log(`${id} has no file in data/captures/.`);
  console.log("If it is listed, it is a live row and only the statement below removes it.");
}

console.log(`\nThen unlist the live row and delete the picture:\n\n${unlistCommand(id)}\n`);

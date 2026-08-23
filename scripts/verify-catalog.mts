/**
 * Re-check every catalog entry against Insta360.
 *
 *   node scripts/verify-catalog.mts [--dry-run]
 *
 * A capture whose owner has unshared it flips to `status: "unavailable"` and
 * drops out of the published gallery on the next build. Nothing is deleted
 * here: removing a record is a reviewed act, not an automatic one.
 *
 * Exits non-zero only on unexpected failures, never because a capture went
 * away — that is a normal, expected outcome.
 */

import { listCaptureIds, readCapture, writeCapture } from "./lib/catalog.mts";
import { lookupCapture } from "./lib/insta360.mts";

const dryRun = process.argv.includes("--dry-run");

const ids = await listCaptureIds();
if (!ids.length) {
  console.log("no captures in data/captures — nothing to verify");
  process.exit(0);
}

const changed: string[] = [];
const unreachable: string[] = [];

for (const id of ids) {
  const capture = await readCapture(id);
  const lookup = await lookupCapture(id);

  if (lookup.state === "unreachable") {
    // A network blip must not quietly unpublish someone's capture.
    unreachable.push(`${id}: ${lookup.reason}`);
    console.log(`skip     ${id}  (${lookup.reason})`);
    continue;
  }

  const status = lookup.metadata.available ? "available" : "unavailable";
  const flipped = status !== capture.status;

  if (flipped) {
    changed.push(`${id}: ${capture.status} → ${status}`);
    console.log(`CHANGED  ${id}  ${capture.status} → ${status}`);
  } else {
    console.log(`ok       ${id}  ${status}`);
  }

  if (!dryRun) {
    await writeCapture({
      ...capture,
      status,
      last_checked_at: lookup.metadata.checked_at,
      // Refresh facts Insta360 owns; leave reviewed prose alone.
      captured_at: lookup.metadata.captured_at ?? capture.captured_at,
      camera: lookup.metadata.camera ?? capture.camera,
    });
  }
}

console.log(`\nchecked ${ids.length} · changed ${changed.length} · unreachable ${unreachable.length}`);
if (changed.length) {
  console.log("\nstatus changes");
  for (const line of changed) console.log(`  - ${line}`);
}
if (unreachable.length) {
  console.log("\nnot reached (left untouched)");
  for (const line of unreachable) console.log(`  - ${line}`);
}

// Surfaced for CI so a workflow can open a PR when something moved.
if (process.env.GITHUB_OUTPUT) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed.length}\n`);
}

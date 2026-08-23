/**
 * Publish a reviewed capture into the catalog.
 *
 *   node scripts/add-capture.mts <share-url-or-id> [options]
 *
 *     --title <text>          shown on the card and the capture page
 *     --description <text>    short prose about the place
 *     --author <name>         who captured it, when known
 *     --tags <a,b,c>          comma separated
 *     --source-post <url>     where the capture was found
 *     --camera <name>         only if actually known
 *     --captured-at <date>    YYYY-MM-DD, only if actually known
 *     --force                 re-publish an id that already has a record
 *
 * This writes what you tell it. Splat Spots does not query Insta360, so
 * confirming the link is genuinely public and genuinely a Spatial Capture is
 * something you do by opening it before running this.
 */

import { access } from "node:fs/promises";
import {
  canonicalCaptureUrl,
  capturePath,
  normalizeCaptureInput,
  serializeCapture,
  todayIso,
  writeCapture,
  type CaptureRecord,
} from "./lib/catalog.mts";

function option(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`--${name} needs a value.`);
  }
  return value.trim();
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const input = process.argv[2];
  if (!input || input.startsWith("--")) {
    throw new Error("Usage: node scripts/add-capture.mts <share-url-or-id> [options]");
  }

  const id = normalizeCaptureInput(input);

  if ((await exists(capturePath(id))) && !process.argv.includes("--force")) {
    throw new Error(`${id} is already in the catalog. Pass --force to overwrite.`);
  }

  const capturedAt = option("captured-at");
  if (capturedAt && !/^\d{4}-\d{2}-\d{2}$/.test(capturedAt)) {
    throw new Error("--captured-at must be YYYY-MM-DD.");
  }

  const tags = (option("tags") ?? "")
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);

  const record: CaptureRecord = {
    id,
    url: canonicalCaptureUrl(id),
    title: option("title") || "Untitled spot",
    description: option("description") ?? "",
    author: option("author"),
    tags: [...new Set(tags)],
    source_post: option("source-post"),
    camera: option("camera"),
    captured_at: capturedAt,
    submitted_at: todayIso(),
    status: "published",
  };

  await writeCapture(record);
  console.log(`published  data/captures/${id}.json\n`);
  console.log(serializeCapture(record).replace(/^/gm, "  "));
}

try {
  await main();
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

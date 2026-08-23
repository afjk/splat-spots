/**
 * Register one public capture into the catalog.
 *
 *   node scripts/add-capture.mts <share-url-or-id> [options]
 *
 *     --title <text>          override the title Insta360 reports
 *     --description <text>    free prose shown on the card and detail page
 *     --tags <a,b,c>          comma separated
 *     --source-post <url>     where this capture was found (post, article)
 *     --author <name>         who captured it
 *     --force                 re-register an id that already has a file
 *
 * Refuses to write anything Insta360 does not report as publicly available.
 */

import { access } from "node:fs/promises";
import {
  canonicalInsta360Url,
  capturePath,
  normalizeCaptureInput,
  serializeCapture,
  writeCapture,
  type CaptureRecord,
} from "./lib/catalog.mts";
import { lookupCapture } from "./lib/insta360.mts";

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

  const lookup = await lookupCapture(id);
  if (lookup.state === "not_found") {
    throw new Error(`そのCaptureが見つかりません: ${id}`);
  }
  if (lookup.state === "unreachable") {
    throw new Error(`Insta360 に確認できませんでした: ${lookup.reason}`);
  }

  const meta = lookup.metadata;
  if (!meta.available) {
    throw new Error(
      meta.private
        ? "このCaptureは非公開に設定されています。登録できません。"
        : "公開されたSOGが見つかりません。登録できません。",
    );
  }

  const tags = (option("tags") ?? "")
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);

  const record: CaptureRecord = {
    id,
    insta360_url: canonicalInsta360Url(id),
    title: option("title") || meta.title || "Untitled capture",
    description: option("description") ?? "",
    captured_at: meta.captured_at,
    camera: meta.camera,
    source_post_url: option("source-post"),
    source_author: option("author"),
    discovered_at: new Date().toISOString(),
    last_checked_at: meta.checked_at,
    status: "available",
    tags: [...new Set(tags)],
  };

  await writeCapture(record);
  console.log(`registered  data/captures/${id}.json\n`);
  console.log(serializeCapture(record).replace(/^/gm, "  "));
}

try {
  await main();
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

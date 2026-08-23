/**
 * The published catalog. `data/captures/<id>.json` is the source of truth:
 * one reviewed capture per file, diffable, and removable by deleting the file.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CAPTURE_ID_PATTERN,
  canonicalInsta360Url,
  normalizeCaptureInput,
} from "../../src/lib/capture-id.ts";

// Re-exported so scripts have one import for catalog concerns.
export { CAPTURE_ID_PATTERN, canonicalInsta360Url, normalizeCaptureInput };

export const CAPTURES_DIR = path.join(process.cwd(), "data", "captures");

export type CaptureStatus = "available" | "unavailable";

export type CaptureRecord = {
  id: string;
  insta360_url: string;
  title: string;
  description: string;
  captured_at: string | null;
  camera: string | null;
  source_post_url: string | null;
  source_author: string | null;
  discovered_at: string;
  last_checked_at: string | null;
  status: CaptureStatus;
  tags: string[];
};

/** Serialization order. Keeping it fixed makes review diffs readable. */
const FIELD_ORDER: (keyof CaptureRecord)[] = [
  "id",
  "insta360_url",
  "title",
  "description",
  "captured_at",
  "camera",
  "source_post_url",
  "source_author",
  "discovered_at",
  "last_checked_at",
  "status",
  "tags",
];

export function capturePath(id: string): string {
  return path.join(CAPTURES_DIR, `${id}.json`);
}

export function serializeCapture(capture: CaptureRecord): string {
  const ordered: Record<string, unknown> = {};
  for (const field of FIELD_ORDER) ordered[field] = capture[field];
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

export async function writeCapture(capture: CaptureRecord): Promise<void> {
  await writeFile(capturePath(capture.id), serializeCapture(capture), "utf8");
}

export async function readCapture(id: string): Promise<CaptureRecord> {
  return JSON.parse(await readFile(capturePath(id), "utf8")) as CaptureRecord;
}

export async function listCaptureIds(): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(CAPTURES_DIR);
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => entry.slice(0, -".json".length))
    .filter((id) => CAPTURE_ID_PATTERN.test(id))
    .sort();
}

/**
 * Ids the site actually publishes. Derived thumbnails must follow exactly this
 * set: a capture whose owner unshared it is unlisted, so keeping its images
 * served would leak the very thing the removal was for.
 */
export function publishedIds(records: CaptureRecord[]): string[] {
  return records.filter((record) => record.status === "available").map((record) => record.id);
}

/** Newest first, matching how the gallery renders. */
export async function readCatalog(): Promise<CaptureRecord[]> {
  const records = await Promise.all((await listCaptureIds()).map(readCapture));
  return records.sort(
    (a, b) => Date.parse(b.discovered_at) - Date.parse(a.discovered_at),
  );
}

/**
 * The published catalog. `data/captures/<id>.json` is the source of truth:
 * one reviewed capture per file, diffable, and removable by deleting the file.
 *
 * Every field here is either derived from the submitted URL or entered by a
 * person. Nothing is fetched from Insta360 — Splat Spots does not read their
 * APIs or scrape their pages, so any metadata beyond the link is optional and
 * arrives because a human supplied it.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CAPTURE_ID_PATTERN,
  canonicalCaptureUrl,
  normalizeCaptureInput,
} from "../../src/lib/capture-id.ts";

// Re-exported so scripts have one import for catalog concerns.
export { CAPTURE_ID_PATTERN, canonicalCaptureUrl, normalizeCaptureInput };

export const CAPTURES_DIR = path.join(process.cwd(), "data", "captures");

/**
 * `unlisted` keeps a record out of the gallery without deleting it — used when
 * a listing is reported dead and is waiting on a person to look.
 */
export type CaptureStatus = "published" | "unlisted";

export type CaptureRecord = {
  id: string;
  url: string;
  title: string;
  description: string;
  author: string | null;
  tags: string[];
  source_post: string | null;
  /** Optional, and only ever set from what a person actually knows. */
  camera: string | null;
  captured_at: string | null;
  /** ISO date. A date rather than a timestamp keeps review diffs quiet. */
  submitted_at: string;
  status: CaptureStatus;
};

/** Serialization order. Keeping it fixed makes review diffs readable. */
const FIELD_ORDER: (keyof CaptureRecord)[] = [
  "id",
  "url",
  "title",
  "description",
  "author",
  "tags",
  "source_post",
  "camera",
  "captured_at",
  "submitted_at",
  "status",
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

/** Newest first, matching how the gallery renders. */
export async function readCatalog(): Promise<CaptureRecord[]> {
  const records = await Promise.all((await listCaptureIds()).map(readCapture));
  return records.sort(
    (a, b) => Date.parse(b.submitted_at) - Date.parse(a.submitted_at),
  );
}

export function todayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

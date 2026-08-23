/**
 * The published catalog. `data/captures/<id>.json` is the source of truth:
 * one reviewed capture per file, diffable, and removable by deleting the file.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const CAPTURES_DIR = path.join(process.cwd(), "data", "captures");

export const CAPTURE_ID_PATTERN = /^GS3DG[A-Za-z0-9]{16,80}$/;

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

export function canonicalInsta360Url(id: string): string {
  return `https://app.insta360.com/3dspace/detail/${id}`;
}

/**
 * Accepts a bare GS3DG id or an `app.insta360.com/3dspace/detail/...` share URL
 * and returns the canonical id. Anything else is rejected loudly: a typo must
 * not become a catalog entry pointing nowhere.
 */
export function normalizeCaptureInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Insta360の公開URLまたはIDを指定してください。");
  if (CAPTURE_ID_PATTERN.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`URLとして読めません: ${trimmed}`);
  }

  if (url.hostname.toLowerCase() !== "app.insta360.com") {
    throw new Error("app.insta360.com の公開URLだけを登録できます。");
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 3 || segments[0] !== "3dspace" || segments[1] !== "detail") {
    throw new Error("Spatial Captureの詳細URL (/3dspace/detail/...) を指定してください。");
  }

  const id = decodeURIComponent(segments[2]);
  if (!CAPTURE_ID_PATTERN.test(id)) {
    throw new Error(`有効なGS3DG IDを見つけられませんでした: ${id}`);
  }
  return id;
}

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
    (a, b) => Date.parse(b.discovered_at) - Date.parse(a.discovered_at),
  );
}

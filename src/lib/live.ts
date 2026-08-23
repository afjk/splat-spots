/**
 * The live half of the catalog.
 *
 * Submissions are published on arrival, so the gallery cannot be a pure
 * function of the build any more: it renders what git has, then asks the API
 * for everything posted since. Git wins on id — once a listing is committed to
 * `data/captures/`, the hand-written record is the one shown.
 *
 * Everything here arrived from a form with nobody in between, so it is treated
 * as untrusted input: shape checked, clamped, and only ever written to the
 * page as text. Pure on purpose — the fetching lives in `api.ts` so these can
 * be tested without a build.
 */

import { CAPTURE_ID_PATTERN } from "./capture-id.ts";
import type { CaptureRecord } from "./capture.ts";

export const UNTITLED = "無題の空間";

const text = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

function link(value: unknown): string | null {
  const candidate = text(value, 500);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** One API row, or null if it is not a listing this site can render. */
export function normalizeLiveCapture(value: unknown): CaptureRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;

  const id = text(row.id, 90);
  if (!CAPTURE_ID_PATTERN.test(id)) return null;

  const tags = Array.isArray(row.tags)
    ? [...new Set(row.tags.map((tag) => text(tag, 32).toLowerCase()).filter(Boolean))].slice(0, 6)
    : [];

  return {
    id,
    url: `https://app.insta360.com/3dspace/detail/${id}`,
    title: text(row.title, 120) || UNTITLED,
    description: text(row.description, 600),
    author: text(row.author, 80) || null,
    tags,
    source_post: link(row.source_post),
    // The form never asks for these, and nothing else may invent them.
    camera: null,
    captured_at: null,
    submitted_at: text(row.submitted_at, 40),
    status: "published",
  };
}

/**
 * Which captures have a thumbnail, and the version to hang on the image URL.
 * Covers both halves: a capture committed to git can have a picture too.
 */
export function thumbnailVersions(payload: unknown): Map<string, number> {
  const rows =
    typeof payload === "object" && payload !== null &&
    Array.isArray((payload as { thumbnails?: unknown }).thumbnails)
      ? (payload as { thumbnails: unknown[] }).thumbnails
      : [];

  const versions = new Map<string, number>();
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const { id, v } = row as { id?: unknown; v?: unknown };
    if (typeof id !== "string" || !CAPTURE_ID_PATTERN.test(id)) continue;
    versions.set(id, typeof v === "number" && Number.isFinite(v) ? v : 0);
  }
  return versions;
}

/** Live rows that git does not already cover, newest first. */
export function liveAdditions(payload: unknown, known: Iterable<string>): CaptureRecord[] {
  const rows =
    typeof payload === "object" && payload !== null && Array.isArray((payload as { captures?: unknown }).captures)
      ? ((payload as { captures: unknown[] }).captures)
      : [];

  const seen = new Set(known);
  const additions: CaptureRecord[] = [];
  for (const row of rows) {
    const capture = normalizeLiveCapture(row);
    if (!capture || seen.has(capture.id)) continue;
    seen.add(capture.id);
    additions.push(capture);
  }
  return additions.sort((a, b) => Date.parse(b.submitted_at) - Date.parse(a.submitted_at));
}

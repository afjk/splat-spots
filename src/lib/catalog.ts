/**
 * Build-time view of `data/captures/`. These are the records a maintainer
 * committed by hand; the rest of the gallery arrives from the API at runtime.
 * A capture in here disappears by deleting one file.
 */

import type { CaptureRecord } from "./capture";

export { displayDate } from "./capture";
export type { CaptureRecord, CaptureStatus } from "./capture";

const modules = import.meta.glob<CaptureRecord>("../../data/captures/*.json", {
  eager: true,
  import: "default",
});

const all: CaptureRecord[] = Object.values(modules);

/**
 * Every id git knows about, `unlisted` included. The live half is filtered
 * against this: a record pulled from the gallery must not come back through
 * the API just because its file says `unlisted` rather than being deleted.
 */
export const catalogIds: string[] = all.map((capture) => capture.id);

export const captures: CaptureRecord[] = Object.values(modules)
  .filter((capture) => capture.status === "published")
  .sort((a, b) => Date.parse(b.submitted_at) - Date.parse(a.submitted_at));

export function captureById(id: string): CaptureRecord | undefined {
  return captures.find((capture) => capture.id === id);
}

/** Tag counts, most used first — the chips the page ships with. */
export function tagCounts(): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const capture of captures) {
    for (const tag of capture.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

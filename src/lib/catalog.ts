/**
 * Build-time view of `data/captures/`. The published site is a pure function
 * of these files, so a capture disappears from the gallery by deleting one file.
 */

const modules = import.meta.glob<CaptureRecord>("../../data/captures/*.json", {
  eager: true,
  import: "default",
});

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

/** Insta360 reports both "X4 Air" and "Insta360 X6"; show one shape. */
export function displayCamera(camera: string | null): string | null {
  return camera ? camera.replace(/^Insta360\s+/i, "").trim() || null : null;
}

export function displayDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? null
    : new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric" })
        .format(parsed);
}

export const captures: CaptureRecord[] = Object.values(modules)
  .filter((capture) => capture.status === "available")
  .sort((a, b) => Date.parse(b.discovered_at) - Date.parse(a.discovered_at));

export function captureById(id: string): CaptureRecord | undefined {
  return captures.find((capture) => capture.id === id);
}

/** Tag counts, most used first — drives the filter row. */
export function tagCounts(): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const capture of captures) {
    for (const tag of capture.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

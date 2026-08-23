/**
 * Build-time view of `data/captures/`. The published site is a pure function
 * of these files, so a capture disappears from the gallery by deleting one
 * file. Nothing here is fetched from anywhere: every field was typed by a
 * person during review.
 */

const modules = import.meta.glob<CaptureRecord>("../../data/captures/*.json", {
  eager: true,
  import: "default",
});

export type CaptureStatus = "published" | "unlisted";

export type CaptureRecord = {
  id: string;
  url: string;
  title: string;
  description: string;
  author: string | null;
  tags: string[];
  source_post: string | null;
  camera: string | null;
  captured_at: string | null;
  submitted_at: string;
  status: CaptureStatus;
};

export function displayDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? null
    : new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric" })
        .format(parsed);
}

export const captures: CaptureRecord[] = Object.values(modules)
  .filter((capture) => capture.status === "published")
  .sort((a, b) => Date.parse(b.submitted_at) - Date.parse(a.submitted_at));

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

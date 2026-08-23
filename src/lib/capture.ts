/**
 * What a listing is, wherever it came from.
 *
 * Two halves feed the gallery: `data/captures/*.json` in git, and the live
 * table behind the API. They share this shape so a card does not care which
 * half it was built from. Kept free of the catalog glob so browser code can
 * import the type without pulling every record into the bundle.
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

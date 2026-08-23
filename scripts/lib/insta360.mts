/**
 * Insta360 Spatial Capture metadata client.
 *
 * The public detail endpoint returns signed asset URLs that expire after seven
 * days. Callers may use `preview_video_url` transiently (thumbnail generation)
 * but must never write it to `data/`. Only the derived facts below are durable.
 */

const API_HEADERS = {
  accept: "application/json",
  "user-agent":
    "Mozilla/5.0 (compatible; SplatSpots/1.0; +https://afjk.github.io/splat-spots)",
};

export type CaptureMetadata = {
  available: boolean;
  private: boolean;
  title: string | null;
  /** ISO date (YYYY-MM-DD) derived from the API's `titleDate`. */
  captured_at: string | null;
  /** e.g. "X4 Air", "X6". */
  camera: string | null;
  /** Signed and short-lived. Never persist. */
  preview_video_url: string | null;
  checked_at: string;
};

export type LookupResult =
  | { state: "ok"; metadata: CaptureMetadata }
  /** Insta360 answered and does not know this capture. Retrying will not help. */
  | { state: "not_found" }
  | { state: "unreachable"; reason: string };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** `2026/08/14` -> `2026-08-14`. Returns null for anything unexpected. */
function isoDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const match = /^(\d{4})[/-](\d{2})[/-](\d{2})$/.exec(raw);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

export function inspectTaskDetail(
  body: unknown,
  expectedId: string,
  now: Date,
): CaptureMetadata | null {
  const root = record(body);
  const data = record(root?.data);
  if (!root || root.code !== 0 || !data || data.taskOrderNo !== expectedId) return null;

  const outputs = Array.isArray(data.outputs) ? data.outputs : [];
  const find = (predicate: (item: Record<string, unknown>) => boolean): string | null => {
    for (const output of outputs) {
      const item = record(output);
      if (item && predicate(item) && typeof item.url === "string") return item.url;
    }
    return null;
  };

  const sogUrl = find((item) => item.fileFormat === "sog");
  const isPrivate = data.isPrivate === 1;

  return {
    available: !isPrivate && Boolean(sogUrl),
    private: isPrivate,
    title: text(data.title),
    captured_at: isoDate(data.titleDate),
    camera: text(data.cameraType),
    preview_video_url: find((item) => item.type === "video" && item.fileFormat === "mp4"),
    checked_at: now.toISOString(),
  };
}

/** The fifth ID character selects the serving region; try the other as fallback. */
function taskDetailEndpoints(id: string): string[] {
  const preferred = id[4]?.toUpperCase() === "C" ? "c" : "g";
  const fallback = preferred === "c" ? "g" : "c";
  return [preferred, fallback].map(
    (region) =>
      `https://service-${region}.insta360.com/app-service/app/service/gs3d/task/detail` +
      `?taskOrderNo=${encodeURIComponent(id)}`,
  );
}

/**
 * A missing capture comes back as HTTP 200 with a non-zero `code`
 * (40004 / FindNotFound), so "not found" has to be read out of the body.
 * Telling it apart from a network problem matters: one is the submitter's
 * typo, the other must never unpublish anything.
 */
export function isNotFoundBody(body: unknown): boolean {
  const root = record(body);
  return Boolean(root) && typeof root!.code === "number" && root!.code !== 0;
}

export async function lookupCapture(id: string, now = new Date()): Promise<LookupResult> {
  let lastReason = "Insta360 did not return a usable response.";
  let sawNotFound = false;

  for (const endpoint of taskDetailEndpoints(id)) {
    try {
      const response = await fetch(endpoint, {
        headers: API_HEADERS,
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        lastReason = `HTTP ${response.status} from ${new URL(endpoint).host}`;
        continue;
      }
      const body = await response.json().catch(() => null);
      const metadata = inspectTaskDetail(body, id, now);
      if (metadata) return { state: "ok", metadata };
      if (isNotFoundBody(body)) sawNotFound = true;
      else lastReason = "Response did not describe this capture.";
    } catch (error) {
      lastReason = error instanceof Error ? error.message : String(error);
    }
  }

  // Only definitive once every region agrees it does not exist.
  return sawNotFound ? { state: "not_found" } : { state: "unreachable", reason: lastReason };
}

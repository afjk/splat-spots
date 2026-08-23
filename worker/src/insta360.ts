/**
 * Server-side availability check. This is the reason the API exists at all:
 * Insta360's detail endpoint sends no CORS headers, so a static page cannot
 * ask it anything. Signed asset URLs in the response are never read here.
 */

const API_HEADERS = {
  accept: "application/json",
  "user-agent":
    "Mozilla/5.0 (compatible; SplatSpots/1.0; +https://afjk.github.io/splat-spots)",
};

export type CaptureFacts = {
  available: boolean;
  private: boolean;
  title: string | null;
  captured_at: string | null;
  camera: string | null;
};

export type VerifyResult =
  | { state: "ok"; facts: CaptureFacts }
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

function isoDate(value: unknown): string | null {
  const raw = text(value);
  const match = raw && /^(\d{4})[/-](\d{2})[/-](\d{2})$/.exec(raw);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

/**
 * A missing capture comes back as HTTP 200 with a non-zero `code`
 * (40004 / FindNotFound), so "not found" has to be read out of the body.
 */
export function readOutcome(
  body: unknown,
  expectedId: string,
): { kind: "facts"; facts: CaptureFacts } | { kind: "not_found" } | { kind: "unusable" } {
  const root = record(body);
  if (!root || typeof root.code !== "number") return { kind: "unusable" };
  if (root.code !== 0) return { kind: "not_found" };

  const facts = inspectTaskDetail(body, expectedId);
  return facts ? { kind: "facts", facts } : { kind: "unusable" };
}

export function inspectTaskDetail(body: unknown, expectedId: string): CaptureFacts | null {
  const root = record(body);
  const data = record(root?.data);
  if (!root || root.code !== 0 || !data || data.taskOrderNo !== expectedId) return null;

  const outputs = Array.isArray(data.outputs) ? data.outputs : [];
  const hasSog = outputs.some((output) => {
    const item = record(output);
    return item?.fileFormat === "sog" && typeof item.url === "string";
  });
  const isPrivate = data.isPrivate === 1;

  return {
    available: !isPrivate && hasSog,
    private: isPrivate,
    title: text(data.title),
    captured_at: isoDate(data.titleDate),
    camera: text(data.cameraType),
  };
}

/** The fifth ID character selects the serving region; try the other as fallback. */
function endpoints(id: string): string[] {
  const preferred = id[4]?.toUpperCase() === "C" ? "c" : "g";
  return [preferred, preferred === "c" ? "g" : "c"].map(
    (region) =>
      `https://service-${region}.insta360.com/app-service/app/service/gs3d/task/detail` +
      `?taskOrderNo=${encodeURIComponent(id)}`,
  );
}

export async function verifyCapture(id: string): Promise<VerifyResult> {
  let reason = "Insta360 did not return a usable response.";
  let sawNotFound = false;

  for (const endpoint of endpoints(id)) {
    try {
      const response = await fetch(endpoint, {
        headers: API_HEADERS,
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        reason = `HTTP ${response.status}`;
        continue;
      }
      const outcome = readOutcome(await response.json().catch(() => null), id);
      if (outcome.kind === "facts") return { state: "ok", facts: outcome.facts };
      if (outcome.kind === "not_found") sawNotFound = true;
      else reason = "Response did not describe this capture.";
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
    }
  }

  // Only definitive once every region agrees it does not exist.
  return sawNotFound ? { state: "not_found" } : { state: "unreachable", reason };
}

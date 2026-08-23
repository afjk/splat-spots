import type { NormalizedCapture } from "@/lib/captures/normalize";

const API_HEADERS = {
  accept: "application/json",
  "user-agent":
    "Mozilla/5.0 (compatible; SplatAtlas/1.0; +https://splat-atlas.afjk01.chatgpt.site)",
};

type VerificationResult =
  | { state: "available"; checked_at: string; title: string | null }
  | { state: "unavailable"; checked_at: string; reason: string }
  | { state: "unknown"; reason: string };

type InspectedTask = {
  available: boolean;
  title: string | null;
  private: boolean;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Read only the availability metadata. Signed asset URLs are intentionally discarded. */
export function inspectTaskDetail(body: unknown, expectedId: string): InspectedTask | null {
  const root = record(body);
  const data = record(root?.data);
  if (!root || root.code !== 0 || !data || data.taskOrderNo !== expectedId) return null;

  const outputs = Array.isArray(data.outputs) ? data.outputs : [];
  const hasSog = outputs.some((output) => {
    const item = record(output);
    return item?.fileFormat === "sog" && typeof item.url === "string";
  });
  const title = typeof data.title === "string" && data.title.trim() ? data.title.trim() : null;

  return {
    available: data.isPrivate !== 1 && hasSog,
    private: data.isPrivate === 1,
    title,
  };
}

function taskDetailEndpoints(id: string): string[] {
  const preferred = id[4]?.toUpperCase() === "C" ? "c" : "g";
  const fallback = preferred === "c" ? "g" : "c";
  return [preferred, fallback].map(
    (region) =>
      `https://service-${region}.insta360.com/app-service/app/service/gs3d/task/detail?taskOrderNo=${encodeURIComponent(id)}`,
  );
}

export async function verifyPublicCapture(
  capture: NormalizedCapture,
  now = new Date(),
): Promise<VerificationResult> {
  let reachedService = false;

  for (const endpoint of taskDetailEndpoints(capture.id)) {
    try {
      const response = await fetch(endpoint, {
        headers: API_HEADERS,
        signal: AbortSignal.timeout(5_000),
      });
      reachedService = true;
      if (!response.ok) continue;
      const inspected = inspectTaskDetail(await response.json().catch(() => null), capture.id);
      if (!inspected) continue;
      if (inspected.available) {
        return { state: "available", checked_at: now.toISOString(), title: inspected.title };
      }
      return {
        state: "unavailable",
        checked_at: now.toISOString(),
        reason: inspected.private
          ? "このCaptureは非公開に設定されています。"
          : "公開ページに閲覧可能なSOGがありません。",
      };
    } catch {
      // Try the alternate regional endpoint before leaving the item pending.
    }
  }

  return reachedService
    ? { state: "unavailable", checked_at: now.toISOString(), reason: "公開Captureを確認できませんでした。" }
    : { state: "unknown", reason: "Insta360への確認が一時的に利用できません。" };
}

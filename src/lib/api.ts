/**
 * The Cloudflare Worker: submissions, reports, and the live half of the
 * catalog. Set PUBLIC_API_BASE_URL at build time (a .env file locally, a
 * repository variable in CI). When it is missing the forms say so plainly
 * rather than posting into the void, and the gallery shows only what git has.
 */

import { CAPTURE_ID_PATTERN } from "./capture-id";
import { liveAdditions } from "./live";
import type { CaptureRecord } from "./capture";

const configured = (import.meta.env.PUBLIC_API_BASE_URL as string | undefined)?.trim() ?? "";

export const API_BASE_URL = configured.replace(/\/$/, "");
export const API_CONFIGURED = API_BASE_URL.length > 0;

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Listings posted since the last build. Failure is quiet on purpose: the
 * gallery already has the committed half on screen.
 */
export async function fetchLiveCaptures(known: Iterable<string> = []): Promise<CaptureRecord[]> {
  if (!API_CONFIGURED) return [];
  try {
    const response = await fetch(apiUrl("/api/captures"), {
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`api ${response.status}`);
    return liveAdditions(await response.json(), known);
  } catch {
    return [];
  }
}

export async function fetchLiveCapture(id: string): Promise<CaptureRecord | null> {
  if (!CAPTURE_ID_PATTERN.test(id)) return null;
  const captures = await fetchLiveCaptures();
  return captures.find((capture) => capture.id === id) ?? null;
}

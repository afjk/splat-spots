/**
 * The Cloudflare Worker: submissions, reports, and the live half of the
 * catalog. Set PUBLIC_API_BASE_URL at build time (a .env file locally, a
 * repository variable in CI). When it is missing the forms say so plainly
 * rather than posting into the void, and the gallery shows only what git has.
 */

import { CAPTURE_ID_PATTERN } from "./capture-id";
import { liveAdditions, thumbnailVersions } from "./live";
import type { CaptureRecord } from "./capture";

const configured = (import.meta.env.PUBLIC_API_BASE_URL as string | undefined)?.trim() ?? "";

export const API_BASE_URL = configured.replace(/\/$/, "");
export const API_CONFIGURED = API_BASE_URL.length > 0;

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export type LiveCatalog = {
  /** Listings posted since the last build. */
  additions: CaptureRecord[];
  /** capture id → thumbnail version, for both halves of the catalog. */
  thumbnails: Map<string, number>;
};

/**
 * What the gallery adds to what it was built with. Failure is quiet on
 * purpose: the committed half is already on screen.
 */
export async function fetchLiveCatalog(known: Iterable<string> = []): Promise<LiveCatalog> {
  if (!API_CONFIGURED) return { additions: [], thumbnails: new Map() };
  try {
    const response = await fetch(apiUrl("/api/captures"), {
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`api ${response.status}`);
    const payload: unknown = await response.json();
    return { additions: liveAdditions(payload, known), thumbnails: thumbnailVersions(payload) };
  } catch {
    return { additions: [], thumbnails: new Map() };
  }
}

export async function fetchLiveCapture(id: string): Promise<CaptureRecord | null> {
  if (!CAPTURE_ID_PATTERN.test(id)) return null;
  const { additions } = await fetchLiveCatalog();
  return additions.find((capture) => capture.id === id) ?? null;
}

/** The version makes this URL change whenever the picture does. */
export function thumbnailUrl(id: string, version: number): string {
  return apiUrl(`/api/thumbnails/${id}?v=${version}`);
}

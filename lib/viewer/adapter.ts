import { isCaptureId } from "@/lib/captures/normalize";

export const DEFAULT_VIEWER_BASE_URL =
  "https://afjk.github.io/insta360-sog-xr-viewer/";

/**
 * The existing viewer reads `?id=GS3DG…`. Calling this without an ID returns
 * the untouched base URL, preserving its bundled capture.sog sample behavior.
 */
export function viewerUrl(id?: string): string {
  const base =
    process.env.NEXT_PUBLIC_VIEWER_BASE_URL?.trim() || DEFAULT_VIEWER_BASE_URL;
  const url = new URL(base);
  if (id && isCaptureId(id)) url.searchParams.set("id", id.trim());
  return url.toString();
}

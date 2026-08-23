/**
 * The WebXR viewer lives in its own repository and deployment. Keeping the URL
 * construction here means a future move touches exactly one file.
 */
export const VIEWER_BASE_URL = "https://afjk.github.io/insta360-sog-xr-viewer/";

export function viewerUrl(id: string): string {
  const url = new URL(VIEWER_BASE_URL);
  url.searchParams.set("id", id);
  return url.toString();
}

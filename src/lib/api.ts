/**
 * Base URL of the Cloudflare Worker that accepts submissions and reports.
 *
 * Set PUBLIC_API_BASE_URL at build time (a .env file locally, a repository
 * variable in CI). When it is missing the forms say so plainly rather than
 * posting into the void.
 */
const configured = (import.meta.env.PUBLIC_API_BASE_URL as string | undefined)?.trim() ?? "";

export const API_BASE_URL = configured.replace(/\/$/, "");
export const API_CONFIGURED = API_BASE_URL.length > 0;

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

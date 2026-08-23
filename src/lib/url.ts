const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/** Prefix an app-absolute path with the deployment base. */
export function href(path: string): string {
  return `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Absolute URL, for canonical links and OGP tags. */
export function absolute(path: string): string {
  return new URL(href(path), import.meta.env.SITE ?? "https://afjk.github.io").toString();
}

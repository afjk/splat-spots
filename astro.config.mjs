// @ts-check
import { defineConfig } from "astro/config";

// GitHub Pages serves this project from a subpath. Every internal link goes
// through `href()` in src/lib/url.ts so the base is applied in exactly one place.
export default defineConfig({
  site: "https://afjk.github.io",
  base: "/splat-spots",
  trailingSlash: "ignore",
  build: { format: "directory" },
  devToolbar: { enabled: false },
});

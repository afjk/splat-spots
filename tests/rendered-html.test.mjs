import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("home contains the finished directory product", async () => {
  const [page, gallery, layout, css, packageJson] = await Promise.all([
    source("app/page.tsx"),
    source("components/gallery.tsx"),
    source("app/layout.tsx"),
    source("app/globals.css"),
    source("package.json"),
  ]);

  assert.match(page, /Places worth/);
  assert.match(gallery, /Explore captures/);
  assert.match(page, /No asset mirroring/);
  assert.match(layout, /Splat Atlas/);
  assert.match(css, /capture-grid/);
  assert.doesNotMatch(`${page}\n${layout}\n${packageJson}`, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("submit and viewer routes expose the MVP actions", async () => {
  const [submit, form, viewer] = await Promise.all([
    source("app/submit/page.tsx"),
    source("app/submit/submit-form.tsx"),
    source("app/s/[id]/page.tsx"),
  ]);

  assert.match(submit, /Add a place to/);
  assert.match(form, /NORMALIZED CAPTURE ID/);
  assert.match(form, /\/api\/captures/);
  assert.match(viewer, /Open XR Viewer/);
  assert.match(viewer, /View on Insta360/);
  assert.match(viewer, /Report \/ Remove/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { UNTITLED, liveAdditions, normalizeLiveCapture } from "../src/lib/live.ts";

const ID = "GS3DG1e1717642f804279b86617dc5e196de8";
const OTHER = "GS3DGf417973146c54511abec47317d1a9226";

const row = (extra: Record<string, unknown> = {}) => ({
  id: ID,
  title: "Example",
  description: "",
  author: null,
  tags: [],
  source_post: null,
  submitted_at: "2026-08-24T10:00:00.000Z",
  ...extra,
});

test("keeps a well formed live row", () => {
  const capture = normalizeLiveCapture(row({ title: "夜の日本橋", tags: ["Tokyo", "night"] }));
  assert.equal(capture?.id, ID);
  assert.equal(capture?.title, "夜の日本橋");
  assert.equal(capture?.url, `https://app.insta360.com/3dspace/detail/${ID}`);
  assert.deepEqual(capture?.tags, ["tokyo", "night"]);
});

test("drops rows that are not a Spatial Capture listing", () => {
  for (const value of [null, "GS3DG…", 42, {}, row({ id: "NOTANID" }), row({ id: "" })]) {
    assert.equal(normalizeLiveCapture(value), null);
  }
});

test("never lets an unreviewed row invent camera or capture date", () => {
  // Nothing asks a submitter for these, so a row claiming them is ignored.
  const capture = normalizeLiveCapture(row({ camera: "X5", captured_at: "2026-01-01" }));
  assert.equal(capture?.camera, null);
  assert.equal(capture?.captured_at, null);
});

test("only accepts http(s) for the source link", () => {
  assert.equal(normalizeLiveCapture(row({ source_post: "javascript:alert(1)" }))?.source_post, null);
  assert.equal(normalizeLiveCapture(row({ source_post: "not a url" }))?.source_post, null);
  assert.equal(
    normalizeLiveCapture(row({ source_post: "https://example.com/post" }))?.source_post,
    "https://example.com/post",
  );
});

test("falls back to a title rather than showing an empty card", () => {
  assert.equal(normalizeLiveCapture(row({ title: "   " }))?.title, UNTITLED);
});

test("clamps what a submitter typed", () => {
  const capture = normalizeLiveCapture(
    row({
      title: "x".repeat(500),
      description: "y".repeat(2000),
      author: "z".repeat(300),
      tags: Array.from({ length: 20 }, (_, index) => `tag${index}`),
    }),
  );
  assert.equal(capture?.title.length, 120);
  assert.equal(capture?.description.length, 600);
  assert.equal(capture?.author?.length, 80);
  assert.equal(capture?.tags.length, 6);
});

test("git wins: a live row for a committed capture is skipped", () => {
  const additions = liveAdditions({ captures: [row(), row({ id: OTHER })] }, [ID]);
  assert.deepEqual(additions.map((capture) => capture.id), [OTHER]);
});

test("collapses duplicate live rows and sorts newest first", () => {
  const additions = liveAdditions(
    {
      captures: [
        row({ submitted_at: "2026-08-01T00:00:00.000Z" }),
        row({ id: OTHER, submitted_at: "2026-08-20T00:00:00.000Z" }),
        row({ submitted_at: "2026-08-24T00:00:00.000Z" }),
      ],
    },
    [],
  );
  assert.deepEqual(additions.map((capture) => capture.id), [OTHER, ID]);
});

test("survives a payload that is not what the API promised", () => {
  for (const payload of [null, {}, { captures: "nope" }, [1, 2, 3]]) {
    assert.deepEqual(liveAdditions(payload, []), []);
  }
});

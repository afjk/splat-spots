import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalCaptureUrl,
  normalizeCaptureInput,
  serializeCapture,
  todayIso,
  type CaptureRecord,
} from "../scripts/lib/catalog.mts";
import { hueFor, pointsFor } from "../src/lib/artwork.ts";

const ID = "GS3DG1e1717642f804279b86617dc5e196de8";

test("accepts a bare id and a share URL", () => {
  assert.equal(normalizeCaptureInput(ID), ID);
  assert.equal(normalizeCaptureInput(`  ${ID}  `), ID);
  assert.equal(
    normalizeCaptureInput(`https://app.insta360.com/3dspace/detail/${ID}`),
    ID,
  );
  assert.equal(
    normalizeCaptureInput(`https://app.insta360.com/3dspace/detail/${ID}?from=x`),
    ID,
  );
});

test("rejects anything that is not a Spatial Capture share link", () => {
  const rejected = [
    "",
    "   ",
    "not a url",
    `https://example.com/3dspace/detail/${ID}`,
    "https://app.insta360.com/3dspace/detail/NOTANID",
    "https://app.insta360.com/some/other/path",
    `https://app.insta360.com/3dspace/detail/${ID}/extra`,
    `ftp://app.insta360.com/3dspace/detail/${ID}`,
  ];
  for (const input of rejected) {
    assert.throws(() => normalizeCaptureInput(input), Error, `should reject ${input}`);
  }
});

test("builds the canonical share URL from an id", () => {
  assert.equal(
    canonicalCaptureUrl(ID),
    `https://app.insta360.com/3dspace/detail/${ID}`,
  );
});

test("serializes catalog records in a stable field order", () => {
  const record: CaptureRecord = {
    status: "published",
    submitted_at: "2026-08-23",
    captured_at: null,
    camera: null,
    source_post: null,
    tags: ["community"],
    author: null,
    description: "",
    title: "Example",
    url: canonicalCaptureUrl(ID),
    id: ID,
  };

  const keys = Object.keys(JSON.parse(serializeCapture(record)));
  assert.deepEqual(keys, [
    "id",
    "url",
    "title",
    "description",
    "author",
    "tags",
    "source_post",
    "camera",
    "captured_at",
    "submitted_at",
    "status",
  ]);
  assert.ok(serializeCapture(record).endsWith("}\n"));
});

test("stamps submissions with a date, not a timestamp", () => {
  assert.equal(todayIso(new Date("2026-08-23T22:15:00.000Z")), "2026-08-23");
});

test("draws the same artwork for a capture every time", () => {
  // Cards are rebuilt on every deploy; artwork that shifted between builds
  // would make the gallery look unstable for no reason.
  assert.deepEqual(pointsFor(ID), pointsFor(ID));
  assert.equal(hueFor(ID), hueFor(ID));
});

test("draws different artwork for different captures", () => {
  const other = "GS3DGf417973146c54511abec47317d1a9226";
  assert.notDeepEqual(pointsFor(ID), pointsFor(other));
});

test("keeps artwork points inside the frame", () => {
  for (const point of pointsFor(ID, 400)) {
    assert.ok(point.x >= 0 && point.x <= 1, `x out of range: ${point.x}`);
    assert.ok(point.y >= 0 && point.y <= 1, `y out of range: ${point.y}`);
    assert.ok(point.r > 0 && point.o > 0);
  }
});

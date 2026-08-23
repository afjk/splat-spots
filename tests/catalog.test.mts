import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeCaptureInput,
  serializeCapture,
  type CaptureRecord,
} from "../scripts/lib/catalog.mts";
import { inspectTaskDetail, isNotFoundBody } from "../scripts/lib/insta360.mts";

const ID = "GS3DG1e1717642f804279b86617dc5e196de8";
const NOW = new Date("2026-08-23T05:00:00.000Z");

function detail(overrides: Record<string, unknown> = {}) {
  return {
    code: 0,
    data: {
      taskOrderNo: ID,
      title: "8月14日の空間キャプチャ",
      titleDate: "2026/08/14",
      cameraType: "X4 Air",
      isPrivate: 0,
      outputs: [
        { fileFormat: "sog", type: "model", url: "https://example.test/1.sog?sig=x" },
        { fileFormat: "mp4", type: "video", url: "https://example.test/4.mp4?sig=x" },
      ],
      ...overrides,
    },
  };
}

test("reads the durable metadata from a public capture", () => {
  const metadata = inspectTaskDetail(detail(), ID, NOW);
  assert.ok(metadata);
  assert.equal(metadata.available, true);
  assert.equal(metadata.private, false);
  assert.equal(metadata.title, "8月14日の空間キャプチャ");
  assert.equal(metadata.camera, "X4 Air");
  assert.equal(metadata.checked_at, NOW.toISOString());
});

test("converts titleDate to an ISO date", () => {
  assert.equal(inspectTaskDetail(detail(), ID, NOW)?.captured_at, "2026-08-14");
  assert.equal(
    inspectTaskDetail(detail({ titleDate: "yesterday" }), ID, NOW)?.captured_at,
    null,
  );
  assert.equal(inspectTaskDetail(detail({ titleDate: 42 }), ID, NOW)?.captured_at, null);
});

test("treats a private capture as unavailable", () => {
  const metadata = inspectTaskDetail(detail({ isPrivate: 1 }), ID, NOW);
  assert.equal(metadata?.available, false);
  assert.equal(metadata?.private, true);
});

test("treats a capture with no public SOG as unavailable", () => {
  const outputs = [{ fileFormat: "ply", type: "model", url: "https://example.test/0.ply" }];
  assert.equal(inspectTaskDetail(detail({ outputs }), ID, NOW)?.available, false);
});

test("rejects a response describing a different capture", () => {
  assert.equal(inspectTaskDetail(detail({ taskOrderNo: "GS3DGother" }), ID, NOW), null);
});

test("rejects an error response", () => {
  assert.equal(inspectTaskDetail({ code: 1, data: null }, ID, NOW), null);
  assert.equal(inspectTaskDetail(null, ID, NOW), null);
  assert.equal(inspectTaskDetail([], ID, NOW), null);
});

test("never surfaces a signed asset URL as durable metadata", () => {
  const metadata = inspectTaskDetail(detail(), ID, NOW)!;
  const durable = { ...metadata } as Record<string, unknown>;
  delete durable.preview_video_url;
  assert.ok(
    !JSON.stringify(durable).includes("sig="),
    "signed URLs must stay out of persisted fields",
  );
});

test("serializes catalog records in a stable field order", () => {
  const record: CaptureRecord = {
    tags: ["community"],
    status: "available",
    last_checked_at: NOW.toISOString(),
    discovered_at: NOW.toISOString(),
    source_author: null,
    source_post_url: null,
    camera: "X4 Air",
    captured_at: "2026-08-14",
    description: "",
    title: "Example",
    insta360_url: `https://app.insta360.com/3dspace/detail/${ID}`,
    id: ID,
  };

  const keys = Object.keys(JSON.parse(serializeCapture(record)));
  assert.deepEqual(keys, [
    "id",
    "insta360_url",
    "title",
    "description",
    "captured_at",
    "camera",
    "source_post_url",
    "source_author",
    "discovered_at",
    "last_checked_at",
    "status",
    "tags",
  ]);
  assert.ok(serializeCapture(record).endsWith("}\n"));
});

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

test("rejects anything that is not a public Insta360 capture", () => {
  const rejected = [
    "",
    "   ",
    "not a url",
    "https://example.com/3dspace/detail/" + ID,
    "https://app.insta360.com/3dspace/detail/NOTANID",
    "https://app.insta360.com/some/other/path",
    `https://app.insta360.com/3dspace/detail/${ID}/extra`,
  ];
  for (const input of rejected) {
    assert.throws(() => normalizeCaptureInput(input), Error, `should reject ${input}`);
  }
});

test("tells a missing capture apart from an unreachable service", () => {
  // Insta360 answers HTTP 200 with a non-zero code for an id it does not know.
  assert.equal(isNotFoundBody({ code: 40004, msg: "FindNotFound" }), true);
  assert.equal(isNotFoundBody({ code: 0, data: {} }), false);
  // Anything that is not a recognisable answer must stay "unreachable", so a
  // network problem can never be mistaken for a deleted capture.
  assert.equal(isNotFoundBody(null), false);
  assert.equal(isNotFoundBody("<html>502</html>"), false);
  assert.equal(isNotFoundBody({}), false);
  assert.equal(isNotFoundBody({ code: "40004" }), false);
});

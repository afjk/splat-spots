import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalInsta360Url,
  isCaptureId,
  normalizeCaptureInput,
} from "../lib/captures/normalize.ts";

const id = "GS3DG1e1717642f804279b86617dc5e196de8";

test("normalizes an Insta360 detail URL", () => {
  assert.deepEqual(
    normalizeCaptureInput(`https://app.insta360.com/3dspace/detail/${id}?share=1#view`),
    { id, insta360_url: canonicalInsta360Url(id) },
  );
});

test("also accepts a bare ID for importer integrations", () => {
  assert.equal(normalizeCaptureInput(id).id, id);
  assert.equal(isCaptureId(id), true);
});

test("rejects lookalike hosts and malformed IDs", () => {
  assert.throws(
    () => normalizeCaptureInput(`https://app.insta360.com.evil.test/3dspace/detail/${id}`),
    /app\.insta360\.com/,
  );
  assert.throws(
    () => normalizeCaptureInput("https://app.insta360.com/3dspace/detail/GS3DGshort"),
    /GS3DG ID/,
  );
});

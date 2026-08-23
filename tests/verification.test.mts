import assert from "node:assert/strict";
import test from "node:test";
import { inspectTaskDetail } from "../lib/verification/insta360.ts";

const id = "GS3DG1e1717642f804279b86617dc5e196de8";

test("recognizes a public task with a SOG without returning its signed URL", () => {
  const result = inspectTaskDetail(
    {
      code: 0,
      data: {
        taskOrderNo: id,
        isPrivate: 0,
        title: "Verified room",
        outputs: [{ fileFormat: "sog", url: "https://assets.example/signed.sog?secret=1" }],
      },
    },
    id,
  );
  assert.deepEqual(result, { available: true, private: false, title: "Verified room" });
  assert.doesNotMatch(JSON.stringify(result), /signed|secret/);
});

test("rejects private tasks and mismatched IDs", () => {
  assert.deepEqual(
    inspectTaskDetail(
      {
        code: 0,
        data: {
          taskOrderNo: id,
          isPrivate: 1,
          outputs: [{ fileFormat: "sog", url: "https://assets.example/scene.sog" }],
        },
      },
      id,
    ),
    { available: false, private: true, title: null },
  );
  assert.equal(
    inspectTaskDetail({ code: 0, data: { taskOrderNo: `${id}x`, outputs: [] } }, id),
    null,
  );
});

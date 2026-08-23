import type { Capture } from "@/lib/captures/types";

/**
 * Small, reviewable seed catalog. Discovery sources and user submissions are
 * deliberately kept outside this file so the catalog can migrate cleanly.
 */
export const seedCaptures: Capture[] = [
  {
    id: "GS3DG1e1717642f804279b86617dc5e196de8",
    insta360_url:
      "https://app.insta360.com/3dspace/detail/GS3DG1e1717642f804279b86617dc5e196de8",
    title: "8月13日の空間キャプチャ",
    description:
      "一般公開されたSpatial Captureを、WebとXRの両方でたどるための最初のカタログエントリ。",
    source_post_url: null,
    source_author: null,
    discovered_at: "2026-08-23T00:00:00.000Z",
    last_checked_at: null,
    status: "available",
    tags: ["community", "spatial capture"],
  },
];

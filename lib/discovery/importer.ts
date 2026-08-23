import { normalizeCaptureInput } from "@/lib/captures/normalize";
import type { Capture } from "@/lib/captures/types";
import type { DiscoveryCandidate } from "./types";

export type ImportDecision =
  | { accepted: true; capture: Capture }
  | { accepted: false; reason: string };

export function prepareDiscoveryCandidate(
  candidate: DiscoveryCandidate,
  now = new Date(),
): ImportDecision {
  try {
    const normalized = normalizeCaptureInput(candidate.insta360_url);
    return {
      accepted: true,
      capture: {
        id: normalized.id,
        insta360_url: normalized.insta360_url,
        title: candidate.title.trim() || "Untitled capture",
        description: candidate.description.trim(),
        source_post_url: candidate.source_post_url,
        source_author: candidate.source_author,
        discovered_at: candidate.discovered_at ?? now.toISOString(),
        last_checked_at: null,
        status: "pending",
        tags: candidate.tags,
      },
    };
  } catch (error) {
    return {
      accepted: false,
      reason: error instanceof Error ? error.message : "Invalid candidate",
    };
  }
}

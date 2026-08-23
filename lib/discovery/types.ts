import type { CaptureSubmission } from "@/lib/captures/types";

export type DiscoveryCandidate = CaptureSubmission & {
  discovered_at?: string;
  discovery_source: string;
};

/**
 * Discovery providers only produce candidates. Normalization, review and
 * persistence stay in the catalog importer, which keeps future search/X
 * adapters from gaining direct write access.
 */
export interface DiscoveryProvider {
  readonly name: string;
  discover(signal?: AbortSignal): AsyncIterable<DiscoveryCandidate>;
}

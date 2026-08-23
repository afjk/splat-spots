export type CaptureStatus = "available" | "pending" | "unavailable";

export type Capture = {
  id: string;
  insta360_url: string;
  title: string;
  description: string;
  source_post_url: string | null;
  source_author: string | null;
  discovered_at: string;
  last_checked_at: string | null;
  status: CaptureStatus;
  tags: string[];
};

export type CaptureSubmission = Pick<
  Capture,
  | "insta360_url"
  | "title"
  | "description"
  | "source_post_url"
  | "source_author"
  | "tags"
>;

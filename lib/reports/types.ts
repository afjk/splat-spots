export type ReportRequestType = "remove" | "correction" | "unavailable" | "other";

export type CaptureReport = {
  id: string;
  capture_id: string;
  request_type: ReportRequestType;
  requester_email: string;
  relationship: string;
  message: string;
  created_at: string;
  status: "open" | "resolved" | "dismissed";
};

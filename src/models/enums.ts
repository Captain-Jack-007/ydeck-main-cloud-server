export const WORKSPACE_PLANS = ["free", "pro", "team", "enterprise"] as const;
export type WorkspacePlan = (typeof WORKSPACE_PLANS)[number];

export const MEMBER_ROLES = ["owner", "admin", "editor", "viewer"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const DEVICE_STATUSES = ["active", "revoked", "disabled"] as const;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

export const SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due", "canceled", "expired"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const JOB_TYPES = ["generate", "refine", "export", "share"] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = ["queued", "parsing", "llm", "rendering", "exporting", "done", "error", "canceled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const TERMINAL_JOB_STATUSES = ["done", "error", "canceled"] as const;
export type TerminalJobStatus = (typeof TERMINAL_JOB_STATUSES)[number];

export const FILE_SCOPES = ["user", "workspace", "device", "job"] as const;
export type FileScope = (typeof FILE_SCOPES)[number];

export const PACK_TYPES = ["template", "plugin"] as const;
export type PackType = (typeof PACK_TYPES)[number];

export const SOCIAL_PROVIDERS = ["telegram", "google", "facebook"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export const SOURCE_COLLECTION_TYPES = [
  "book",
  "course",
  "report",
  "manual",
  "paper_bundle",
  "other",
] as const;
export type SourceCollectionType = (typeof SOURCE_COLLECTION_TYPES)[number];

export const SOURCE_COLLECTION_STATUSES = [
  "uploaded",
  "processing",
  "indexed",
  "error",
] as const;
export type SourceCollectionStatus = (typeof SOURCE_COLLECTION_STATUSES)[number];

export const BOOK_SECTION_TYPES = [
  "chapter",
  "lesson",
  "unit",
  "section",
  "part",
  "module",
] as const;
export type BookSectionType = (typeof BOOK_SECTION_TYPES)[number];

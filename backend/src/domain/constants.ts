export const SUBJECTS = ["programming", "security_privacy", "refactoring"] as const;
export type Subject = (typeof SUBJECTS)[number];

export const LANGUAGES = ["c", "cpp", "python", "java", "javascript", "go"] as const;
export type Language = (typeof LANGUAGES)[number];

export const LEVELS = ["entry", "working", "professional"] as const;
export type Level = (typeof LEVELS)[number];

export const QUESTION_TYPES = ["single", "multiple", "judgment"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_STATUSES = ["draft", "published", "archived"] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export const ROLES = ["learner", "content_admin", "system_admin"] as const;
export type Role = (typeof ROLES)[number];

export const EXAM_STATUSES = ["in_progress", "submitted", "abandoned"] as const;
export type ExamStatus = (typeof EXAM_STATUSES)[number];

export const AUDIT_ACTIONS = [
  "ip_role_upsert",
  "ip_role_delete",
  "question_create",
  "question_update",
  "question_publish",
  "question_import",
  "question_export",
  "question_upload",
  "question_archive",
  "question_delete",
  "data_clear",
  "exam_abandon",
  "exam_config_reload"
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const P0_SOURCE_LANGUAGES = ["c", "cpp", "python", "java"] as const;
export type P0SourceLanguage = (typeof P0_SOURCE_LANGUAGES)[number];

export const SUBJECTS = ["programming", "security_privacy", "refactoring"] as const;
export type Subject = (typeof SUBJECTS)[number];

export const LANGUAGES = ["c", "cpp", "python", "java"] as const;
export type Language = (typeof LANGUAGES)[number];

export const LEVELS = ["entry", "working", "professional"] as const;
export type Level = (typeof LEVELS)[number];

export const QUESTION_TYPES = ["single", "multiple", "judgment"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_STATUSES = ["draft", "published", "archived"] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export const ROLES = ["learner", "content_admin", "system_admin"] as const;
export type Role = (typeof ROLES)[number];

export const SUBJECT_LABELS: Record<Subject, { name: string; long: string; short: string }> = {
  programming: {
    name: "编程知识",
    long: "科目二（编程知识）",
    short: "科目二"
  },
  security_privacy: {
    name: "安全质量隐私",
    long: "科目三（安全质量隐私）",
    short: "科目三"
  },
  refactoring: {
    name: "重构知识",
    long: "科目四（重构知识）",
    short: "科目四"
  }
};

export const LANGUAGE_LABELS: Record<Language, string> = {
  c: "C",
  cpp: "C++",
  python: "Python",
  java: "Java"
};

export const LEVEL_LABELS: Record<Level, string> = {
  entry: "入门级",
  working: "工作级",
  professional: "专业级"
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single: "单选题",
  multiple: "多选题",
  judgment: "判断题"
};

export const QUESTION_STATUS_LABELS: Record<QuestionStatus, string> = {
  draft: "草稿",
  published: "已发布",
  archived: "已归档"
};

export const ROLE_LABELS: Record<Role, string> = {
  learner: "学习者",
  content_admin: "题库管理员",
  system_admin: "系统管理员"
};

export function getSubjectLabel(subject: Subject, variant: "name" | "long" | "short" = "long"): string {
  return SUBJECT_LABELS[subject][variant];
}

export function getLanguageLabel(language: Language): string {
  return LANGUAGE_LABELS[language];
}

export function getLevelLabel(level: Level): string {
  return LEVEL_LABELS[level];
}

export function getQuestionTypeLabel(type: QuestionType): string {
  return QUESTION_TYPE_LABELS[type];
}

export function getQuestionStatusLabel(status: QuestionStatus): string {
  return QUESTION_STATUS_LABELS[status];
}

export function getRoleLabel(role: Role): string {
  return ROLE_LABELS[role];
}

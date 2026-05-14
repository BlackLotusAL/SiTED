import type { AuditAction, Language, Level, QuestionStatus, QuestionType, Role, Subject } from "../domain/constants";
import type { JsonObject } from "../db/json";

export const SEED_SOURCE_PREFIX = "SITED-SEED";
export const SEED_TAG = "seed";
export const SEED_PRACTICE_MODE = "seed_practice";
export const SEED_EXAM_FLAG = "sited-seed-exam";

export const seedIps = {
  learner: "10.42.11.10",
  learnerAlt: "10.42.11.11",
  contentAdmin: "10.42.20.17",
  learnerBinding: "10.42.20.18",
  systemAdmin: "10.42.18.36"
} as const;

export const seedVisitors: SeedVisitor[] = [
  { ip: seedIps.learner, firstSeenAt: daysAgo(6), lastSeenAt: daysAgo(0, 9) },
  { ip: seedIps.learnerAlt, firstSeenAt: daysAgo(4), lastSeenAt: daysAgo(1, 15) },
  { ip: seedIps.contentAdmin, firstSeenAt: daysAgo(3), lastSeenAt: daysAgo(0, 10) },
  { ip: seedIps.systemAdmin, firstSeenAt: daysAgo(2), lastSeenAt: daysAgo(0, 11) }
];

export const seedRoleBindings: SeedRoleBinding[] = [
  {
    ip: seedIps.contentAdmin,
    role: "content_admin",
    note: "Seed content administrator",
    updatedByIp: seedIps.systemAdmin
  },
  {
    ip: seedIps.learnerBinding,
    role: "learner",
    note: "Seed fixed learner binding",
    updatedByIp: seedIps.systemAdmin
  }
];

export const examReadySource = {
  subject: "programming",
  language: "java",
  level: "working"
} as const;

export const examConfigSnapshot = {
  durationMinutes: 45,
  passScorePercent: 60,
  questionCounts: {
    judgment: 8,
    single: 22,
    multiple: 10
  }
} satisfies JsonObject;

export function buildSeedQuestions(): SeedQuestion[] {
  return [
    ...buildExamReadyQuestions(),
    ...coverageQuestions()
  ];
}

export function buildSeedAuditLogs(): SeedAuditLog[] {
  return [
    audit("question_import", `${SEED_SOURCE_PREFIX}-IMPORT`, { imported: 44, result: "success" }),
    audit("question_publish", `${SEED_SOURCE_PREFIX}-EXAM-JAVA-WORKING-SINGLE-01`, { result: "success" }),
    audit("question_export", `${SEED_SOURCE_PREFIX}-EXPORT`, { exported: 44, result: "success" }),
    audit("ip_role_upsert", seedIps.contentAdmin, { role: "content_admin", result: "success" }),
    audit("exam_abandon", `${SEED_SOURCE_PREFIX}-EXAM-ABANDONED`, { reason: "seed-readiness", result: "success" }),
    audit("data_clear", `${SEED_SOURCE_PREFIX}-DRY-RUN`, { scope: "activity", result: "rejected" })
  ];
}

export interface SeedVisitor {
  ip: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

export interface SeedRoleBinding {
  ip: string;
  role: "learner" | "content_admin";
  note: string;
  updatedByIp: string;
}

export interface SeedQuestion {
  sourceCode: string;
  subject: Subject;
  language: Language | null;
  level: Level;
  type: QuestionType;
  stemMd: string;
  options: SeedQuestionOption[];
  correctAnswers: string[];
  explanationMd: string;
  memo: string;
  tags: string[];
  totalAttempts: number;
  correctAttempts: number;
  status: QuestionStatus;
  createdByIp: string;
}

export interface SeedQuestionOption {
  key: string;
  text: string;
  isCorrect?: boolean;
}

export interface SeedAuditLog {
  actorIp: string;
  role: Role;
  action: AuditAction;
  target: string;
  detail: JsonObject;
  createdAt: Date;
}

function buildExamReadyQuestions(): SeedQuestion[] {
  return [
    ...range(22).map((index) => question({
      sourceCode: examSourceCode("single", index),
      type: "single",
      stemMd: `Seed Java single choice ${index}: which collection is safe for concurrent map updates?\n\n\`\`\`java\nMap<String, Integer> counts = new ConcurrentHashMap<>();\ncounts.merge(key, 1, Integer::sum);\n\`\`\``,
      options: optionSet("single"),
      correctAnswers: ["C"],
      tags: ["seed", "java", "single", "concurrency"],
      totalAttempts: 40 + index,
      correctAttempts: 24 + (index % 10)
    })),
    ...range(10).map((index) => question({
      sourceCode: examSourceCode("multiple", index),
      type: "multiple",
      stemMd: `Seed Java multiple choice ${index}: select practices that reduce SQL injection risk.`,
      options: optionSet("multiple"),
      correctAnswers: ["A", "C"],
      tags: ["seed", "java", "multiple", "security"],
      totalAttempts: 30 + index,
      correctAttempts: 18 + (index % 6)
    })),
    ...range(8).map((index) => question({
      sourceCode: examSourceCode("judgment", index),
      type: "judgment",
      stemMd: `Seed Java judgment ${index}: volatile makes a compound increment atomic.`,
      options: optionSet("judgment"),
      correctAnswers: ["B"],
      tags: ["seed", "java", "judgment", "memory-model"],
      totalAttempts: 28 + index,
      correctAttempts: 12 + (index % 5)
    }))
  ];
}

function coverageQuestions(): SeedQuestion[] {
  return [
    question({
      sourceCode: `${SEED_SOURCE_PREFIX}-C-ENTRY-SINGLE`,
      subject: "programming",
      language: "c",
      level: "entry",
      type: "single",
      stemMd: "Seed C entry single: which function copies a string with an explicit maximum length?",
      options: optionSet("single"),
      correctAnswers: ["C"],
      tags: ["seed", "c", "entry"],
      status: "published"
    }),
    question({
      sourceCode: `${SEED_SOURCE_PREFIX}-CPP-PRO-MULTIPLE`,
      subject: "programming",
      language: "cpp",
      level: "professional",
      type: "multiple",
      stemMd: "Seed C++ professional multiple: choose RAII benefits.",
      options: optionSet("multiple"),
      correctAnswers: ["A", "C"],
      tags: ["seed", "cpp", "professional"],
      status: "published"
    }),
    question({
      sourceCode: `${SEED_SOURCE_PREFIX}-PY-SEC-WORK-JUDGMENT`,
      subject: "security_privacy",
      language: "python",
      level: "working",
      type: "judgment",
      stemMd: "Seed Python security judgment: parameterized queries reduce injection risk.",
      options: optionSet("judgment"),
      correctAnswers: ["A"],
      tags: ["seed", "python", "security"],
      status: "published"
    }),
    question({
      sourceCode: `${SEED_SOURCE_PREFIX}-JS-COVERAGE-DRAFT`,
      subject: "programming",
      language: "javascript",
      level: "working",
      type: "single",
      stemMd: "Seed JavaScript draft single: which declaration creates a block-scoped binding?",
      options: optionSet("single"),
      correctAnswers: ["C"],
      tags: ["seed", "javascript", "draft"],
      status: "draft"
    }),
    question({
      sourceCode: `${SEED_SOURCE_PREFIX}-GO-COVERAGE-ARCHIVED`,
      subject: "programming",
      language: "go",
      level: "professional",
      type: "multiple",
      stemMd: "Seed Go archived multiple: choose safe concurrency practices.",
      options: optionSet("multiple"),
      correctAnswers: ["A", "C"],
      tags: ["seed", "go", "archived"],
      status: "archived"
    }),
    question({
      sourceCode: `${SEED_SOURCE_PREFIX}-REFACTORING-PRO-JUDGMENT`,
      subject: "refactoring",
      language: null,
      level: "professional",
      type: "judgment",
      stemMd: "Seed refactoring judgment: extract method is useful when a cohesive block has a clear name.",
      options: optionSet("judgment"),
      correctAnswers: ["A"],
      tags: ["seed", "refactoring", "professional"],
      status: "published"
    })
  ];
}

function question(input: Partial<SeedQuestion> & Pick<SeedQuestion, "sourceCode" | "stemMd" | "type" | "options" | "correctAnswers" | "tags">): SeedQuestion {
  return {
    subject: examReadySource.subject,
    language: examReadySource.language,
    level: examReadySource.level,
    explanationMd: "Seed explanation for local verification and smoke testing.",
    memo: "Seed readiness example",
    totalAttempts: 12,
    correctAttempts: 7,
    status: "published",
    createdByIp: seedIps.contentAdmin,
    ...input
  };
}

function optionSet(type: QuestionType): SeedQuestionOption[] {
  if (type === "judgment") {
    return [
      { key: "A", text: "True", isCorrect: true },
      { key: "B", text: "False", isCorrect: false }
    ];
  }

  if (type === "multiple") {
    return [
      { key: "A", text: "Use parameterized APIs", isCorrect: true },
      { key: "B", text: "Concatenate raw user input", isCorrect: false },
      { key: "C", text: "Apply least privilege", isCorrect: true },
      { key: "D", text: "Hide the input box in the UI", isCorrect: false }
    ];
  }

  return [
    { key: "A", text: "ArrayList", isCorrect: false },
    { key: "B", text: "HashMap", isCorrect: false },
    { key: "C", text: "ConcurrentHashMap", isCorrect: true },
    { key: "D", text: "LinkedList", isCorrect: false }
  ];
}

function examSourceCode(type: QuestionType, index: number): string {
  return `${SEED_SOURCE_PREFIX}-EXAM-JAVA-WORKING-${type.toUpperCase()}-${String(index + 1).padStart(2, "0")}`;
}

function audit(action: AuditAction, target: string, detail: JsonObject): SeedAuditLog {
  return {
    actorIp: seedIps.systemAdmin,
    role: "system_admin",
    action,
    target,
    detail: { ...detail, seedTag: SEED_TAG },
    createdAt: daysAgo(0, 8)
  };
}

function range(length: number): number[] {
  return Array.from({ length }, (_value, index) => index);
}

function daysAgo(days: number, hour = 8): Date {
  const date = new Date();
  date.setUTCHours(hour, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

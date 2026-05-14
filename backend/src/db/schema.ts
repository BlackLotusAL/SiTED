import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  decimal,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import {
  AUDIT_ACTIONS,
  EXAM_STATUSES,
  LANGUAGES,
  LEVELS,
  QUESTION_STATUSES,
  QUESTION_TYPES,
  ROLES,
  SUBJECTS
} from "../domain/constants";
import type { JsonValue } from "./json";

const inet = customType<{ data: string; driverData: string }>({
  dataType() {
    return "inet";
  }
});

export const subjectEnum = pgEnum("Subject", SUBJECTS);
export const languageEnum = pgEnum("Language", LANGUAGES);
export const levelEnum = pgEnum("Level", LEVELS);
export const questionTypeEnum = pgEnum("QuestionType", QUESTION_TYPES);
export const questionStatusEnum = pgEnum("QuestionStatus", QUESTION_STATUSES);
export const roleEnum = pgEnum("Role", ROLES);
export const ipRoleBindingRoleEnum = pgEnum("IpRoleBindingRole", ["learner", "content_admin"]);
export const examStatusEnum = pgEnum("ExamStatus", EXAM_STATUSES);
export const auditActionEnum = pgEnum("AuditAction", AUDIT_ACTIONS);

export const visitors = pgTable(
  "Visitor",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ip: inet("ip").notNull(),
    firstSeenAt: timestamp("firstSeenAt", { precision: 3, mode: "date" }).defaultNow().notNull(),
    lastSeenAt: timestamp("lastSeenAt", { precision: 3, mode: "date" }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("Visitor_ip_key").on(table.ip),
    index("Visitor_lastSeenAt_idx").on(table.lastSeenAt)
  ]
);

export const ipRoleBindings = pgTable(
  "IpRoleBinding",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ip: inet("ip").notNull(),
    role: ipRoleBindingRoleEnum("role").notNull(),
    note: varchar("note", { length: 200 }),
    updatedByIp: inet("updatedByIp").notNull(),
    createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { precision: 3, mode: "date" }).notNull()
  },
  (table) => [
    uniqueIndex("IpRoleBinding_ip_key").on(table.ip),
    index("IpRoleBinding_role_idx").on(table.role),
    index("IpRoleBinding_updatedByIp_idx").on(table.updatedByIp),
    index("IpRoleBinding_updatedAt_idx").on(table.updatedAt),
    check("IpRoleBinding_role_check", sql`${table.role} IN ('learner'::"IpRoleBindingRole", 'content_admin'::"IpRoleBindingRole")`)
  ]
);

export const questions = pgTable(
  "Question",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceCode: varchar("sourceCode", { length: 120 }),
    subject: subjectEnum("subject").notNull(),
    language: languageEnum("language"),
    level: levelEnum("level").notNull(),
    type: questionTypeEnum("type").notNull(),
    stemMd: text("stemMd").notNull(),
    options: jsonb("options").$type<JsonValue>().notNull(),
    correctAnswers: text("correctAnswers").array().default(sql`ARRAY[]::TEXT[]`).notNull(),
    explanationMd: text("explanationMd"),
    memo: varchar("memo", { length: 200 }),
    tags: text("tags").array().default(sql`ARRAY[]::TEXT[]`).notNull(),
    totalAttempts: integer("totalAttempts").default(0).notNull(),
    correctAttempts: integer("correctAttempts").default(0).notNull(),
    status: questionStatusEnum("status").default("draft").notNull(),
    createdByIp: inet("createdByIp").notNull(),
    createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { precision: 3, mode: "date" }).notNull()
  },
  (table) => [
    uniqueIndex("Question_sourceCode_key").on(table.sourceCode),
    index("Question_status_subject_language_level_type_idx").on(table.status, table.subject, table.language, table.level, table.type),
    index("Question_subject_language_level_status_idx").on(table.subject, table.language, table.level, table.status),
    index("Question_type_status_idx").on(table.type, table.status),
    index("Question_createdAt_idx").on(table.createdAt),
    index("Question_updatedAt_idx").on(table.updatedAt),
    index("Question_tags_idx").using("gin", table.tags)
  ]
);

export const practiceAttempts = pgTable(
  "PracticeAttempt",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    visitorId: uuid("visitorId").notNull().references(() => visitors.id, { onDelete: "cascade", onUpdate: "cascade" }),
    questionId: uuid("questionId").notNull().references(() => questions.id, { onDelete: "restrict", onUpdate: "cascade" }),
    selectedKeys: text("selectedKeys").array().default(sql`ARRAY[]::TEXT[]`).notNull(),
    isCorrect: boolean("isCorrect").notNull(),
    mode: varchar("mode", { length: 32 }).default("practice").notNull(),
    durationSec: integer("durationSec"),
    createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).defaultNow().notNull()
  },
  (table) => [
    index("PracticeAttempt_visitorId_createdAt_idx").on(table.visitorId, table.createdAt),
    index("PracticeAttempt_questionId_createdAt_idx").on(table.questionId, table.createdAt),
    index("PracticeAttempt_visitorId_questionId_createdAt_idx").on(table.visitorId, table.questionId, table.createdAt)
  ]
);

export const mistakes = pgTable(
  "Mistake",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    visitorId: uuid("visitorId").notNull().references(() => visitors.id, { onDelete: "cascade", onUpdate: "cascade" }),
    questionId: uuid("questionId").notNull().references(() => questions.id, { onDelete: "restrict", onUpdate: "cascade" }),
    wrongCount: integer("wrongCount").default(0).notNull(),
    consecutiveCorrectCount: integer("consecutiveCorrectCount").default(0).notNull(),
    isMastered: boolean("isMastered").default(false).notNull(),
    lastWrongAt: timestamp("lastWrongAt", { precision: 3, mode: "date" }),
    masteredAt: timestamp("masteredAt", { precision: 3, mode: "date" }),
    createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { precision: 3, mode: "date" }).notNull()
  },
  (table) => [
    uniqueIndex("Mistake_visitorId_questionId_key").on(table.visitorId, table.questionId),
    index("Mistake_visitorId_isMastered_lastWrongAt_idx").on(table.visitorId, table.isMastered, table.lastWrongAt),
    index("Mistake_questionId_idx").on(table.questionId),
    index("Mistake_updatedAt_idx").on(table.updatedAt)
  ]
);

export const bookmarks = pgTable(
  "Bookmark",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    visitorId: uuid("visitorId").notNull().references(() => visitors.id, { onDelete: "cascade", onUpdate: "cascade" }),
    questionId: uuid("questionId").notNull().references(() => questions.id, { onDelete: "restrict", onUpdate: "cascade" }),
    note: varchar("note", { length: 500 }),
    tags: text("tags").array().default(sql`ARRAY[]::TEXT[]`).notNull(),
    createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { precision: 3, mode: "date" }).notNull()
  },
  (table) => [
    uniqueIndex("Bookmark_visitorId_questionId_key").on(table.visitorId, table.questionId),
    index("Bookmark_visitorId_createdAt_idx").on(table.visitorId, table.createdAt),
    index("Bookmark_questionId_idx").on(table.questionId),
    index("Bookmark_tags_idx").using("gin", table.tags)
  ]
);

export const examAttempts = pgTable(
  "ExamAttempt",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    visitorId: uuid("visitorId").notNull().references(() => visitors.id, { onDelete: "cascade", onUpdate: "cascade" }),
    subject: subjectEnum("subject").notNull(),
    language: languageEnum("language"),
    level: levelEnum("level").notNull(),
    configSnapshot: jsonb("configSnapshot").$type<JsonValue>().notNull(),
    questionSnapshot: jsonb("questionSnapshot").$type<JsonValue>().notNull(),
    answers: jsonb("answers").$type<JsonValue>().notNull(),
    flaggedQuestionIds: text("flaggedQuestionIds").array().default(sql`ARRAY[]::TEXT[]`).notNull(),
    status: examStatusEnum("status").default("in_progress").notNull(),
    scorePercent: decimal("scorePercent", { precision: 5, scale: 2 }),
    isPassed: boolean("isPassed"),
    startedAt: timestamp("startedAt", { precision: 3, mode: "date" }).defaultNow().notNull(),
    deadlineAt: timestamp("deadlineAt", { precision: 3, mode: "date" }).notNull(),
    submittedAt: timestamp("submittedAt", { precision: 3, mode: "date" }),
    updatedAt: timestamp("updatedAt", { precision: 3, mode: "date" }).notNull()
  },
  (table) => [
    uniqueIndex("ExamAttempt_single_active_per_visitor").on(table.visitorId).where(sql`${table.status} = 'in_progress'`),
    index("ExamAttempt_visitorId_status_startedAt_idx").on(table.visitorId, table.status, table.startedAt),
    index("ExamAttempt_subject_language_level_status_idx").on(table.subject, table.language, table.level, table.status),
    index("ExamAttempt_startedAt_idx").on(table.startedAt),
    index("ExamAttempt_submittedAt_idx").on(table.submittedAt)
  ]
);

export const auditLogs = pgTable(
  "AuditLog",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorIp: inet("actorIp").notNull(),
    role: roleEnum("role").notNull(),
    action: auditActionEnum("action").notNull(),
    target: varchar("target", { length: 200 }).notNull(),
    detail: jsonb("detail").$type<JsonValue>(),
    createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).defaultNow().notNull()
  },
  (table) => [
    index("AuditLog_createdAt_idx").on(table.createdAt),
    index("AuditLog_actorIp_createdAt_idx").on(table.actorIp, table.createdAt),
    index("AuditLog_action_createdAt_idx").on(table.action, table.createdAt)
  ]
);

export const visitorRelations = relations(visitors, ({ many }) => ({
  practiceAttempts: many(practiceAttempts),
  mistakes: many(mistakes),
  bookmarks: many(bookmarks),
  examAttempts: many(examAttempts)
}));

export const questionRelations = relations(questions, ({ many }) => ({
  practiceAttempts: many(practiceAttempts),
  mistakes: many(mistakes),
  bookmarks: many(bookmarks)
}));

export const practiceAttemptRelations = relations(practiceAttempts, ({ one }) => ({
  visitor: one(visitors, { fields: [practiceAttempts.visitorId], references: [visitors.id] }),
  question: one(questions, { fields: [practiceAttempts.questionId], references: [questions.id] })
}));

export const mistakeRelations = relations(mistakes, ({ one }) => ({
  visitor: one(visitors, { fields: [mistakes.visitorId], references: [visitors.id] }),
  question: one(questions, { fields: [mistakes.questionId], references: [questions.id] })
}));

export const bookmarkRelations = relations(bookmarks, ({ one }) => ({
  visitor: one(visitors, { fields: [bookmarks.visitorId], references: [visitors.id] }),
  question: one(questions, { fields: [bookmarks.questionId], references: [questions.id] })
}));

export const examAttemptRelations = relations(examAttempts, ({ one }) => ({
  visitor: one(visitors, { fields: [examAttempts.visitorId], references: [visitors.id] })
}));

export const schema = {
  auditActionEnum,
  auditLogs,
  bookmarkRelations,
  bookmarks,
  examAttemptRelations,
  examAttempts,
  examStatusEnum,
  ipRoleBindingRoleEnum,
  ipRoleBindings,
  languageEnum,
  levelEnum,
  mistakeRelations,
  mistakes,
  practiceAttemptRelations,
  practiceAttempts,
  questionRelations,
  questionStatusEnum,
  questionTypeEnum,
  questions,
  roleEnum,
  subjectEnum,
  visitorRelations,
  visitors
};

export type VisitorRecord = typeof visitors.$inferSelect;
export type IpRoleBindingRecord = typeof ipRoleBindings.$inferSelect;
export type QuestionRecord = typeof questions.$inferSelect;
export type PracticeAttemptRecord = typeof practiceAttempts.$inferSelect;
export type MistakeRecord = typeof mistakes.$inferSelect;
export type BookmarkRecord = typeof bookmarks.$inferSelect;
export type ExamAttemptRecord = typeof examAttempts.$inferSelect;
export type AuditLogRecord = typeof auditLogs.$inferSelect;

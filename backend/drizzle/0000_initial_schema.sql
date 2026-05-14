CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "Subject" AS ENUM ('programming', 'security_privacy', 'refactoring');
CREATE TYPE "Language" AS ENUM ('c', 'cpp', 'python', 'java', 'javascript', 'go');
CREATE TYPE "Level" AS ENUM ('entry', 'working', 'professional');
CREATE TYPE "QuestionType" AS ENUM ('single', 'multiple', 'judgment');
CREATE TYPE "QuestionStatus" AS ENUM ('draft', 'published', 'archived');
CREATE TYPE "Role" AS ENUM ('learner', 'content_admin', 'system_admin');
CREATE TYPE "IpRoleBindingRole" AS ENUM ('learner', 'content_admin');
CREATE TYPE "ExamStatus" AS ENUM ('in_progress', 'submitted', 'abandoned');
CREATE TYPE "AuditAction" AS ENUM (
  'ip_role_upsert',
  'ip_role_delete',
  'question_create',
  'question_update',
  'question_publish',
  'question_import',
  'question_export',
  'question_upload',
  'question_archive',
  'data_clear',
  'exam_abandon',
  'exam_config_reload'
);

CREATE TABLE "Visitor" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ip" INET NOT NULL,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Visitor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IpRoleBinding" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ip" INET NOT NULL,
  "role" "IpRoleBindingRole" NOT NULL,
  "note" VARCHAR(200),
  "updatedByIp" INET NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IpRoleBinding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IpRoleBinding_role_check" CHECK ("role" IN ('learner'::"IpRoleBindingRole", 'content_admin'::"IpRoleBindingRole"))
);

CREATE TABLE "Question" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "sourceCode" VARCHAR(120),
  "subject" "Subject" NOT NULL,
  "language" "Language",
  "level" "Level" NOT NULL,
  "type" "QuestionType" NOT NULL,
  "stemMd" TEXT NOT NULL,
  "options" JSONB NOT NULL,
  "correctAnswers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "explanationMd" TEXT,
  "memo" VARCHAR(200),
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "totalAttempts" INTEGER NOT NULL DEFAULT 0,
  "correctAttempts" INTEGER NOT NULL DEFAULT 0,
  "status" "QuestionStatus" NOT NULL DEFAULT 'draft',
  "createdByIp" INET NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PracticeAttempt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "visitorId" UUID NOT NULL,
  "questionId" UUID NOT NULL,
  "selectedKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "isCorrect" BOOLEAN NOT NULL,
  "mode" VARCHAR(32) NOT NULL DEFAULT 'practice',
  "durationSec" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PracticeAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Mistake" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "visitorId" UUID NOT NULL,
  "questionId" UUID NOT NULL,
  "wrongCount" INTEGER NOT NULL DEFAULT 0,
  "consecutiveCorrectCount" INTEGER NOT NULL DEFAULT 0,
  "isMastered" BOOLEAN NOT NULL DEFAULT false,
  "lastWrongAt" TIMESTAMP(3),
  "masteredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Mistake_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Bookmark" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "visitorId" UUID NOT NULL,
  "questionId" UUID NOT NULL,
  "note" VARCHAR(500),
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExamAttempt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "visitorId" UUID NOT NULL,
  "subject" "Subject" NOT NULL,
  "language" "Language",
  "level" "Level" NOT NULL,
  "configSnapshot" JSONB NOT NULL,
  "questionSnapshot" JSONB NOT NULL,
  "answers" JSONB NOT NULL,
  "flaggedQuestionIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "ExamStatus" NOT NULL DEFAULT 'in_progress',
  "scorePercent" DECIMAL(5,2),
  "isPassed" BOOLEAN,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deadlineAt" TIMESTAMP(3) NOT NULL,
  "submittedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExamAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actorIp" INET NOT NULL,
  "role" "Role" NOT NULL,
  "action" "AuditAction" NOT NULL,
  "target" VARCHAR(200) NOT NULL,
  "detail" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Visitor_ip_key" ON "Visitor"("ip");
CREATE INDEX "Visitor_lastSeenAt_idx" ON "Visitor"("lastSeenAt");

CREATE UNIQUE INDEX "IpRoleBinding_ip_key" ON "IpRoleBinding"("ip");
CREATE INDEX "IpRoleBinding_role_idx" ON "IpRoleBinding"("role");
CREATE INDEX "IpRoleBinding_updatedByIp_idx" ON "IpRoleBinding"("updatedByIp");
CREATE INDEX "IpRoleBinding_updatedAt_idx" ON "IpRoleBinding"("updatedAt");

CREATE UNIQUE INDEX "Question_sourceCode_key" ON "Question"("sourceCode");
CREATE INDEX "Question_status_subject_language_level_type_idx" ON "Question"("status", "subject", "language", "level", "type");
CREATE INDEX "Question_subject_language_level_status_idx" ON "Question"("subject", "language", "level", "status");
CREATE INDEX "Question_type_status_idx" ON "Question"("type", "status");
CREATE INDEX "Question_createdAt_idx" ON "Question"("createdAt");
CREATE INDEX "Question_updatedAt_idx" ON "Question"("updatedAt");
CREATE INDEX "Question_tags_idx" ON "Question" USING GIN ("tags");

CREATE INDEX "PracticeAttempt_visitorId_createdAt_idx" ON "PracticeAttempt"("visitorId", "createdAt");
CREATE INDEX "PracticeAttempt_questionId_createdAt_idx" ON "PracticeAttempt"("questionId", "createdAt");
CREATE INDEX "PracticeAttempt_visitorId_questionId_createdAt_idx" ON "PracticeAttempt"("visitorId", "questionId", "createdAt");

CREATE INDEX "Mistake_visitorId_isMastered_lastWrongAt_idx" ON "Mistake"("visitorId", "isMastered", "lastWrongAt");
CREATE INDEX "Mistake_questionId_idx" ON "Mistake"("questionId");
CREATE INDEX "Mistake_updatedAt_idx" ON "Mistake"("updatedAt");
CREATE UNIQUE INDEX "Mistake_visitorId_questionId_key" ON "Mistake"("visitorId", "questionId");

CREATE INDEX "Bookmark_visitorId_createdAt_idx" ON "Bookmark"("visitorId", "createdAt");
CREATE INDEX "Bookmark_questionId_idx" ON "Bookmark"("questionId");
CREATE INDEX "Bookmark_tags_idx" ON "Bookmark" USING GIN ("tags");
CREATE UNIQUE INDEX "Bookmark_visitorId_questionId_key" ON "Bookmark"("visitorId", "questionId");

CREATE UNIQUE INDEX "ExamAttempt_single_active_per_visitor" ON "ExamAttempt"("visitorId") WHERE "status" = 'in_progress';
CREATE INDEX "ExamAttempt_visitorId_status_startedAt_idx" ON "ExamAttempt"("visitorId", "status", "startedAt");
CREATE INDEX "ExamAttempt_subject_language_level_status_idx" ON "ExamAttempt"("subject", "language", "level", "status");
CREATE INDEX "ExamAttempt_startedAt_idx" ON "ExamAttempt"("startedAt");
CREATE INDEX "ExamAttempt_submittedAt_idx" ON "ExamAttempt"("submittedAt");

CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_actorIp_createdAt_idx" ON "AuditLog"("actorIp", "createdAt");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

ALTER TABLE "PracticeAttempt" ADD CONSTRAINT "PracticeAttempt_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticeAttempt" ADD CONSTRAINT "PracticeAttempt_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Mistake" ADD CONSTRAINT "Mistake_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Mistake" ADD CONSTRAINT "Mistake_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExamAttempt" ADD CONSTRAINT "ExamAttempt_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Subject" AS ENUM ('programming', 'security_privacy', 'refactoring');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('c', 'cpp', 'python', 'java', 'javascript', 'go');

-- CreateEnum
CREATE TYPE "Level" AS ENUM ('entry', 'working', 'professional');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('single', 'multiple', 'judgment');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('learner', 'content_admin', 'system_admin');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('in_progress', 'submitted', 'abandoned');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('ip_role_upsert', 'ip_role_delete', 'question_import', 'question_archive', 'data_clear', 'exam_config_reload');

-- CreateTable
CREATE TABLE "Visitor" (
    "id" UUID NOT NULL,
    "ip" INET NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Visitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IpRoleBinding" (
    "id" UUID NOT NULL,
    "ip" INET NOT NULL,
    "role" "Role" NOT NULL,
    "note" VARCHAR(200),
    "updatedByIp" INET NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IpRoleBinding_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "IpRoleBinding_role_check" CHECK ("role" IN ('learner', 'content_admin'))
);

-- CreateTable
CREATE TABLE "Question" (
    "id" UUID NOT NULL,
    "sourceCode" VARCHAR(120),
    "subject" "Subject" NOT NULL,
    "language" "Language",
    "level" "Level" NOT NULL,
    "type" "QuestionType" NOT NULL,
    "stemMd" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctAnswers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "explanationMd" TEXT,
    "memo" VARCHAR(200),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "totalAttempts" INTEGER NOT NULL DEFAULT 0,
    "correctAttempts" INTEGER NOT NULL DEFAULT 0,
    "status" "QuestionStatus" NOT NULL DEFAULT 'draft',
    "createdByIp" INET NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeAttempt" (
    "id" UUID NOT NULL,
    "visitorId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "selectedKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isCorrect" BOOLEAN NOT NULL,
    "mode" VARCHAR(32) NOT NULL DEFAULT 'practice',
    "durationSec" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mistake" (
    "id" UUID NOT NULL,
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

-- CreateTable
CREATE TABLE "Bookmark" (
    "id" UUID NOT NULL,
    "visitorId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "note" VARCHAR(500),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamAttempt" (
    "id" UUID NOT NULL,
    "visitorId" UUID NOT NULL,
    "subject" "Subject" NOT NULL,
    "language" "Language",
    "level" "Level" NOT NULL,
    "configSnapshot" JSONB NOT NULL,
    "questionSnapshot" JSONB NOT NULL,
    "answers" JSONB NOT NULL,
    "flaggedQuestionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ExamStatus" NOT NULL DEFAULT 'in_progress',
    "scorePercent" DECIMAL(5,2),
    "isPassed" BOOLEAN,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorIp" INET NOT NULL,
    "role" "Role" NOT NULL,
    "action" "AuditAction" NOT NULL,
    "target" VARCHAR(200) NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Visitor_ip_key" ON "Visitor"("ip");

-- CreateIndex
CREATE INDEX "Visitor_lastSeenAt_idx" ON "Visitor"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "IpRoleBinding_ip_key" ON "IpRoleBinding"("ip");

-- CreateIndex
CREATE INDEX "IpRoleBinding_role_idx" ON "IpRoleBinding"("role");

-- CreateIndex
CREATE INDEX "IpRoleBinding_updatedByIp_idx" ON "IpRoleBinding"("updatedByIp");

-- CreateIndex
CREATE INDEX "IpRoleBinding_updatedAt_idx" ON "IpRoleBinding"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Question_sourceCode_key" ON "Question"("sourceCode");

-- CreateIndex
CREATE INDEX "Question_status_subject_language_level_type_idx" ON "Question"("status", "subject", "language", "level", "type");

-- CreateIndex
CREATE INDEX "Question_subject_language_level_status_idx" ON "Question"("subject", "language", "level", "status");

-- CreateIndex
CREATE INDEX "Question_type_status_idx" ON "Question"("type", "status");

-- CreateIndex
CREATE INDEX "Question_createdAt_idx" ON "Question"("createdAt");

-- CreateIndex
CREATE INDEX "Question_updatedAt_idx" ON "Question"("updatedAt");

-- CreateIndex
CREATE INDEX "Question_tags_idx" ON "Question" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "PracticeAttempt_visitorId_createdAt_idx" ON "PracticeAttempt"("visitorId", "createdAt");

-- CreateIndex
CREATE INDEX "PracticeAttempt_questionId_createdAt_idx" ON "PracticeAttempt"("questionId", "createdAt");

-- CreateIndex
CREATE INDEX "PracticeAttempt_visitorId_questionId_createdAt_idx" ON "PracticeAttempt"("visitorId", "questionId", "createdAt");

-- CreateIndex
CREATE INDEX "Mistake_visitorId_isMastered_lastWrongAt_idx" ON "Mistake"("visitorId", "isMastered", "lastWrongAt");

-- CreateIndex
CREATE INDEX "Mistake_questionId_idx" ON "Mistake"("questionId");

-- CreateIndex
CREATE INDEX "Mistake_updatedAt_idx" ON "Mistake"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Mistake_visitorId_questionId_key" ON "Mistake"("visitorId", "questionId");

-- CreateIndex
CREATE INDEX "Bookmark_visitorId_createdAt_idx" ON "Bookmark"("visitorId", "createdAt");

-- CreateIndex
CREATE INDEX "Bookmark_questionId_idx" ON "Bookmark"("questionId");

-- CreateIndex
CREATE INDEX "Bookmark_tags_idx" ON "Bookmark" USING GIN ("tags");

-- CreateIndex
CREATE UNIQUE INDEX "Bookmark_visitorId_questionId_key" ON "Bookmark"("visitorId", "questionId");

-- CreateIndex
CREATE INDEX "ExamAttempt_visitorId_status_startedAt_idx" ON "ExamAttempt"("visitorId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "ExamAttempt_subject_language_level_status_idx" ON "ExamAttempt"("subject", "language", "level", "status");

-- CreateIndex
CREATE INDEX "ExamAttempt_startedAt_idx" ON "ExamAttempt"("startedAt");

-- CreateIndex
CREATE INDEX "ExamAttempt_submittedAt_idx" ON "ExamAttempt"("submittedAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorIp_createdAt_idx" ON "AuditLog"("actorIp", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "PracticeAttempt" ADD CONSTRAINT "PracticeAttempt_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeAttempt" ADD CONSTRAINT "PracticeAttempt_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mistake" ADD CONSTRAINT "Mistake_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mistake" ADD CONSTRAINT "Mistake_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamAttempt" ADD CONSTRAINT "ExamAttempt_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

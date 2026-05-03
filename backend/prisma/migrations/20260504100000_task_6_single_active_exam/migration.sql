-- Preserve the latest active exam per visitor before enforcing the one-active-exam rule.
-- Older in-progress rows become abandoned history records so the partial unique index can be created safely.
WITH ranked_active_exams AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "visitorId"
      ORDER BY "startedAt" DESC, "updatedAt" DESC, "id" DESC
    ) AS active_rank
  FROM "ExamAttempt"
  WHERE "status" = 'in_progress'
)
UPDATE "ExamAttempt"
SET "status" = 'abandoned'
WHERE "id" IN (
  SELECT "id"
  FROM ranked_active_exams
  WHERE active_rank > 1
);

CREATE UNIQUE INDEX "ExamAttempt_single_active_per_visitor"
ON "ExamAttempt"("visitorId")
WHERE "status" = 'in_progress';

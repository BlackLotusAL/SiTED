CREATE UNIQUE INDEX "ExamAttempt_single_active_per_visitor"
ON "ExamAttempt"("visitorId")
WHERE "status" = 'in_progress';

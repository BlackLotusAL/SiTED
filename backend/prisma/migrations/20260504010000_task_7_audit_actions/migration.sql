ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'question_create';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'question_update';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'question_publish';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'question_export';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'question_upload';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'exam_abandon';

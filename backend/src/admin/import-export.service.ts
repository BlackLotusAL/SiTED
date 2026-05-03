import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Role } from "../domain/constants";
import { isValidQuestionStatus } from "../domain/validation";
import { PrismaService } from "../prisma/prisma.service";
import { normalizeQuestionInput, validateQuestionInput, type NormalizedQuestionInput } from "../questions/question-validator";

export interface ImportBatch {
  version: string;
  questions: unknown[];
}

export interface ImportError {
  row: number;
  field: string;
  message: string;
}

export interface ImportActor {
  actorIp: string;
  role: Role;
}

@Injectable()
export class ImportExportService {
  constructor(private readonly prisma: PrismaService) {}

  async validateImport(input: unknown) {
    const errors: ImportError[] = [];
    const questions = this.extractBatch(input, errors);
    const seenSourceCodes = new Map<string, number>();
    let validRows = 0;

    questions.forEach((question, index) => {
      const row = index + 1;
      const rowErrors = validateQuestionInput(question);
      const sourceCode = sourceCodeOf(question);
      if (sourceCode !== undefined) {
        const firstRow = seenSourceCodes.get(sourceCode);
        if (firstRow !== undefined) {
          rowErrors.push({ field: "sourceCode", message: `Duplicate sourceCode also appears on row ${firstRow}` });
        } else {
          seenSourceCodes.set(sourceCode, row);
        }
      }

      if (rowErrors.length === 0) {
        validRows += 1;
      } else {
        errors.push(...rowErrors.map((error) => ({ row, field: error.field, message: error.message })));
      }
    });

    return {
      valid: errors.length === 0,
      importableCount: validRows,
      failedCount: questions.length - validRows,
      errors
    };
  }

  async commitImport(input: unknown, actor: ImportActor) {
    const report = await this.validateImport(input);
    if (!report.valid) {
      throw new BadRequestException({
        code: "IMPORT_VALIDATION_FAILED",
        message: "Import batch has validation errors",
        errors: report.errors
      });
    }

    const batch = input as ImportBatch;
    const normalized = batch.questions.map((question) => normalizeQuestionInput(question));

    await this.prisma.$transaction(async (tx) => {
      for (const question of normalized) {
        await tx.question.create({
          data: {
            ...this.toQuestionData(question),
            createdByIp: actor.actorIp,
            status: "draft"
          }
        });
      }

      await tx.auditLog.create({
        data: {
          actorIp: actor.actorIp,
          role: actor.role,
          action: "question_import",
          target: "questions",
          detail: { importedCount: normalized.length }
        }
      });
    });

    return { importedCount: normalized.length };
  }

  async exportQuestions(query: { subject?: string; language?: string; level?: string; type?: string; status?: string }) {
    const where: Prisma.QuestionWhereInput = {};
    if (typeof query.subject === "string") {
      where.subject = query.subject as never;
    }
    if (typeof query.language === "string") {
      where.language = query.language as never;
    }
    if (typeof query.level === "string") {
      where.level = query.level as never;
    }
    if (typeof query.type === "string") {
      where.type = query.type as never;
    }
    if (isValidQuestionStatus(query.status)) {
      where.status = query.status;
    }

    const questions = await this.prisma.question.findMany({
      where,
      orderBy: { updatedAt: "desc" }
    });

    return {
      version: "1.0",
      questions: questions.map((question) => ({
        sourceCode: question.sourceCode ?? undefined,
        subject: question.subject,
        language: question.language,
        level: question.level,
        type: question.type,
        tags: question.tags,
        stemMd: question.stemMd,
        options: exportOptions(question.options, question.correctAnswers),
        explanationMd: question.explanationMd ?? undefined,
        memo: question.memo ?? undefined
      }))
    };
  }

  private extractBatch(input: unknown, errors: ImportError[]): unknown[] {
    if (typeof input !== "object" || input === null) {
      errors.push({ row: 0, field: "batch", message: "Import payload must be an object" });
      return [];
    }

    const batch = input as Partial<ImportBatch>;
    if (batch.version !== "1.0") {
      errors.push({ row: 0, field: "version", message: "Unsupported import version" });
    }
    if (!Array.isArray(batch.questions) || batch.questions.length === 0) {
      errors.push({ row: 0, field: "questions", message: "questions must be a non-empty array" });
      return [];
    }

    return batch.questions;
  }

  private toQuestionData(question: NormalizedQuestionInput): Omit<Prisma.QuestionUncheckedCreateInput, "createdByIp"> {
    return {
      sourceCode: question.sourceCode,
      subject: question.subject,
      language: question.language,
      level: question.level,
      type: question.type,
      stemMd: question.stemMd,
      options: question.options as unknown as Prisma.InputJsonValue,
      correctAnswers: question.correctAnswers,
      explanationMd: question.explanationMd,
      memo: question.memo,
      tags: question.tags,
      status: "draft"
    };
  }
}

function sourceCodeOf(question: unknown): string | undefined {
  if (typeof question !== "object" || question === null) {
    return undefined;
  }
  const value = (question as { sourceCode?: unknown }).sourceCode;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function exportOptions(options: Prisma.JsonValue, correctAnswers: string[]) {
  if (!Array.isArray(options)) {
    return [];
  }
  const correct = new Set(correctAnswers);
  return options
    .filter((option) => typeof option === "object" && option !== null && !Array.isArray(option))
    .map((option) => {
      const candidate = option as { key?: unknown; text?: unknown };
      return {
        key: typeof candidate.key === "string" ? candidate.key : "",
        text: typeof candidate.text === "string" ? candidate.text : "",
        isCorrect: typeof candidate.key === "string" && correct.has(candidate.key)
      };
    });
}

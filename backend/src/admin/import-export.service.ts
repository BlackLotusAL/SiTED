import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import { DbService } from "../db/db.service";
import { isUniqueViolation } from "../db/query-helpers";
import { auditLogs, questions } from "../db/schema";
import type { InputJsonValue, JsonValue } from "../db/json";
import type { Role } from "../domain/constants";
import {
  isValidLanguage,
  isValidLevel,
  isValidQuestionStatus,
  isValidQuestionType,
  isValidSubject
} from "../domain/validation";
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
  constructor(@Inject(DbService) private readonly db: DbService) {}

  async validateImport(input: unknown) {
    const errors: ImportError[] = [];
    const questions = this.extractBatch(input, errors);
    const seenSourceCodes = new Map<string, number>();
    const sourceRows = new Map<string, number[]>();
    let validRows = 0;

    questions.forEach((question, index) => {
      const row = index + 1;
      const rowErrors = validateQuestionInput(question);
      const sourceCode = sourceCodeOf(question);
      if (sourceCode !== undefined) {
        sourceRows.set(sourceCode, [...(sourceRows.get(sourceCode) ?? []), row]);
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

    const existingSourceCodes = await this.findExistingSourceCodes([...sourceRows.keys()]);
    for (const sourceCode of existingSourceCodes) {
      for (const row of sourceRows.get(sourceCode) ?? []) {
        errors.push({ row, field: "sourceCode", message: "sourceCode already exists" });
      }
    }

    const rowsWithErrors = new Set(errors.filter((error) => error.row > 0).map((error) => error.row));
    validRows = questions.filter((_question, index) => !rowsWithErrors.has(index + 1)).length;

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
    const sourceRows = collectSourceRows(batch.questions);

    try {
      await this.db.client.transaction(async (tx) => {
        for (const question of normalized) {
          await tx.insert(questions).values({
              ...this.toQuestionData(question),
              createdByIp: actor.actorIp,
            status: "draft",
            updatedAt: new Date()
          });
        }

        await tx.insert(auditLogs).values({
            actorIp: actor.actorIp,
            role: actor.role,
            action: "question_import",
            target: "questions",
            detail: { importedCount: normalized.length }
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existingSourceCodes = await this.findExistingSourceCodes([...sourceRows.keys()]);
        const conflicts = existingSourceCodes.size > 0 ? [...existingSourceCodes] : [...sourceRows.keys()];
        const errors = conflicts.flatMap((sourceCode) =>
          (sourceRows.get(sourceCode) ?? []).map((row) => ({
            row,
            field: "sourceCode",
            sourceCode,
            message: "sourceCode already exists"
          }))
        );

        throw new ConflictException({
          code: "IMPORT_SOURCE_CODE_CONFLICT",
          message: "Import sourceCode conflicts with existing questions",
          conflicts,
          errors
        });
      }
      throw error;
    }

    return { importedCount: normalized.length };
  }

  async exportQuestions(query: { subject?: string; language?: string; level?: string; type?: string; status?: string }) {
    const filters: SQL[] = [];
    if (query.subject !== undefined) {
      if (!isValidSubject(query.subject)) {
        throw invalidFilter("subject");
      }
      filters.push(eq(questions.subject, query.subject));
    }
    if (query.language !== undefined) {
      if (!isValidLanguage(query.language)) {
        throw invalidFilter("language");
      }
      filters.push(eq(questions.language, query.language));
    }
    if (query.level !== undefined) {
      if (!isValidLevel(query.level)) {
        throw invalidFilter("level");
      }
      filters.push(eq(questions.level, query.level));
    }
    if (query.type !== undefined) {
      if (!isValidQuestionType(query.type)) {
        throw invalidFilter("type");
      }
      filters.push(eq(questions.type, query.type));
    }
    if (query.status !== undefined) {
      if (!isValidQuestionStatus(query.status)) {
        throw invalidFilter("status");
      }
      filters.push(eq(questions.status, query.status));
    }

    const rows = await this.db.client
      .select()
      .from(questions)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(questions.updatedAt));

    return {
      version: "1.0",
      questions: rows.map((question) => ({
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

  private toQuestionData(question: NormalizedQuestionInput) {
    return {
      sourceCode: question.sourceCode,
      subject: question.subject,
      language: question.language,
      level: question.level,
      type: question.type,
      stemMd: question.stemMd,
      options: question.options as unknown as InputJsonValue,
      correctAnswers: question.correctAnswers,
      explanationMd: question.explanationMd,
      memo: question.memo,
      tags: question.tags,
      status: "draft"
    };
  }

  private async findExistingSourceCodes(sourceCodes: string[]): Promise<Set<string>> {
    if (sourceCodes.length === 0) {
      return new Set();
    }

    const existing = await this.db.client
      .select({ sourceCode: questions.sourceCode })
      .from(questions)
      .where(inArray(questions.sourceCode, sourceCodes));

    return new Set(existing.map((question) => question.sourceCode).filter((sourceCode): sourceCode is string => sourceCode !== null));
  }
}

function sourceCodeOf(question: unknown): string | undefined {
  if (typeof question !== "object" || question === null) {
    return undefined;
  }
  const value = (question as { sourceCode?: unknown }).sourceCode;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function collectSourceRows(questions: unknown[]): Map<string, number[]> {
  const sourceRows = new Map<string, number[]>();
  questions.forEach((question, index) => {
    const sourceCode = sourceCodeOf(question);
    if (sourceCode !== undefined) {
      sourceRows.set(sourceCode, [...(sourceRows.get(sourceCode) ?? []), index + 1]);
    }
  });
  return sourceRows;
}

function exportOptions(options: JsonValue, correctAnswers: string[]) {
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

function invalidFilter(field: string): BadRequestException {
  return new BadRequestException({
    code: "INVALID_EXPORT_FILTER",
    message: `Invalid export filter: ${field}`
  });
}

import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type Question } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MarkdownService } from "./markdown.service";
import { normalizeQuestionInput, normalizeTags, type NormalizedQuestionInput, type QuestionOptionInput } from "./question-validator";
import {
  isValidLanguage,
  isValidLevel,
  isValidQuestionStatus,
  isValidQuestionType,
  isValidSubject
} from "../domain/validation";
import type { QuestionStatus } from "../domain/constants";

export interface QuestionListQuery {
  subject?: string;
  language?: string;
  level?: string;
  type?: string;
  status?: string;
  tags?: string | string[];
  keyword?: string;
  page?: string | number;
  pageSize?: string | number;
}

@Injectable()
export class QuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly markdown: MarkdownService
  ) {}

  async listPublic(query: QuestionListQuery) {
    const { where, page, pageSize, skip, take } = this.buildListInput(query, "published");
    const [items, total] = await Promise.all([
      this.prisma.question.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take
      }),
      this.prisma.question.count({ where })
    ]);

    return {
      items: items.map((question) => this.toListItem(question)),
      page,
      pageSize,
      total
    };
  }

  async getPublicDetail(id: string) {
    const question = await this.prisma.question.findFirst({ where: { id, status: "published" } });
    if (question === null) {
      throw new NotFoundException({ code: "QUESTION_NOT_FOUND", message: "Question was not found" });
    }

    return this.toPublicDetail(question);
  }

  async listAdmin(query: QuestionListQuery) {
    const status = isValidQuestionStatus(query.status) ? query.status : undefined;
    const { where, page, pageSize, skip, take } = this.buildListInput(query, status);
    const [items, total] = await Promise.all([
      this.prisma.question.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take
      }),
      this.prisma.question.count({ where })
    ]);

    return {
      items: items.map((question) => this.toAdminListItem(question)),
      page,
      pageSize,
      total
    };
  }

  async getAdminDetail(id: string) {
    const question = await this.prisma.question.findUnique({ where: { id } });
    if (question === null) {
      throw new NotFoundException({ code: "QUESTION_NOT_FOUND", message: "Question was not found" });
    }

    return this.toAdminDetail(question);
  }

  async createAdmin(input: unknown, createdByIp: string) {
    const normalized = normalizeQuestionInput(input);
    const question = await this.mapPrismaWriteErrors(() =>
      this.prisma.question.create({
        data: {
          ...this.toQuestionData(normalized),
          createdByIp
        }
      })
    );

    return this.toAdminDetail(question);
  }

  async updateAdmin(id: string, input: unknown) {
    const current = await this.prisma.question.findUnique({ where: { id } });
    if (current === null) {
      throw new NotFoundException({ code: "QUESTION_NOT_FOUND", message: "Question was not found" });
    }

    const patch = typeof input === "object" && input !== null ? input : {};
    const normalized = normalizeQuestionInput({ ...current, ...patch }, current.status);
    const question = await this.mapPrismaWriteErrors(() =>
      this.prisma.question.update({
        where: { id },
        data: this.toQuestionData(normalized)
      })
    );

    return this.toAdminDetail(question);
  }

  async publishAdmin(id: string) {
    const current = await this.prisma.question.findUnique({ where: { id } });
    if (current === null) {
      throw new NotFoundException({ code: "QUESTION_NOT_FOUND", message: "Question was not found" });
    }
    normalizeQuestionInput(current, "published");

    const question = await this.mapPrismaWriteErrors(() =>
      this.prisma.question.update({
        where: { id },
        data: { status: "published" }
      })
    );

    return this.toAdminDetail(question);
  }

  async archiveAdmin(id: string) {
    const current = await this.prisma.question.findUnique({ where: { id } });
    if (current === null) {
      throw new NotFoundException({ code: "QUESTION_NOT_FOUND", message: "Question was not found" });
    }

    const question = await this.mapPrismaWriteErrors(() =>
      this.prisma.question.update({
        where: { id },
        data: { status: "archived" }
      })
    );

    return this.toAdminDetail(question);
  }

  buildListInput(query: QuestionListQuery, forcedStatus?: QuestionStatus) {
    const page = clampInt(query.page, 1, 100000, 1);
    const pageSize = clampInt(query.pageSize, 1, 100, 20);
    const where: Prisma.QuestionWhereInput = {};

    if (forcedStatus !== undefined) {
      where.status = forcedStatus;
    }
    if (isValidSubject(query.subject)) {
      where.subject = query.subject;
    }
    if (isValidLanguage(query.language)) {
      where.language = query.language;
    }
    if (isValidLevel(query.level)) {
      where.level = query.level;
    }
    if (isValidQuestionType(query.type)) {
      where.type = query.type;
    }

    const tags = parseTagsQuery(query.tags);
    if (tags.length > 0) {
      where.tags = { hasEvery: tags };
    }

    const keyword = typeof query.keyword === "string" ? query.keyword.trim() : "";
    if (keyword.length > 0) {
      where.OR = [
        { stemMd: { contains: keyword, mode: "insensitive" } },
        { explanationMd: { contains: keyword, mode: "insensitive" } },
        { memo: { contains: keyword, mode: "insensitive" } },
        { sourceCode: { contains: keyword, mode: "insensitive" } }
      ];
    }

    return {
      where,
      page,
      pageSize,
      skip: (page - 1) * pageSize,
      take: pageSize
    };
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
      status: question.status
    };
  }

  private toListItem(question: QuestionRecord) {
    return {
      id: question.id,
      sourceCode: question.sourceCode,
      subject: question.subject,
      language: question.language,
      level: question.level,
      type: question.type,
      stemMd: question.stemMd,
      memo: question.memo,
      tags: question.tags,
      totalAttempts: question.totalAttempts,
      correctAttempts: question.correctAttempts,
      correctRate: correctRate(question)
    };
  }

  private toAdminListItem(question: QuestionRecord) {
    return {
      ...this.toListItem(question),
      status: question.status,
      createdAt: question.createdAt,
      updatedAt: question.updatedAt
    };
  }

  private toPublicDetail(question: QuestionRecord) {
    return {
      id: question.id,
      stemHtml: this.markdown.render(question.stemMd),
      explanationHtml: this.markdown.render(question.explanationMd),
      source: this.sourceMetadata(question),
      options: publicOptions(question.options),
      memo: question.memo,
      tags: question.tags,
      stats: {
        totalAttempts: question.totalAttempts,
        correctAttempts: question.correctAttempts,
        correctRate: correctRate(question)
      }
    };
  }

  private toAdminDetail(question: QuestionRecord) {
    return {
      id: question.id,
      sourceCode: question.sourceCode,
      subject: question.subject,
      language: question.language,
      level: question.level,
      type: question.type,
      tags: question.tags,
      stemMd: question.stemMd,
      stemHtml: this.markdown.render(question.stemMd),
      options: question.options,
      correctAnswers: question.correctAnswers,
      explanationMd: question.explanationMd,
      explanationHtml: this.markdown.render(question.explanationMd),
      memo: question.memo,
      status: question.status,
      totalAttempts: question.totalAttempts,
      correctAttempts: question.correctAttempts,
      correctRate: correctRate(question),
      createdAt: question.createdAt,
      updatedAt: question.updatedAt
    };
  }

  private sourceMetadata(question: QuestionRecord) {
    return {
      subject: question.subject,
      language: question.language,
      level: question.level,
      type: question.type,
      sourceCode: question.sourceCode
    };
  }

  private async mapPrismaWriteErrors<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isPrismaErrorCode(error, "P2002")) {
        throw new ConflictException({
          code: "QUESTION_SOURCE_CODE_CONFLICT",
          message: "Question sourceCode already exists"
        });
      }
      if (isPrismaErrorCode(error, "P2025")) {
        throw new NotFoundException({ code: "QUESTION_NOT_FOUND", message: "Question was not found" });
      }
      throw error;
    }
  }
}

type QuestionRecord = Question;

function publicOptions(options: Prisma.JsonValue): Array<{ key: string; text: string }> {
  if (!Array.isArray(options)) {
    return [];
  }
  return options
    .map((option) => {
      if (typeof option !== "object" || option === null || Array.isArray(option)) {
        return null;
      }
      const candidate = option as Partial<QuestionOptionInput>;
      if (typeof candidate.key !== "string" || typeof candidate.text !== "string") {
        return null;
      }
      return { key: candidate.key, text: candidate.text };
    })
    .filter((option): option is { key: string; text: string } => option !== null);
}

function correctRate(question: { totalAttempts: number; correctAttempts: number }): number {
  return question.totalAttempts === 0 ? 0 : Math.round((question.correctAttempts / question.totalAttempts) * 100);
}

function parseTagsQuery(tags: string | string[] | undefined): string[] {
  if (Array.isArray(tags)) {
    return normalizeTags(tags);
  }
  if (typeof tags !== "string") {
    return [];
  }
  return normalizeTags(tags.split(","));
}

function clampInt(value: string | number | undefined, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === code;
}

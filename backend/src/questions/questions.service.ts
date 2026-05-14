import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, arrayContains, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { DbService } from "../db/db.service";
import { isUniqueViolation } from "../db/query-helpers";
import { questions, type QuestionRecord } from "../db/schema";
import type { InputJsonValue, JsonValue } from "../db/json";
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
    @Inject(DbService)
    private readonly db: DbService,
    @Inject(MarkdownService)
    private readonly markdown: MarkdownService
  ) {}

  async listPublic(query: QuestionListQuery) {
    const { where, page, pageSize, skip, take } = this.buildListInput(query, "published");
    const [items, total] = await Promise.all([
      this.db.client.select().from(questions).where(where).orderBy(desc(questions.updatedAt)).offset(skip).limit(take),
      this.countQuestions(where)
    ]);

    return {
      items: items.map((question) => this.toListItem(question)),
      page,
      pageSize,
      total
    };
  }

  async getPublicDetail(id: string) {
    const question = await this.findQuestion(and(eq(questions.id, id), eq(questions.status, "published")));
    if (question === null) {
      throw new NotFoundException({ code: "QUESTION_NOT_FOUND", message: "Question was not found" });
    }

    return this.toPublicDetail(question);
  }

  async getReciteDetail(id: string) {
    const question = await this.findQuestion(and(eq(questions.id, id), eq(questions.status, "published")));
    if (question === null) {
      throw new NotFoundException({ code: "QUESTION_NOT_FOUND", message: "Question was not found" });
    }

    return this.toReciteDetail(question);
  }

  async listAdmin(query: QuestionListQuery) {
    const status = isValidQuestionStatus(query.status) ? query.status : undefined;
    const { where, page, pageSize, skip, take } = this.buildListInput(query, status);
    const [items, total] = await Promise.all([
      this.db.client.select().from(questions).where(where).orderBy(desc(questions.updatedAt)).offset(skip).limit(take),
      this.countQuestions(where)
    ]);

    return {
      items: items.map((question) => this.toAdminListItem(question)),
      page,
      pageSize,
      total
    };
  }

  async getAdminDetail(id: string) {
    const question = await this.findQuestion(eq(questions.id, id));
    if (question === null) {
      throw new NotFoundException({ code: "QUESTION_NOT_FOUND", message: "Question was not found" });
    }

    return this.toAdminDetail(question);
  }

  async createAdmin(input: unknown, createdByIp: string) {
    const normalized = normalizeQuestionInput(input);
    const question = await this.mapDbWriteErrors(async () =>
      firstQuestion(
        await this.db.client
          .insert(questions)
          .values({
            ...this.toQuestionData(normalized),
            createdByIp,
            updatedAt: new Date()
          })
          .returning()
      )
    );

    return this.toAdminDetail(question);
  }

  async updateAdmin(id: string, input: unknown) {
    const current = await this.findQuestion(eq(questions.id, id));
    if (current === null) {
      throw new NotFoundException({ code: "QUESTION_NOT_FOUND", message: "Question was not found" });
    }

    const patch = typeof input === "object" && input !== null ? input : {};
    const normalized = normalizeQuestionInput({ ...current, ...patch }, current.status);
    const question = await this.mapDbWriteErrors(async () =>
      firstQuestion(
        await this.db.client
          .update(questions)
          .set({ ...this.toQuestionData(normalized), updatedAt: new Date() })
          .where(eq(questions.id, id))
          .returning()
      )
    );

    return this.toAdminDetail(question);
  }

  async publishAdmin(id: string) {
    const current = await this.findQuestion(eq(questions.id, id));
    if (current === null) {
      throw new NotFoundException({ code: "QUESTION_NOT_FOUND", message: "Question was not found" });
    }
    normalizeQuestionInput(current, "published");

    const question = await this.mapDbWriteErrors(async () =>
      firstQuestion(
        await this.db.client
          .update(questions)
          .set({ status: "published", updatedAt: new Date() })
          .where(eq(questions.id, id))
          .returning()
      )
    );

    return this.toAdminDetail(question);
  }

  async archiveAdmin(id: string) {
    const current = await this.findQuestion(eq(questions.id, id));
    if (current === null) {
      throw new NotFoundException({ code: "QUESTION_NOT_FOUND", message: "Question was not found" });
    }

    const question = await this.mapDbWriteErrors(async () =>
      firstQuestion(
        await this.db.client
          .update(questions)
          .set({ status: "archived", updatedAt: new Date() })
          .where(eq(questions.id, id))
          .returning()
      )
    );

    return this.toAdminDetail(question);
  }

  buildListInput(query: QuestionListQuery, forcedStatus?: QuestionStatus) {
    const page = clampInt(query.page, 1, 100000, 1);
    const pageSize = clampInt(query.pageSize, 1, 100, 20);
    const filters: SQL[] = [];

    if (forcedStatus !== undefined) {
      filters.push(eq(questions.status, forcedStatus));
    }
    if (isValidSubject(query.subject)) {
      filters.push(eq(questions.subject, query.subject));
    }
    if (isValidLanguage(query.language)) {
      filters.push(eq(questions.language, query.language));
    }
    if (isValidLevel(query.level)) {
      filters.push(eq(questions.level, query.level));
    }
    if (isValidQuestionType(query.type)) {
      filters.push(eq(questions.type, query.type));
    }

    const tags = parseTagsQuery(query.tags);
    if (tags.length > 0) {
      filters.push(arrayContains(questions.tags, tags));
    }

    const keyword = typeof query.keyword === "string" ? query.keyword.trim() : "";
    if (keyword.length > 0) {
      const pattern = `%${keyword}%`;
      filters.push(
        or(
          ilike(questions.stemMd, pattern),
          ilike(questions.explanationMd, pattern),
          ilike(questions.memo, pattern),
          ilike(questions.sourceCode, pattern),
          arrayContains(questions.tags, [keyword])
        )!
      );
    }

    return {
      where: filters.length > 0 ? and(...filters) : undefined,
      page,
      pageSize,
      skip: (page - 1) * pageSize,
      take: pageSize
    };
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
      status: question.status
    };
  }

  private async findQuestion(where: SQL | undefined): Promise<QuestionRecord | null> {
    const rows = await this.db.client.select().from(questions).where(where).limit(1);
    return rows[0] ?? null;
  }

  private async countQuestions(where: SQL | undefined): Promise<number> {
    const rows = await this.db.client.select({ value: count() }).from(questions).where(where);
    return rows[0]?.value ?? 0;
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

  private toReciteDetail(question: QuestionRecord) {
    return {
      ...this.toPublicDetail(question),
      correctAnswers: question.correctAnswers
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

  private async mapDbWriteErrors<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          code: "QUESTION_SOURCE_CODE_CONFLICT",
          message: "Question sourceCode already exists"
        });
      }
      throw error;
    }
  }
}

function firstQuestion(rows: QuestionRecord[]): QuestionRecord {
  const question = rows[0];
  if (question === undefined) {
    throw new NotFoundException({ code: "QUESTION_NOT_FOUND", message: "Question was not found" });
  }
  return question;
}

function publicOptions(options: JsonValue): Array<{ key: string; text: string }> {
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

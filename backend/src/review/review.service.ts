import { BadRequestException, Inject, Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";
import { DbService } from "../db/db.service";
import { bookmarks, examAttempts, mistakes, questions, visitors, type ExamAttemptRecord as SchemaExamAttemptRecord } from "../db/schema";
import type { RequestIdentity } from "../identity/identity.service";
import { toMasteryStatus } from "../practice/practice.service";

const QUESTION_SUMMARY_SELECT = {
  id: questions.id,
  sourceCode: questions.sourceCode,
  subject: questions.subject,
  language: questions.language,
  level: questions.level,
  type: questions.type,
  stemMd: questions.stemMd,
  memo: questions.memo,
  tags: questions.tags,
  status: questions.status,
  totalAttempts: questions.totalAttempts,
  correctAttempts: questions.correctAttempts
} as const;

@Injectable()
export class ReviewService {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  async listMistakes(identity: RequestIdentity) {
    const visitor = await this.findVisitor(identity);
    if (visitor === null) {
      return { items: [] };
    }

    const mistakeRows = await this.db.client
      .select({
        id: mistakes.id,
        questionId: mistakes.questionId,
        wrongCount: mistakes.wrongCount,
        consecutiveCorrectCount: mistakes.consecutiveCorrectCount,
        isMastered: mistakes.isMastered,
        lastWrongAt: mistakes.lastWrongAt,
        masteredAt: mistakes.masteredAt,
        question: QUESTION_SUMMARY_SELECT
      })
      .from(mistakes)
      .innerJoin(questions, eq(mistakes.questionId, questions.id))
      .where(eq(mistakes.visitorId, visitor.id))
      .orderBy(asc(mistakes.isMastered), desc(mistakes.lastWrongAt), desc(mistakes.updatedAt));

    return {
      items: mistakeRows.map((mistake) => ({
        id: mistake.id,
        questionId: mistake.questionId,
        wrongCount: mistake.wrongCount,
        consecutiveCorrectCount: mistake.consecutiveCorrectCount,
        isMastered: mistake.isMastered,
        lastWrongAt: mistake.lastWrongAt,
        masteredAt: mistake.masteredAt,
        masteryStatus: toMasteryStatus(mistake),
        question: toQuestionSummary(mistake.question)
      }))
    };
  }

  async listBookmarks(identity: RequestIdentity) {
    const visitor = await this.findVisitor(identity);
    if (visitor === null) {
      return { items: [] };
    }

    const bookmarkRows = await this.db.client
      .select({
        id: bookmarks.id,
        questionId: bookmarks.questionId,
        note: bookmarks.note,
        tags: bookmarks.tags,
        createdAt: bookmarks.createdAt,
        question: QUESTION_SUMMARY_SELECT
      })
      .from(bookmarks)
      .innerJoin(questions, eq(bookmarks.questionId, questions.id))
      .where(eq(bookmarks.visitorId, visitor.id))
      .orderBy(desc(bookmarks.createdAt));

    return {
      items: bookmarkRows.map((bookmark) => ({
        id: bookmark.id,
        questionId: bookmark.questionId,
        note: bookmark.note,
        tags: bookmark.tags,
        createdAt: bookmark.createdAt,
        question: toQuestionSummary(bookmark.question)
      }))
    };
  }

  async listRecords(identity: RequestIdentity) {
    const visitor = await this.findVisitor(identity);
    if (visitor === null) {
      return { items: [] };
    }

    const examRows = await this.db.client
      .select({
        id: examAttempts.id,
        subject: examAttempts.subject,
        language: examAttempts.language,
        level: examAttempts.level,
        status: examAttempts.status,
        scorePercent: examAttempts.scorePercent,
        isPassed: examAttempts.isPassed,
        startedAt: examAttempts.startedAt,
        deadlineAt: examAttempts.deadlineAt,
        submittedAt: examAttempts.submittedAt
      })
      .from(examAttempts)
      .where(eq(examAttempts.visitorId, visitor.id))
      .orderBy(desc(examAttempts.submittedAt), desc(examAttempts.startedAt))
      .limit(100);

    return {
      items: examRows.map(toExamRecord).sort((left, right) => recordTime(right) - recordTime(left))
    };
  }

  async updateMistakeMastery(id: string, input: unknown, identity: RequestIdentity) {
    const isMastered = normalizeMistakeUpdateInput(input);
    const visitor = await this.requireVisitor(identity);
    const [existing] = await this.db.client
      .select({
        id: mistakes.id,
        questionId: mistakes.questionId,
        wrongCount: mistakes.wrongCount,
        consecutiveCorrectCount: mistakes.consecutiveCorrectCount,
        isMastered: mistakes.isMastered,
        lastWrongAt: mistakes.lastWrongAt,
        masteredAt: mistakes.masteredAt,
        question: QUESTION_SUMMARY_SELECT
      })
      .from(mistakes)
      .innerJoin(questions, eq(mistakes.questionId, questions.id))
      .where(and(eq(mistakes.id, id), eq(mistakes.visitorId, visitor.id)))
      .limit(1);

    if (existing === undefined) {
      throw new NotFoundException({ code: "MISTAKE_NOT_FOUND", message: "Mistake was not found" });
    }

    const [updated] = await this.db.client
      .update(mistakes)
      .set(
        isMastered
          ? {
            isMastered: true,
            masteredAt: new Date(),
            consecutiveCorrectCount: Math.max(existing.consecutiveCorrectCount, 3),
            updatedAt: new Date()
          }
          : { isMastered: false, masteredAt: null, consecutiveCorrectCount: 0, updatedAt: new Date() }
      )
      .where(eq(mistakes.id, id))
      .returning({
        id: mistakes.id,
        questionId: mistakes.questionId,
        wrongCount: mistakes.wrongCount,
        consecutiveCorrectCount: mistakes.consecutiveCorrectCount,
        isMastered: mistakes.isMastered,
        lastWrongAt: mistakes.lastWrongAt,
        masteredAt: mistakes.masteredAt
      });

    return toMistakeItem({ ...requireUpdatedMistake(updated), question: existing.question });
  }

  async removeMistake(id: string, identity: RequestIdentity) {
    const visitor = await this.requireVisitor(identity);
    const deleted = await this.db.client
      .delete(mistakes)
      .where(and(eq(mistakes.id, id), eq(mistakes.visitorId, visitor.id)))
      .returning({ id: mistakes.id });
    return { deleted: deleted.length > 0 };
  }

  private findVisitor(identity: RequestIdentity): Promise<{ id: string } | null> {
    return this.db.client
      .select({ id: visitors.id })
      .from(visitors)
      .where(eq(visitors.ip, identity.ip))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  private async requireVisitor(identity: RequestIdentity): Promise<{ id: string }> {
    const visitor = await this.findVisitor(identity);
    if (visitor === null) {
      throw new InternalServerErrorException({ code: "VISITOR_NOT_FOUND", message: "Request visitor was not found" });
    }
    return visitor;
  }
}

type QuestionSummaryRecord = {
  id: string;
  sourceCode: string | null;
  subject: string;
  language: string | null;
  level: string;
  type: string;
  stemMd: string;
  memo: string | null;
  tags: string[];
  status: string;
  totalAttempts: number;
  correctAttempts: number;
};

type MistakeRecord = {
  id: string;
  questionId: string;
  wrongCount: number;
  consecutiveCorrectCount: number;
  isMastered: boolean;
  lastWrongAt: Date | null;
  masteredAt: Date | null;
  question: QuestionSummaryRecord;
};

type ExamAttemptRecord = Pick<
  SchemaExamAttemptRecord,
  "id" | "subject" | "language" | "level" | "status" | "scorePercent" | "isPassed" | "startedAt" | "deadlineAt" | "submittedAt"
>;

function toMistakeItem(mistake: MistakeRecord) {
  return {
    id: mistake.id,
    questionId: mistake.questionId,
    wrongCount: mistake.wrongCount,
    consecutiveCorrectCount: mistake.consecutiveCorrectCount,
    isMastered: mistake.isMastered,
    lastWrongAt: mistake.lastWrongAt,
    masteredAt: mistake.masteredAt,
    masteryStatus: toMasteryStatus(mistake),
    question: toQuestionSummary(mistake.question)
  };
}

function toExamRecord(attempt: ExamAttemptRecord) {
  return {
    kind: "exam" as const,
    id: attempt.id,
    subject: attempt.subject,
    language: attempt.language,
    level: attempt.level,
    status: attempt.status,
    scorePercent: decimalToNumber(attempt.scorePercent),
    isPassed: attempt.isPassed,
    startedAt: attempt.startedAt,
    deadlineAt: attempt.deadlineAt,
    submittedAt: attempt.submittedAt
  };
}

function recordTime(record: { submittedAt: Date | null; startedAt: Date }): number {
  return (record.submittedAt ?? record.startedAt).getTime();
}

function toQuestionSummary(question: QuestionSummaryRecord) {
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
    status: question.status,
    stats: {
      totalAttempts: question.totalAttempts,
      correctAttempts: question.correctAttempts,
      correctRate: correctRate(question)
    }
  };
}

function correctRate(question: { totalAttempts: number; correctAttempts: number }): number {
  return question.totalAttempts === 0 ? 0 : Math.round((question.correctAttempts / question.totalAttempts) * 100);
}

function decimalToNumber(value: ExamAttemptRecord["scorePercent"]): number | null {
  return value === null ? null : Number(value);
}

function normalizeMistakeUpdateInput(input: unknown): boolean {
  if (!isRecord(input) || typeof input.isMastered !== "boolean") {
    throw new BadRequestException({ code: "INVALID_MISTAKE_UPDATE", message: "isMastered must be a boolean" });
  }
  return input.isMastered;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireUpdatedMistake<T>(mistake: T | undefined): T {
  if (mistake === undefined) {
    throw new NotFoundException({ code: "MISTAKE_NOT_FOUND", message: "Mistake was not found" });
  }
  return mistake;
}

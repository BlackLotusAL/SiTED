import { BadRequestException, Inject, Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import type { ExamAttempt } from "@prisma/client";
import type { RequestIdentity } from "../identity/identity.service";
import { PrismaService } from "../prisma/prisma.service";
import { toMasteryStatus } from "../practice/practice.service";

const QUESTION_SUMMARY_SELECT = {
  id: true,
  sourceCode: true,
  subject: true,
  language: true,
  level: true,
  type: true,
  stemMd: true,
  memo: true,
  tags: true,
  status: true,
  totalAttempts: true,
  correctAttempts: true
} as const;

@Injectable()
export class ReviewService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listMistakes(identity: RequestIdentity) {
    const visitor = await this.findVisitor(identity);
    if (visitor === null) {
      return { items: [] };
    }

    const mistakes = await this.prisma.mistake.findMany({
      where: { visitorId: visitor.id },
      select: {
        id: true,
        questionId: true,
        wrongCount: true,
        consecutiveCorrectCount: true,
        isMastered: true,
        lastWrongAt: true,
        masteredAt: true,
        question: { select: QUESTION_SUMMARY_SELECT }
      },
      orderBy: [{ isMastered: "asc" }, { lastWrongAt: "desc" }, { updatedAt: "desc" }]
    });

    return {
      items: mistakes.map((mistake) => ({
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

    const bookmarks = await this.prisma.bookmark.findMany({
      where: { visitorId: visitor.id },
      select: {
        id: true,
        questionId: true,
        note: true,
        tags: true,
        createdAt: true,
        question: { select: QUESTION_SUMMARY_SELECT }
      },
      orderBy: { createdAt: "desc" }
    });

    return {
      items: bookmarks.map((bookmark) => ({
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

    const examAttempts = await this.prisma.examAttempt.findMany({
      where: { visitorId: visitor.id },
      select: {
        id: true,
        subject: true,
        language: true,
        level: true,
        status: true,
        scorePercent: true,
        isPassed: true,
        startedAt: true,
        deadlineAt: true,
        submittedAt: true
      },
      orderBy: [{ submittedAt: "desc" }, { startedAt: "desc" }],
      take: 100
    });

    return {
      items: examAttempts.map(toExamRecord).sort((left, right) => recordTime(right) - recordTime(left))
    };
  }

  async updateMistakeMastery(id: string, input: unknown, identity: RequestIdentity) {
    const isMastered = normalizeMistakeUpdateInput(input);
    const visitor = await this.requireVisitor(identity);
    const existing = await this.prisma.mistake.findFirst({
      where: { id, visitorId: visitor.id },
      select: {
        id: true,
        questionId: true,
        wrongCount: true,
        consecutiveCorrectCount: true,
        isMastered: true,
        lastWrongAt: true,
        masteredAt: true,
        question: { select: QUESTION_SUMMARY_SELECT }
      }
    });

    if (existing === null) {
      throw new NotFoundException({ code: "MISTAKE_NOT_FOUND", message: "Mistake was not found" });
    }

    const updated = await this.prisma.mistake.update({
      where: { id },
      data: isMastered
        ? {
            isMastered: true,
            masteredAt: new Date(),
            consecutiveCorrectCount: Math.max(existing.consecutiveCorrectCount, 3)
          }
        : { isMastered: false, masteredAt: null, consecutiveCorrectCount: 0 },
      select: {
        id: true,
        questionId: true,
        wrongCount: true,
        consecutiveCorrectCount: true,
        isMastered: true,
        lastWrongAt: true,
        masteredAt: true,
        question: { select: QUESTION_SUMMARY_SELECT }
      }
    });

    return toMistakeItem(updated);
  }

  async removeMistake(id: string, identity: RequestIdentity) {
    const visitor = await this.requireVisitor(identity);
    const result = await this.prisma.mistake.deleteMany({ where: { id, visitorId: visitor.id } });
    return { deleted: result.count > 0 };
  }

  private findVisitor(identity: RequestIdentity): Promise<{ id: string } | null> {
    return this.prisma.visitor.findUnique({ where: { ip: identity.ip }, select: { id: true } });
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
  ExamAttempt,
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

function decimalToNumber(value: ExamAttempt["scorePercent"]): number | null {
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

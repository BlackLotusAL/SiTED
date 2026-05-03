import { Injectable } from "@nestjs/common";
import type { ExamAttempt, PracticeAttempt, Question } from "@prisma/client";
import type { RequestIdentity } from "../identity/identity.service";
import { PrismaService } from "../prisma/prisma.service";
import { toMasteryStatus } from "../practice/practice.service";

@Injectable()
export class ReviewService {
  constructor(private readonly prisma: PrismaService) {}

  async listMistakes(identity: RequestIdentity) {
    const visitor = await this.findVisitor(identity);
    if (visitor === null) {
      return { items: [] };
    }

    const mistakes = await this.prisma.mistake.findMany({
      where: { visitorId: visitor.id },
      include: { question: true },
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
      include: { question: true },
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
      return { practice: { items: [] }, exams: { items: [] } };
    }

    const [practiceAttempts, examAttempts] = await Promise.all([
      this.prisma.practiceAttempt.findMany({
        where: { visitorId: visitor.id },
        include: { question: true },
        orderBy: { createdAt: "desc" },
        take: 100
      }),
      this.prisma.examAttempt.findMany({
        where: { visitorId: visitor.id },
        orderBy: { startedAt: "desc" },
        take: 100
      })
    ]);

    return {
      practice: {
        items: practiceAttempts.map(toPracticeRecord)
      },
      exams: {
        items: examAttempts.map(toExamRecord)
      }
    };
  }

  private findVisitor(identity: RequestIdentity): Promise<{ id: string } | null> {
    return this.prisma.visitor.findUnique({ where: { ip: identity.ip }, select: { id: true } });
  }
}

type PracticeAttemptWithQuestion = PracticeAttempt & { question: Question };

function toPracticeRecord(attempt: PracticeAttemptWithQuestion) {
  return {
    kind: "practice" as const,
    id: attempt.id,
    questionId: attempt.questionId,
    selectedKeys: attempt.selectedKeys,
    isCorrect: attempt.isCorrect,
    mode: attempt.mode,
    durationSec: attempt.durationSec,
    createdAt: attempt.createdAt,
    question: toQuestionSummary(attempt.question)
  };
}

function toExamRecord(attempt: ExamAttempt) {
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

function toQuestionSummary(question: Question) {
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

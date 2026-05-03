import { Inject, Injectable } from "@nestjs/common";
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
      return { practice: { items: [] }, exams: { items: [] } };
    }

    const [practiceAttempts, examAttempts] = await Promise.all([
      this.prisma.practiceAttempt.findMany({
        where: { visitorId: visitor.id },
        select: {
          id: true,
          questionId: true,
          selectedKeys: true,
          isCorrect: true,
          mode: true,
          durationSec: true,
          createdAt: true,
          question: { select: QUESTION_SUMMARY_SELECT }
        },
        orderBy: { createdAt: "desc" },
        take: 100
      }),
      this.prisma.examAttempt.findMany({
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

type PracticeAttemptRecord = {
  id: string;
  questionId: string;
  selectedKeys: string[];
  isCorrect: boolean;
  mode: string;
  durationSec: number | null;
  createdAt: Date;
  question: QuestionSummaryRecord;
};

type ExamAttemptRecord = Pick<
  ExamAttempt,
  "id" | "subject" | "language" | "level" | "status" | "scorePercent" | "isPassed" | "startedAt" | "deadlineAt" | "submittedAt"
>;

function toPracticeRecord(attempt: PracticeAttemptRecord) {
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

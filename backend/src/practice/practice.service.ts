import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { Prisma, type Mistake } from "@prisma/client";
import { isCorrectAnswer } from "../domain/validation";
import type { RequestIdentity } from "../identity/identity.service";
import { PrismaService } from "../prisma/prisma.service";

export interface PracticeSubmitInput {
  questionId?: unknown;
  submittedAnswers?: unknown;
  selectedKeys?: unknown;
  durationSec?: unknown;
}

export interface MasteryStatus {
  code: "unmastered" | `consecutive_correct_${number}` | "mastered";
  label: string;
  color: "danger" | "warning" | "success";
}

@Injectable()
export class PracticeService {
  constructor(private readonly prisma: PrismaService) {}

  async submit(input: PracticeSubmitInput, identity: RequestIdentity) {
    const normalized = normalizeSubmitInput(input);

    return this.prisma.$transaction(async (tx) => {
      const visitor = await tx.visitor.findUnique({ where: { ip: identity.ip }, select: { id: true } });
      if (visitor === null) {
        throw new InternalServerErrorException({ code: "VISITOR_NOT_FOUND", message: "Request visitor was not found" });
      }

      const question = await tx.question.findFirst({ where: { id: normalized.questionId, status: "published" } });
      if (question === null) {
        throw new NotFoundException({ code: "QUESTION_NOT_FOUND", message: "Question was not found" });
      }

      const isCorrect = isCorrectAnswer({
        type: question.type,
        correctAnswers: question.correctAnswers,
        submittedAnswers: normalized.submittedAnswers
      });

      const attempt = await tx.practiceAttempt.create({
        data: {
          visitorId: visitor.id,
          questionId: question.id,
          selectedKeys: normalized.submittedAnswers,
          isCorrect,
          mode: "practice",
          durationSec: normalized.durationSec
        }
      });

      await tx.question.update({
        where: { id: question.id },
        data: {
          totalAttempts: { increment: 1 },
          correctAttempts: { increment: isCorrect ? 1 : 0 }
        }
      });

      const mistake = isCorrect
        ? await this.recordCorrectAnswer(tx, visitor.id, question.id)
        : await this.recordWrongAnswer(tx, visitor.id, question.id);

      return {
        attemptId: attempt.id,
        questionId: question.id,
        submittedAnswers: normalized.submittedAnswers,
        correctAnswers: question.correctAnswers,
        isCorrect,
        explanationMd: question.explanationMd,
        memo: question.memo,
        masteryStatus: mistake === null ? null : toMasteryStatus(mistake)
      };
    });
  }

  private async recordWrongAnswer(tx: TransactionLike, visitorId: string, questionId: string): Promise<Mistake> {
    const now = new Date();
    return tx.mistake.upsert({
      where: { visitorId_questionId: { visitorId, questionId } },
      create: {
        visitorId,
        questionId,
        wrongCount: 1,
        consecutiveCorrectCount: 0,
        isMastered: false,
        lastWrongAt: now,
        masteredAt: null
      },
      update: {
        wrongCount: { increment: 1 },
        consecutiveCorrectCount: 0,
        isMastered: false,
        lastWrongAt: now,
        masteredAt: null
      }
    });
  }

  private async recordCorrectAnswer(tx: TransactionLike, visitorId: string, questionId: string): Promise<Mistake | null> {
    const mistake = await tx.mistake.findUnique({ where: { visitorId_questionId: { visitorId, questionId } } });
    if (mistake === null) {
      return null;
    }
    if (mistake.isMastered) {
      return mistake;
    }

    const consecutiveCorrectCount = mistake.consecutiveCorrectCount + 1;
    const isMastered = consecutiveCorrectCount >= 3;

    return tx.mistake.update({
      where: { id: mistake.id },
      data: {
        consecutiveCorrectCount,
        isMastered,
        masteredAt: isMastered ? new Date() : null
      }
    });
  }
}

type TransactionLike = Prisma.TransactionClient;

function normalizeSubmitInput(input: PracticeSubmitInput) {
  if (typeof input.questionId !== "string" || input.questionId.trim().length === 0) {
    throw new BadRequestException({ code: "INVALID_PRACTICE_SUBMISSION", message: "questionId is required" });
  }

  const submittedAnswers = input.submittedAnswers ?? input.selectedKeys;
  if (!Array.isArray(submittedAnswers) || !submittedAnswers.every((answer) => typeof answer === "string")) {
    throw new BadRequestException({
      code: "INVALID_PRACTICE_SUBMISSION",
      message: "submittedAnswers must be an array of strings"
    });
  }

  const durationSec = normalizeDurationSec(input.durationSec);

  return {
    questionId: input.questionId.trim(),
    submittedAnswers: submittedAnswers.map((answer) => answer.trim()).filter((answer) => answer.length > 0),
    durationSec
  };
}

function normalizeDurationSec(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new BadRequestException({ code: "INVALID_PRACTICE_SUBMISSION", message: "durationSec must be a non-negative integer" });
  }

  return parsed;
}

export function toMasteryStatus(mistake: Pick<Mistake, "isMastered" | "consecutiveCorrectCount">): MasteryStatus {
  if (mistake.isMastered) {
    return { code: "mastered", label: "已掌握", color: "success" };
  }
  if (mistake.consecutiveCorrectCount > 0) {
    return {
      code: `consecutive_correct_${mistake.consecutiveCorrectCount}`,
      label: `连续答对 ${mistake.consecutiveCorrectCount} 次`,
      color: "warning"
    };
  }
  return { code: "unmastered", label: "未掌握", color: "danger" };
}

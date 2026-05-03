import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { Prisma, type Mistake } from "@prisma/client";
import { isCorrectAnswer, isValidQuestionAnswerDefinition } from "../domain/validation";
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

type TransactionLike = Prisma.TransactionClient;

type NormalizedPracticeSubmitInput = {
  questionId: string;
  submittedAnswers: string[];
  durationSec?: number;
};

type ScoreableQuestion = {
  type: unknown;
  options: unknown;
  correctAnswers: unknown;
};

type QuestionOption = {
  key: string;
  text: string;
};

const MAX_DURATION_SEC = 2147483647;

@Injectable()
export class PracticeService {
  constructor(private readonly prisma: PrismaService) {}

  async submit(input: unknown, identity: RequestIdentity) {
    const normalized = normalizeSubmitInput(input);
    return this.withSerializableRetry((tx) => this.submitInTransaction(tx, normalized, identity));
  }

  private async submitInTransaction(tx: TransactionLike, normalized: NormalizedPracticeSubmitInput, identity: RequestIdentity) {
    const visitor = await tx.visitor.findUnique({ where: { ip: identity.ip }, select: { id: true } });
    if (visitor === null) {
      throw new InternalServerErrorException({ code: "VISITOR_NOT_FOUND", message: "Request visitor was not found" });
    }

    const question = await tx.question.findFirst({ where: { id: normalized.questionId, status: "published" } });
    if (question === null) {
      throw new NotFoundException({ code: "QUESTION_NOT_FOUND", message: "Question was not found" });
    }

    const optionKeys = assertQuestionCanBeScored(question);
    assertSubmittedAnswersExist(normalized.submittedAnswers, optionKeys);

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
  }

  private async withSerializableRetry<T>(operation: (tx: TransactionLike) => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction((tx) => operation(tx), {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable
        });
      } catch (error) {
        if (!isSerializableConflict(error)) {
          throw error;
        }
        lastError = error;
      }
    }

    throw lastError;
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
    const incremented = await tx.mistake.updateMany({
      where: { visitorId, questionId, isMastered: false },
      data: { consecutiveCorrectCount: { increment: 1 } }
    });

    if (incremented.count > 0) {
      await tx.mistake.updateMany({
        where: { visitorId, questionId, isMastered: false, consecutiveCorrectCount: { gte: 3 } },
        data: { isMastered: true, masteredAt: new Date() }
      });
    }

    return tx.mistake.findUnique({ where: { visitorId_questionId: { visitorId, questionId } } });
  }
}

function normalizeSubmitInput(input: unknown): NormalizedPracticeSubmitInput {
  if (!isRecord(input)) {
    throw invalidSubmission("body must be an object");
  }
  if (typeof input.questionId !== "string" || input.questionId.trim().length === 0) {
    throw invalidSubmission("questionId is required");
  }

  const questionId = input.questionId.trim();
  if (!isUuid(questionId)) {
    throw invalidSubmission("questionId must be a UUID");
  }

  const submittedAnswers = input.submittedAnswers ?? input.selectedKeys;
  if (!Array.isArray(submittedAnswers) || !submittedAnswers.every((answer) => typeof answer === "string")) {
    throw invalidSubmission("submittedAnswers must be an array of strings");
  }

  const normalizedAnswers = submittedAnswers.map((answer) => answer.trim());
  if (normalizedAnswers.length === 0 || normalizedAnswers.some((answer) => answer.length === 0)) {
    throw invalidSubmission("submittedAnswers cannot be empty");
  }
  if (!hasUniqueValues(normalizedAnswers)) {
    throw invalidSubmission("submittedAnswers cannot contain duplicates");
  }
  if (!normalizedAnswers.every(isOptionKey)) {
    throw invalidSubmission("submittedAnswers contain invalid option keys");
  }

  return {
    questionId,
    submittedAnswers: normalizedAnswers,
    durationSec: normalizeDurationSec(input.durationSec)
  };
}

function normalizeDurationSec(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "number") {
    return assertDurationSec(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return assertDurationSec(Number(value));
  }

  throw invalidSubmission("durationSec must be a non-negative integer");
}

function assertDurationSec(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_DURATION_SEC) {
    throw invalidSubmission("durationSec must be a non-negative integer within database range");
  }
  return value;
}

function assertQuestionCanBeScored(question: ScoreableQuestion): Set<string> {
  if (
    !isValidQuestionAnswerDefinition({
      type: question.type,
      options: question.options,
      correctAnswers: question.correctAnswers
    })
  ) {
    throw new InternalServerErrorException({
      code: "QUESTION_DEFINITION_INVALID",
      message: "Question answer definition is invalid"
    });
  }

  return new Set((question.options as QuestionOption[]).map((option) => option.key));
}

function assertSubmittedAnswersExist(submittedAnswers: string[], optionKeys: Set<string>): void {
  if (!submittedAnswers.every((answer) => optionKeys.has(answer))) {
    throw invalidSubmission("submittedAnswers contain unknown option keys");
  }
}

function invalidSubmission(message: string): BadRequestException {
  return new BadRequestException({ code: "INVALID_PRACTICE_SUBMISSION", message });
}

function isSerializableConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2034";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isOptionKey(value: string): boolean {
  return /^[A-Z]$/.test(value);
}

function hasUniqueValues(values: string[]): boolean {
  return new Set(values).size === values.length;
}

export function toMasteryStatus(mistake: Pick<Mistake, "isMastered" | "consecutiveCorrectCount">): MasteryStatus {
  if (mistake.isMastered) {
    return { code: "mastered", label: "\u5df2\u638c\u63e1", color: "success" };
  }
  if (mistake.consecutiveCorrectCount > 0) {
    return {
      code: `consecutive_correct_${mistake.consecutiveCorrectCount}`,
      label: `\u8fde\u7eed\u7b54\u5bf9 ${mistake.consecutiveCorrectCount} \u6b21`,
      color: "warning"
    };
  }
  return { code: "unmastered", label: "\u672a\u638c\u63e1", color: "danger" };
}

import { BadRequestException, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { RequestIdentity } from "../identity/identity.service";
import { PracticeService } from "./practice.service";

describe("PracticeService", () => {
  it("records a correct multiple-choice attempt without depending on submitted answer order", async () => {
    const tx = transactionMock({
      question: questionRecord({
        type: "multiple",
        options: [
          { key: "A", text: "Option A" },
          { key: "B", text: "Option B" },
          { key: "C", text: "Option C" }
        ],
        correctAnswers: ["A", "C"]
      }),
      mistake: null
    });
    const service = new PracticeService(prismaMock(tx) as never);

    const result = await service.submit(
      { questionId: questionId(), submittedAnswers: ["C", "A"], durationSec: 12 },
      identity()
    );

    expect(tx.question.findFirst).toHaveBeenCalledWith({ where: { id: questionId(), status: "published" } });
    expect(tx.practiceAttempt.create).toHaveBeenCalledWith({
      data: {
        visitorId: "v1",
        questionId: questionId(),
        selectedKeys: ["C", "A"],
        isCorrect: true,
        mode: "practice",
        durationSec: 12
      }
    });
    expect(tx.question.update).toHaveBeenCalledWith({
      where: { id: questionId() },
      data: {
        totalAttempts: { increment: 1 },
        correctAttempts: { increment: 1 }
      }
    });
    expect(tx.mistake.updateMany).toHaveBeenCalledWith({
      where: { visitorId: "v1", questionId: questionId(), isMastered: false },
      data: { consecutiveCorrectCount: { increment: 1 } }
    });
    expect(tx.mistake.upsert).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      attemptId: "attempt1",
      questionId: questionId(),
      submittedAnswers: ["C", "A"],
      correctAnswers: ["A", "C"],
      isCorrect: true,
      masteryStatus: null
    });
  });

  it("creates or updates a mistake when the submitted answer is wrong", async () => {
    const tx = transactionMock({
      question: questionRecord({ correctAnswers: ["B"] }),
      mistake: null
    });
    const service = new PracticeService(prismaMock(tx) as never);

    const result = await service.submit({ questionId: questionId(), submittedAnswers: ["A"] }, identity());

    expect(tx.practiceAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isCorrect: false, selectedKeys: ["A"] })
      })
    );
    expect(tx.question.update).toHaveBeenCalledWith({
      where: { id: questionId() },
      data: {
        totalAttempts: { increment: 1 },
        correctAttempts: { increment: 0 }
      }
    });
    expect(tx.mistake.upsert).toHaveBeenCalledWith({
      where: { visitorId_questionId: { visitorId: "v1", questionId: questionId() } },
      create: expect.objectContaining({
        visitorId: "v1",
        questionId: questionId(),
        wrongCount: 1,
        consecutiveCorrectCount: 0,
        isMastered: false,
        masteredAt: null
      }),
      update: expect.objectContaining({
        wrongCount: { increment: 1 },
        consecutiveCorrectCount: 0,
        isMastered: false,
        masteredAt: null
      })
    });
    expect(result).toMatchObject({
      isCorrect: false,
      masteryStatus: { code: "unmastered", label: "\u672a\u638c\u63e1", color: "danger" }
    });
  });

  it("marks an existing unmastered mistake mastered after the third consecutive correct answer with atomic updates", async () => {
    const tx = transactionMock({
      question: questionRecord({ correctAnswers: ["B"] }),
      mistake: mistakeRecord({ consecutiveCorrectCount: 2, isMastered: false }),
      updatedMistake: mistakeRecord({
        consecutiveCorrectCount: 3,
        isMastered: true,
        masteredAt: new Date("2026-05-03T10:00:00.000Z")
      })
    });
    const service = new PracticeService(prismaMock(tx) as never);

    const result = await service.submit({ questionId: questionId(), submittedAnswers: ["B"] }, identity());

    expect(tx.mistake.updateMany).toHaveBeenNthCalledWith(1, {
      where: { visitorId: "v1", questionId: questionId(), isMastered: false },
      data: { consecutiveCorrectCount: { increment: 1 } }
    });
    expect(tx.mistake.updateMany).toHaveBeenNthCalledWith(2, {
      where: { visitorId: "v1", questionId: questionId(), isMastered: false, consecutiveCorrectCount: { gte: 3 } },
      data: { isMastered: true, masteredAt: expect.any(Date) }
    });
    expect(result.masteryStatus).toMatchObject({ code: "mastered", label: "\u5df2\u638c\u63e1", color: "success" });
  });

  it("does not allow practice submission for missing, draft, or archived questions", async () => {
    const tx = transactionMock({ question: null, mistake: null });
    const service = new PracticeService(prismaMock(tx) as never);

    await expect(service.submit({ questionId: questionId(), submittedAnswers: ["A"] }, identity())).rejects.toThrow(
      NotFoundException
    );
    expect(tx.practiceAttempt.create).not.toHaveBeenCalled();
    expect(tx.question.update).not.toHaveBeenCalled();
    expect(tx.mistake.upsert).not.toHaveBeenCalled();
  });

  it.each([
    { body: null, label: "null body" },
    { body: undefined, label: "undefined body" },
    { body: "not-object", label: "non-object body" },
    { body: { questionId: questionId(), submittedAnswers: [] }, label: "empty answers" },
    { body: { questionId: questionId(), submittedAnswers: ["A", "A"] }, label: "duplicate answers" },
    { body: { questionId: questionId(), submittedAnswers: ["A"], durationSec: "12abc" }, label: "partial duration" },
    { body: { questionId: "not-a-uuid", submittedAnswers: ["A"] }, label: "invalid question id" }
  ])("rejects invalid practice submissions: $label", async ({ body }) => {
    const tx = transactionMock({ question: questionRecord(), mistake: null });
    const service = new PracticeService(prismaMock(tx) as never);

    await expect(service.submit(body as never, identity())).rejects.toThrow(BadRequestException);
    expect(tx.practiceAttempt.create).not.toHaveBeenCalled();
  });

  it("rejects submitted answers that are not valid option keys for the question", async () => {
    const tx = transactionMock({ question: questionRecord(), mistake: null });
    const service = new PracticeService(prismaMock(tx) as never);

    await expect(service.submit({ questionId: questionId(), submittedAnswers: ["Z"] }, identity())).rejects.toThrow(
      BadRequestException
    );
    expect(tx.practiceAttempt.create).not.toHaveBeenCalled();
  });

  it("rejects invalid persisted question answer definitions before scoring", async () => {
    const tx = transactionMock({
      question: questionRecord({ options: [{ key: "A", text: "Only one option" }], correctAnswers: ["A"] }),
      mistake: null
    });
    const service = new PracticeService(prismaMock(tx) as never);

    await expect(service.submit({ questionId: questionId(), submittedAnswers: ["A"] }, identity())).rejects.toThrow(
      InternalServerErrorException
    );
    expect(tx.practiceAttempt.create).not.toHaveBeenCalled();
  });

  it("uses a serializable transaction and retries write conflicts", async () => {
    const firstConflict = Object.assign(new Error("serialization failure"), { code: "P2034" });
    const tx = transactionMock({
      question: questionRecord({ correctAnswers: ["B"] }),
      mistake: mistakeRecord({ consecutiveCorrectCount: 2, isMastered: false }),
      updatedMistake: mistakeRecord({ consecutiveCorrectCount: 3, isMastered: true })
    });
    const prisma = prismaMock(tx);
    (prisma.$transaction as jest.Mock).mockRejectedValueOnce(firstConflict);
    const service = new PracticeService(prisma as never);

    await expect(service.submit({ questionId: questionId(), submittedAnswers: ["B"] }, identity())).resolves.toMatchObject({
      isCorrect: true,
      masteryStatus: { code: "mastered" }
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    });
  });
});

function identity(): RequestIdentity {
  return { ip: "10.0.0.5", role: "learner", roleLabel: "learner", permissions: [] };
}

function prismaMock(tx: ReturnType<typeof transactionMock>) {
  return {
    $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx))
  };
}

function transactionMock(options: { question: unknown; mistake: unknown; updatedMistake?: unknown }) {
  return {
    visitor: {
      findUnique: jest.fn().mockResolvedValue({ id: "v1", ip: "10.0.0.5" })
    },
    question: {
      findFirst: jest.fn().mockResolvedValue(options.question),
      update: jest.fn().mockResolvedValue(undefined)
    },
    practiceAttempt: {
      create: jest.fn().mockResolvedValue({ id: "attempt1" })
    },
    mistake: {
      findUnique: jest.fn().mockResolvedValue(options.updatedMistake ?? options.mistake),
      update: jest.fn().mockResolvedValue(options.updatedMistake),
      updateMany: jest.fn().mockResolvedValue({ count: options.mistake === null ? 0 : 1 }),
      upsert: jest.fn().mockResolvedValue(mistakeRecord({ wrongCount: 1 }))
    }
  };
}

function questionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: questionId(),
    type: "single",
    options: [
      { key: "A", text: "Option A" },
      { key: "B", text: "Option B" }
    ],
    correctAnswers: ["B"],
    explanationMd: "Because B is correct",
    memo: "Remember B",
    status: "published",
    ...overrides
  };
}

function mistakeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    visitorId: "v1",
    questionId: questionId(),
    wrongCount: 1,
    consecutiveCorrectCount: 0,
    isMastered: false,
    lastWrongAt: null,
    masteredAt: null,
    ...overrides
  };
}

function questionId() {
  return "11111111-1111-4111-8111-111111111111";
}

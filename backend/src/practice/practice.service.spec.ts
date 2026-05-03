import { NotFoundException } from "@nestjs/common";
import type { RequestIdentity } from "../identity/identity.service";
import { PracticeService } from "./practice.service";

describe("PracticeService", () => {
  it("records a correct multiple-choice attempt without depending on submitted answer order", async () => {
    const tx = transactionMock({
      question: questionRecord({ type: "multiple", correctAnswers: ["A", "C"] }),
      mistake: null
    });
    const service = new PracticeService(prismaMock(tx) as never);

    const result = await service.submit(
      { questionId: "q1", submittedAnswers: ["C", "A"], durationSec: 12 },
      identity()
    );

    expect(tx.question.findFirst).toHaveBeenCalledWith({ where: { id: "q1", status: "published" } });
    expect(tx.practiceAttempt.create).toHaveBeenCalledWith({
      data: {
        visitorId: "v1",
        questionId: "q1",
        selectedKeys: ["C", "A"],
        isCorrect: true,
        mode: "practice",
        durationSec: 12
      }
    });
    expect(tx.question.update).toHaveBeenCalledWith({
      where: { id: "q1" },
      data: {
        totalAttempts: { increment: 1 },
        correctAttempts: { increment: 1 }
      }
    });
    expect(tx.mistake.update).not.toHaveBeenCalled();
    expect(tx.mistake.upsert).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      attemptId: "attempt1",
      questionId: "q1",
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

    const result = await service.submit({ questionId: "q1", submittedAnswers: ["A"] }, identity());

    expect(tx.practiceAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isCorrect: false, selectedKeys: ["A"] })
      })
    );
    expect(tx.question.update).toHaveBeenCalledWith({
      where: { id: "q1" },
      data: {
        totalAttempts: { increment: 1 },
        correctAttempts: { increment: 0 }
      }
    });
    expect(tx.mistake.upsert).toHaveBeenCalledWith({
      where: { visitorId_questionId: { visitorId: "v1", questionId: "q1" } },
      create: expect.objectContaining({
        visitorId: "v1",
        questionId: "q1",
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
      masteryStatus: { code: "unmastered", label: "未掌握", color: "danger" }
    });
  });

  it("marks an existing unmastered mistake mastered after the third consecutive correct answer", async () => {
    const existingMistake = mistakeRecord({ consecutiveCorrectCount: 2, isMastered: false });
    const tx = transactionMock({
      question: questionRecord({ correctAnswers: ["B"] }),
      mistake: existingMistake,
      updatedMistake: mistakeRecord({
        consecutiveCorrectCount: 3,
        isMastered: true,
        masteredAt: new Date("2026-05-03T10:00:00.000Z")
      })
    });
    const service = new PracticeService(prismaMock(tx) as never);

    const result = await service.submit({ questionId: "q1", submittedAnswers: ["B"] }, identity());

    expect(tx.mistake.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: expect.objectContaining({
        consecutiveCorrectCount: 3,
        isMastered: true,
        masteredAt: expect.any(Date)
      })
    });
    expect(result.masteryStatus).toMatchObject({ code: "mastered", label: "已掌握", color: "success" });
  });

  it("does not allow practice submission for missing, draft, or archived questions", async () => {
    const tx = transactionMock({ question: null, mistake: null });
    const service = new PracticeService(prismaMock(tx) as never);

    await expect(service.submit({ questionId: "draft-id", submittedAnswers: ["A"] }, identity())).rejects.toThrow(
      NotFoundException
    );
    expect(tx.practiceAttempt.create).not.toHaveBeenCalled();
    expect(tx.question.update).not.toHaveBeenCalled();
    expect(tx.mistake.upsert).not.toHaveBeenCalled();
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
      findUnique: jest.fn().mockResolvedValue(options.mistake),
      update: jest.fn().mockResolvedValue(options.updatedMistake),
      upsert: jest.fn().mockResolvedValue(mistakeRecord({ wrongCount: 1 }))
    }
  };
}

function questionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "q1",
    type: "single",
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
    questionId: "q1",
    wrongCount: 1,
    consecutiveCorrectCount: 0,
    isMastered: false,
    lastWrongAt: null,
    masteredAt: null,
    ...overrides
  };
}

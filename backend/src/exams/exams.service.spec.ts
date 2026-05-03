import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { RequestIdentity } from "../identity/identity.service";
import type { ExamConfigService } from "./exam-config.service";
import { ExamsService } from "./exams.service";

describe("ExamsService", () => {
  it("rejects exam creation when published questions are insufficient and reports missing counts by type", async () => {
    const tx = transactionMock();
    tx.question.findMany.mockImplementation(({ where }: { where: { type: string } }) =>
      Promise.resolve(questionPool(where.type, where.type === "single" ? 1 : 0))
    );
    const service = examService(tx, configService({ judgment: 1, single: 2, multiple: 1 }));

    await expect(
      service.create({ subject: "programming", language: "java", level: "entry" }, identity())
    ).rejects.toMatchObject({
      response: {
        code: "EXAM_QUESTIONS_INSUFFICIENT",
        missing: [
          { type: "single", required: 2, available: 1, missing: 1 },
          { type: "multiple", required: 1, available: 0, missing: 1 },
          { type: "judgment", required: 1, available: 0, missing: 1 }
        ]
      }
    });
    expect(tx.examAttempt.create).not.toHaveBeenCalled();
    expect(tx.question.findMany).toHaveBeenCalledWith({
      where: {
        status: "published",
        subject: "programming",
        language: "java",
        level: "entry",
        type: "single"
      }
    });
  });

  it("creates an exam with timing, config snapshot, question snapshot, and no leaked answers in active state", async () => {
    const tx = transactionMock();
    tx.question.findMany.mockImplementation(({ where }: { where: { type: string } }) =>
      Promise.resolve(questionPool(where.type, 1))
    );
    const service = examService(tx, configService({ judgment: 1, single: 1, multiple: 1 }));

    const result = await service.create({ subject: "programming", language: "java", level: "entry" }, identity());

    expect(tx.examAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        visitorId: "visitor1",
        subject: "programming",
        language: "java",
        level: "entry",
        configSnapshot: {
          durationMinutes: 45,
          passScorePercent: 60,
          questionCounts: { judgment: 1, single: 1, multiple: 1 }
        },
        answers: {},
        status: "in_progress",
        startedAt: new Date("2026-05-03T00:00:00.000Z"),
        deadlineAt: new Date("2026-05-03T00:45:00.000Z")
      })
    });
    expect(result.status).toBe("in_progress");
    expect(result.deadlineAt).toEqual(new Date("2026-05-03T00:45:00.000Z"));
    expect(result.questions).toHaveLength(3);
    expect(result.questions[0]).not.toHaveProperty("correctAnswers");
    expect(result.questions[0]).not.toHaveProperty("explanationMd");
    expect(result.questions[0]).not.toHaveProperty("memo");
  });

  it("reuses any active unfinished exam for the same visitor even when the requested source differs", async () => {
    const activeExam = examAttemptRecord({ id: "active-exam", subject: "refactoring", language: null, level: "professional" });
    const tx = transactionMock({ activeExam });
    const service = examService(tx, configService({ judgment: 1, single: 1, multiple: 1 }));

    const result = await service.create({ subject: "programming", language: "java", level: "entry" }, identity());

    expect(result.id).toBe("active-exam");
    expect(tx.examAttempt.findFirst).toHaveBeenCalledWith({
      where: { visitorId: "visitor1", status: "in_progress" },
      orderBy: { startedAt: "desc" }
    });
    expect(tx.question.findMany).not.toHaveBeenCalled();
    expect(tx.examAttempt.create).not.toHaveBeenCalled();
  });

  it("abandons any existing active exam before creating a new one when explicitly requested", async () => {
    const activeExam = examAttemptRecord({ id: "active-exam", subject: "refactoring", language: null, level: "professional" });
    const tx = transactionMock({ activeExam });
    tx.question.findMany.mockImplementation(({ where }: { where: { type: string } }) =>
      Promise.resolve(questionPool(where.type, 1))
    );
    const service = examService(tx, configService({ judgment: 1, single: 1, multiple: 1 }));

    const result = await service.create(
      { subject: "programming", language: "java", level: "entry", abandonExisting: true },
      identity()
    );

    expect(tx.examAttempt.update).toHaveBeenCalledWith({ where: { id: "active-exam" }, data: { status: "abandoned" } });
    expect(tx.examAttempt.create).toHaveBeenCalled();
    expect(result.id).toBe("exam1");
  });

  it("autosaves valid answers for active exams without scoring", async () => {
    const tx = transactionMock({ exam: examAttemptRecord() });
    const service = examService(tx, configService({ judgment: 1, single: 1, multiple: 1 }));

    const result = await service.saveAnswers("exam1", { answers: { [singleQuestionId()]: ["B"] } }, identity());

    expect(tx.examAttempt.update).toHaveBeenCalledWith({
      where: { id: "exam1" },
      data: { answers: { [singleQuestionId()]: ["B"] } }
    });
    expect(result.answers).toEqual({ [singleQuestionId()]: ["B"] });
    expect(result.scorePercent).toBeNull();
  });

  it("auto-submits an expired active exam on get using saved answers and records unanswered questions as mistakes", async () => {
    const expiredExam = examAttemptRecord({
      answers: { [singleQuestionId()]: ["B"] },
      deadlineAt: new Date("2026-05-02T23:59:59.000Z")
    });
    const tx = transactionMock({ exam: expiredExam });
    const service = examService(tx, configService({ judgment: 1, single: 1, multiple: 1 }));

    const result = await service.get("exam1", identity());

    expect(tx.examAttempt.update).toHaveBeenCalledWith({
      where: { id: "exam1" },
      data: expect.objectContaining({
        answers: { [singleQuestionId()]: ["B"] },
        status: "submitted",
        scorePercent: new Prisma.Decimal("33.33"),
        isPassed: false,
        submittedAt: new Date("2026-05-03T00:00:00.000Z")
      })
    });
    expect(tx.mistake.upsert).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("submitted");
    expect(result.scorePercent).toBe(33.33);
  });

  it("does not autosave requested answers when the exam is already expired", async () => {
    const expiredExam = examAttemptRecord({
      answers: { [singleQuestionId()]: ["B"] },
      deadlineAt: new Date("2026-05-02T23:59:59.000Z")
    });
    const tx = transactionMock({ exam: expiredExam });
    const service = examService(tx, configService({ judgment: 1, single: 1, multiple: 1 }));

    const result = await service.saveAnswers("exam1", { answers: { [multipleQuestionId()]: ["A", "C"] } }, identity());

    expect(tx.examAttempt.update).toHaveBeenCalledWith({
      where: { id: "exam1" },
      data: expect.objectContaining({
        answers: { [singleQuestionId()]: ["B"] },
        status: "submitted"
      })
    });
    expect(result.answers).toEqual({ [singleQuestionId()]: ["B"] });
    expect(result.status).toBe("submitted");
  });

  it("treats the exact deadline as expired and submits saved answers", async () => {
    const deadlineExam = examAttemptRecord({
      answers: { [singleQuestionId()]: ["B"] },
      deadlineAt: new Date("2026-05-03T00:00:00.000Z")
    });
    const tx = transactionMock({ exam: deadlineExam });
    const service = examService(tx, configService({ judgment: 1, single: 1, multiple: 1 }));

    const result = await service.submit(
      "exam1",
      { answers: { [singleQuestionId()]: ["A"], [multipleQuestionId()]: ["A", "C"], [judgmentQuestionId()]: ["A"] } },
      identity()
    );

    expect(tx.examAttempt.update).toHaveBeenCalledWith({
      where: { id: "exam1" },
      data: expect.objectContaining({
        answers: { [singleQuestionId()]: ["B"] },
        scorePercent: new Prisma.Decimal("33.33"),
        status: "submitted"
      })
    });
    expect(result.status).toBe("submitted");
    expect(result.answers).toEqual({ [singleQuestionId()]: ["B"] });
  });

  it("submits expired exams using saved answers instead of new request answers", async () => {
    const expiredExam = examAttemptRecord({
      answers: { [singleQuestionId()]: ["B"] },
      deadlineAt: new Date("2026-05-02T23:59:59.000Z")
    });
    const tx = transactionMock({ exam: expiredExam });
    const service = examService(tx, configService({ judgment: 1, single: 1, multiple: 1 }));

    const result = await service.submit(
      "exam1",
      { answers: { [singleQuestionId()]: ["A"], [multipleQuestionId()]: ["A", "C"], [judgmentQuestionId()]: ["A"] } },
      identity()
    );

    expect(tx.examAttempt.update).toHaveBeenCalledWith({
      where: { id: "exam1" },
      data: expect.objectContaining({
        answers: { [singleQuestionId()]: ["B"] },
        scorePercent: new Prisma.Decimal("33.33")
      })
    });
    expect(result.scorePercent).toBe(33.33);
  });

  it("auto-submits an expired active exam on abandon instead of marking it abandoned", async () => {
    const expiredExam = examAttemptRecord({
      answers: { [singleQuestionId()]: ["B"] },
      deadlineAt: new Date("2026-05-02T23:59:59.000Z")
    });
    const tx = transactionMock({ exam: expiredExam });
    const service = examService(tx, configService({ judgment: 1, single: 1, multiple: 1 }));

    const result = await service.abandon("exam1", identity());

    expect(tx.examAttempt.update).toHaveBeenCalledWith({
      where: { id: "exam1" },
      data: expect.objectContaining({
        answers: { [singleQuestionId()]: ["B"] },
        status: "submitted",
        scorePercent: new Prisma.Decimal("33.33"),
        isPassed: false
      })
    });
    expect(tx.examAttempt.update).not.toHaveBeenCalledWith({ where: { id: "exam1" }, data: { status: "abandoned" } });
    expect(tx.mistake.upsert).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("submitted");
    expect(result.scorePercent).toBe(33.33);
  });

  it("rejects invalid answer shapes instead of throwing an internal error", async () => {
    const tx = transactionMock({ exam: examAttemptRecord() });
    const service = examService(tx, configService({ judgment: 1, single: 1, multiple: 1 }));

    await expect(service.saveAnswers("exam1", { answers: { [singleQuestionId()]: ["Z"] } }, identity())).rejects.toThrow(
      BadRequestException
    );
    expect(tx.examAttempt.update).not.toHaveBeenCalled();
  });

  it("submits once, scores order-insensitive multiple answers, records wrong questions as mistakes, and returns review output", async () => {
    const tx = transactionMock({ exam: examAttemptRecord() });
    const service = examService(tx, configService({ judgment: 1, single: 1, multiple: 1 }));

    const result = await service.submit(
      "exam1",
      {
        answers: {
          [singleQuestionId()]: ["B"],
          [multipleQuestionId()]: ["C", "A"],
          [judgmentQuestionId()]: ["B"]
        }
      },
      identity()
    );

    expect(tx.examAttempt.update).toHaveBeenCalledWith({
      where: { id: "exam1" },
      data: expect.objectContaining({
        answers: {
          [singleQuestionId()]: ["B"],
          [multipleQuestionId()]: ["C", "A"],
          [judgmentQuestionId()]: ["B"]
        },
        status: "submitted",
        scorePercent: new Prisma.Decimal("66.67"),
        isPassed: true,
        submittedAt: new Date("2026-05-03T00:00:00.000Z")
      })
    });
    expect(tx.mistake.upsert).toHaveBeenCalledTimes(1);
    expect(tx.mistake.upsert).toHaveBeenCalledWith({
      where: { visitorId_questionId: { visitorId: "visitor1", questionId: judgmentQuestionId() } },
      create: expect.objectContaining({
        visitorId: "visitor1",
        questionId: judgmentQuestionId(),
        wrongCount: 1,
        consecutiveCorrectCount: 0,
        isMastered: false
      }),
      update: expect.objectContaining({
        wrongCount: { increment: 1 },
        consecutiveCorrectCount: 0,
        isMastered: false
      })
    });
    expect(result.status).toBe("submitted");
    expect(result.scorePercent).toBe(66.67);
    expect(result.isPassed).toBe(true);
    expect(result.questions[0]).toHaveProperty("correctAnswers");
    expect(result.questions[0]).toHaveProperty("explanationMd");
    expect(result.questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: judgmentQuestionId(), isCorrect: false, submittedAnswers: ["B"] })
      ])
    );
  });

  it("returns existing review result on duplicate submit without writing mistakes again", async () => {
    const tx = transactionMock({ exam: examAttemptRecord({ status: "submitted", scorePercent: new Prisma.Decimal("66.67") }) });
    const service = examService(tx, configService({ judgment: 1, single: 1, multiple: 1 }));

    const result = await service.submit("exam1", {}, identity());

    expect(result.status).toBe("submitted");
    expect(result.scorePercent).toBe(66.67);
    expect(tx.examAttempt.update).not.toHaveBeenCalled();
    expect(tx.mistake.upsert).not.toHaveBeenCalled();
  });

  it("lists current visitor exam history without question snapshot details", async () => {
    const tx = transactionMock({
      exams: [
        examAttemptRecord({ id: "exam-new", status: "submitted", scorePercent: new Prisma.Decimal("66.67"), isPassed: true }),
        examAttemptRecord({ id: "exam-old", status: "abandoned" })
      ]
    });
    const service = examService(tx, configService({ judgment: 1, single: 1, multiple: 1 }));

    const result = await service.list(identity());

    expect(tx.examAttempt.findMany).toHaveBeenCalledWith({
      where: { visitorId: "visitor1" },
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
    });
    expect(result.items).toEqual([
      expect.objectContaining({ id: "exam-new", scorePercent: 66.67, isPassed: true }),
      expect.objectContaining({ id: "exam-old", scorePercent: null })
    ]);
    expect(result.items[0]).not.toHaveProperty("questionSnapshot");
    expect(result.items[0]).not.toHaveProperty("answers");
    expect(result.items[0]).not.toHaveProperty("questions");
  });

  it("recovers from an active exam unique conflict by returning the newly active exam", async () => {
    const uniqueConflict = Object.assign(new Error("unique violation"), {
      code: "P2002",
      meta: { target: "ExamAttempt_single_active_per_visitor" }
    });
    const activeExam = examAttemptRecord({ id: "active-after-conflict" });
    const tx = transactionMock({ activeExam });
    tx.examAttempt.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(activeExam);
    tx.question.findMany.mockImplementation(({ where }: { where: { type: string } }) =>
      Promise.resolve(questionPool(where.type, 1))
    );
    tx.examAttempt.create.mockRejectedValueOnce(uniqueConflict);
    const service = examService(tx, configService({ judgment: 1, single: 1, multiple: 1 }));

    const result = await service.create({ subject: "programming", language: "java", level: "entry" }, identity());

    expect(result.id).toBe("active-after-conflict");
    expect(tx.examAttempt.findFirst).toHaveBeenLastCalledWith({
      where: { visitorId: "visitor1", status: "in_progress" },
      orderBy: { startedAt: "desc" }
    });
  });

  it("prevents visitors from accessing another visitor's exam", async () => {
    const tx = transactionMock({ exam: null });
    const service = examService(tx, configService({ judgment: 1, single: 1, multiple: 1 }));

    await expect(service.get("exam1", identity())).rejects.toThrow(NotFoundException);
  });
});

function identity(): RequestIdentity {
  return { ip: "10.0.0.5", role: "learner", roleLabel: "learner", permissions: [] };
}

function examService(tx: ReturnType<typeof transactionMock>, config: Pick<ExamConfigService, "getSubjectConfig">) {
  return new ExamsService(prismaMock(tx) as never, config as ExamConfigService, () => new Date("2026-05-03T00:00:00.000Z"));
}

function configService(questionCounts: { judgment: number; single: number; multiple: number }) {
  return {
    getSubjectConfig: jest.fn().mockReturnValue({
      durationMinutes: 45,
      passScorePercent: 60,
      questionCounts
    })
  };
}

function prismaMock(tx: ReturnType<typeof transactionMock>) {
  return {
    $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx))
  };
}

function transactionMock(options: { activeExam?: unknown; exam?: unknown; exams?: unknown[] } = {}) {
  return {
    visitor: {
      findUnique: jest.fn().mockResolvedValue({ id: "visitor1", ip: "10.0.0.5" })
    },
    question: {
      findMany: jest.fn()
    },
    examAttempt: {
      findFirst: jest.fn().mockResolvedValue(options.activeExam ?? null),
      findMany: jest.fn().mockResolvedValue(options.exams ?? []),
      findUnique: jest.fn().mockResolvedValue(options.exam ?? null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve(examAttemptRecord(data))),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const base = where.id === "active-exam" ? options.activeExam : options.exam;
        return Promise.resolve(examAttemptRecord({ ...(base as Record<string, unknown> | undefined), ...data }));
      })
    },
    mistake: {
      upsert: jest.fn().mockResolvedValue({ id: "mistake1" })
    }
  };
}

function examAttemptRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "exam1",
    visitorId: "visitor1",
    subject: "programming",
    language: "java",
    level: "entry",
    configSnapshot: {
      durationMinutes: 45,
      passScorePercent: 60,
      questionCounts: { judgment: 1, single: 1, multiple: 1 }
    },
    questionSnapshot: [singleQuestion(), multipleQuestion(), judgmentQuestion()],
    answers: {},
    flaggedQuestionIds: [],
    status: "in_progress",
    scorePercent: null,
    isPassed: null,
    startedAt: new Date("2026-05-03T00:00:00.000Z"),
    deadlineAt: new Date("2026-05-03T00:45:00.000Z"),
    submittedAt: null,
    updatedAt: new Date("2026-05-03T00:00:00.000Z"),
    ...overrides
  };
}

function questionPool(type: string, count: number) {
  return Array.from({ length: count }, (_, index) =>
    questionRecord({
      id: `${index + 1}${index + 1}${index + 1}${index + 1}${index + 1}${index + 1}${index + 1}${index + 1}-1111-4111-8111-111111111111`,
      type
    })
  );
}

function singleQuestion() {
  return questionRecord({ id: singleQuestionId(), type: "single", correctAnswers: ["B"] });
}

function multipleQuestion() {
  return questionRecord({
    id: multipleQuestionId(),
    type: "multiple",
    options: [
      { key: "A", text: "A" },
      { key: "B", text: "B" },
      { key: "C", text: "C" }
    ],
    correctAnswers: ["A", "C"]
  });
}

function judgmentQuestion() {
  return questionRecord({
    id: judgmentQuestionId(),
    type: "judgment",
    options: [
      { key: "A", text: "True" },
      { key: "B", text: "False" }
    ],
    correctAnswers: ["A"]
  });
}

function questionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: singleQuestionId(),
    sourceCode: null,
    subject: "programming",
    language: "java",
    level: "entry",
    type: "single",
    stemMd: "Question stem",
    options: [
      { key: "A", text: "A" },
      { key: "B", text: "B" }
    ],
    correctAnswers: ["B"],
    explanationMd: "Because",
    memo: null,
    tags: ["tag"],
    status: "published",
    createdByIp: "10.0.0.1",
    totalAttempts: 0,
    correctAttempts: 0,
    createdAt: new Date("2026-05-02T00:00:00.000Z"),
    updatedAt: new Date("2026-05-02T00:00:00.000Z"),
    ...overrides
  };
}

function singleQuestionId() {
  return "11111111-1111-4111-8111-111111111111";
}

function multipleQuestionId() {
  return "22222222-2222-4222-8222-222222222222";
}

function judgmentQuestionId() {
  return "33333333-3333-4333-8333-333333333333";
}

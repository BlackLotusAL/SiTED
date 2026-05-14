import { BadRequestException, NotFoundException } from "@nestjs/common";
import { drizzleMock } from "../testing/drizzle-mock";
import type { RequestIdentity } from "../identity/identity.service";
import type { ExamConfigService } from "./exam-config.service";
import { ExamsService } from "./exams.service";

describe("ExamsService", () => {
  it("rejects exam creation when published questions are insufficient and reports missing counts by type", async () => {
    const db = drizzleMock({
      select: [[{ id: "visitor1" }], [], questionPool("single", 1), [], []]
    });
    const service = examService(db, configService({ judgment: 1, single: 2, multiple: 1 }));

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
    expect(db.client.insert).not.toHaveBeenCalled();
  });

  it("creates an exam with timing, config snapshot, question snapshot, and no leaked answers in active state", async () => {
    const created = examAttemptRecord();
    const db = drizzleMock({
      select: [[{ id: "visitor1" }], [], questionPool("single", 1), questionPool("multiple", 1), questionPool("judgment", 1)],
      insert: [[created]]
    });
    const service = examService(db, configService({ judgment: 1, single: 1, multiple: 1 }));

    const result = await service.create({ subject: "programming", language: "java", level: "entry" }, identity());

    expect(db.client.transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: "serializable" }));
    expect(result.status).toBe("in_progress");
    expect(result.deadlineAt).toEqual(new Date("2026-05-03T00:45:00.000Z"));
    expect(result.questions).toHaveLength(3);
    expect(result.questions[0]).not.toHaveProperty("correctAnswers");
    expect(result.questions[0]).not.toHaveProperty("explanationMd");
    expect(result.questions[0]).not.toHaveProperty("memo");
  });

  it("reuses any active unfinished exam for the same visitor even when the requested source differs", async () => {
    const activeExam = examAttemptRecord({ id: "active-exam", subject: "refactoring", language: null, level: "professional" });
    const db = drizzleMock({ select: [[{ id: "visitor1" }], [activeExam]] });
    const service = examService(db, configService({ judgment: 1, single: 1, multiple: 1 }));

    const result = await service.create({ subject: "programming", language: "java", level: "entry" }, identity());

    expect(result.id).toBe("active-exam");
    expect(db.client.insert).not.toHaveBeenCalled();
    expect(db.client.update).not.toHaveBeenCalled();
  });

  it("autosaves valid answers for active exams without scoring", async () => {
    const updated = examAttemptRecord({ answers: { [singleQuestionId()]: ["B"] } });
    const db = drizzleMock({
      select: [[{ id: "visitor1" }], [examAttemptRecord()]],
      update: [[updated]]
    });
    const service = examService(db, configService({ judgment: 1, single: 1, multiple: 1 }));

    const result = await service.saveAnswers("exam1", { answers: { [singleQuestionId()]: ["B"] } }, identity());

    expect(db.client.update).toHaveBeenCalledTimes(1);
    expect(result.answers).toEqual({ [singleQuestionId()]: ["B"] });
    expect(result.scorePercent).toBeNull();
  });

  it("auto-submits an expired active exam using saved answers and records unanswered questions as mistakes", async () => {
    const expiredExam = examAttemptRecord({
      answers: { [singleQuestionId()]: ["B"] },
      deadlineAt: new Date("2026-05-02T23:59:59.000Z")
    });
    const submitted = examAttemptRecord({
      ...expiredExam,
      status: "submitted",
      scorePercent: "33.33",
      isPassed: false,
      submittedAt: new Date("2026-05-03T00:00:00.000Z")
    });
    const db = drizzleMock({
      select: [[{ id: "visitor1" }], [expiredExam]],
      insert: [[], []],
      update: [[submitted]]
    });
    const service = examService(db, configService({ judgment: 1, single: 1, multiple: 1 }));

    const result = await service.get("exam1", identity());

    expect(db.client.insert).toHaveBeenCalledTimes(2);
    expect(db.client.update).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("submitted");
    expect(result.scorePercent).toBe(33.33);
  });

  it("rejects invalid answer shapes instead of throwing an internal error", async () => {
    const db = drizzleMock({ select: [[{ id: "visitor1" }], [examAttemptRecord()]] });
    const service = examService(db, configService({ judgment: 1, single: 1, multiple: 1 }));

    await expect(service.saveAnswers("exam1", { answers: { [singleQuestionId()]: ["Z"] } }, identity())).rejects.toThrow(
      BadRequestException
    );
    expect(db.client.update).not.toHaveBeenCalled();
  });

  it("submits once, scores order-insensitive multiple answers, records wrong questions as mistakes, and returns review output", async () => {
    const submitted = examAttemptRecord({
      answers: {
        [singleQuestionId()]: ["B"],
        [multipleQuestionId()]: ["C", "A"],
        [judgmentQuestionId()]: ["B"]
      },
      status: "submitted",
      scorePercent: "66.67",
      isPassed: true,
      submittedAt: new Date("2026-05-03T00:00:00.000Z")
    });
    const db = drizzleMock({
      select: [[{ id: "visitor1" }], [examAttemptRecord()]],
      insert: [[]],
      update: [[submitted]]
    });
    const service = examService(db, configService({ judgment: 1, single: 1, multiple: 1 }));

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

    expect(db.client.insert).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("submitted");
    expect(result.scorePercent).toBe(66.67);
    expect(result.isPassed).toBe(true);
    expect(result.questions[0]).toHaveProperty("correctAnswers");
    expect(result.questions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: judgmentQuestionId(), isCorrect: false, submittedAnswers: ["B"] })])
    );
  });

  it("returns existing review result on duplicate submit without writing mistakes again", async () => {
    const submitted = examAttemptRecord({ status: "submitted", scorePercent: "66.67", isPassed: true });
    const db = drizzleMock({ select: [[{ id: "visitor1" }], [submitted]] });
    const service = examService(db, configService({ judgment: 1, single: 1, multiple: 1 }));

    const result = await service.submit("exam1", {}, identity());

    expect(result.status).toBe("submitted");
    expect(result.scorePercent).toBe(66.67);
    expect(db.client.update).not.toHaveBeenCalled();
    expect(db.client.insert).not.toHaveBeenCalled();
  });

  it("lists current visitor exam history without question snapshot details", async () => {
    const db = drizzleMock({
      select: [
        [{ id: "visitor1" }],
        [
          examAttemptRecord({ id: "exam-new", status: "submitted", scorePercent: "66.67", isPassed: true }),
          examAttemptRecord({ id: "exam-old", status: "abandoned" })
        ]
      ]
    });
    const service = examService(db, configService({ judgment: 1, single: 1, multiple: 1 }));

    const result = await service.list(identity());

    expect(result.items).toEqual([
      expect.objectContaining({ id: "exam-new", scorePercent: 66.67, isPassed: true }),
      expect.objectContaining({ id: "exam-old", scorePercent: null })
    ]);
    expect(result.items[0]).not.toHaveProperty("questionSnapshot");
    expect(result.items[0]).not.toHaveProperty("answers");
    expect(result.items[0]).not.toHaveProperty("questions");
  });

  it("recovers from an active exam unique conflict by returning the newly active exam", async () => {
    const uniqueConflict = Object.assign(new Error("unique violation"), { code: "23505" });
    const activeExam = examAttemptRecord({ id: "active-after-conflict" });
    const db = drizzleMock({
      select: [
        [{ id: "visitor1" }],
        [],
        questionPool("single", 1),
        questionPool("multiple", 1),
        questionPool("judgment", 1),
        [{ id: "visitor1" }],
        [activeExam]
      ],
      insert: [uniqueConflict]
    });
    const service = examService(db, configService({ judgment: 1, single: 1, multiple: 1 }));

    const result = await service.create({ subject: "programming", language: "java", level: "entry" }, identity());

    expect(result.id).toBe("active-after-conflict");
    expect(db.client.transaction).toHaveBeenCalledTimes(2);
  });

  it("prevents visitors from accessing another visitor's exam", async () => {
    const db = drizzleMock({ select: [[{ id: "visitor1" }], []] });
    const service = examService(db, configService({ judgment: 1, single: 1, multiple: 1 }));

    await expect(service.get("exam1", identity())).rejects.toThrow(NotFoundException);
  });
});

function identity(): RequestIdentity {
  return { ip: "10.0.0.5", role: "learner", roleLabel: "learner", permissions: [] };
}

function examService(db: ReturnType<typeof drizzleMock>, config: Pick<ExamConfigService, "getSubjectConfig">) {
  return new ExamsService(db.service as never, config as ExamConfigService, () => new Date("2026-05-03T00:00:00.000Z"));
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
  return Array.from({ length: count }, (_value, index) =>
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

import { BadRequestException, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import type { RequestIdentity } from "../identity/identity.service";
import { drizzleMock } from "../testing/drizzle-mock";
import { PracticeService } from "./practice.service";

describe("PracticeService", () => {
  it("records a correct multiple-choice attempt without depending on submitted answer order", async () => {
    const db = dbMock({
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
    const service = new PracticeService(db.service as never);

    const result = await service.submit(
      { questionId: questionId(), submittedAnswers: ["C", "A"], durationSec: 12 },
      identity()
    );

    expect(db.client.transaction).toHaveBeenCalledTimes(1);
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
    const db = dbMock({
      question: questionRecord({ correctAnswers: ["B"] }),
      mistake: null
    });
    const service = new PracticeService(db.service as never);

    const result = await service.submit({ questionId: questionId(), submittedAnswers: ["A"] }, identity());

    expect(result).toMatchObject({
      isCorrect: false,
      masteryStatus: { code: "unmastered", label: "\u672a\u638c\u63e1", color: "danger" }
    });
  });

  it("marks an existing unmastered mistake mastered after the third consecutive correct answer with atomic updates", async () => {
    const db = dbMock({
      question: questionRecord({ correctAnswers: ["B"] }),
      mistake: mistakeRecord({ consecutiveCorrectCount: 2, isMastered: false }),
      updatedMistake: mistakeRecord({
        consecutiveCorrectCount: 3,
        isMastered: true,
        masteredAt: new Date("2026-05-03T10:00:00.000Z")
      })
    });
    const service = new PracticeService(db.service as never);

    const result = await service.submit({ questionId: questionId(), submittedAnswers: ["B"] }, identity());

    expect(result.masteryStatus).toMatchObject({ code: "mastered", label: "\u5df2\u638c\u63e1", color: "success" });
  });

  it("does not allow practice submission for missing, draft, or archived questions", async () => {
    const db = dbMock({ question: null, mistake: null });
    const service = new PracticeService(db.service as never);

    await expect(service.submit({ questionId: questionId(), submittedAnswers: ["A"] }, identity())).rejects.toThrow(
      NotFoundException
    );
    expect(db.client.insert).not.toHaveBeenCalled();
  });

  it.each([
    { body: null, label: "null body" },
    { body: undefined, label: "undefined body" },
    { body: "not-object", label: "non-object body" },
    { body: { questionId: questionId(), submittedAnswers: [] }, label: "empty answers" },
    { body: { questionId: questionId(), submittedAnswers: ["A", "A"] }, label: "duplicate answers" },
    { body: { questionId: questionId(), submittedAnswers: ["A"], durationSec: "12abc" }, label: "partial duration" },
    { body: { questionId: questionId(), submittedAnswers: ["A"], durationSec: 2147483648 }, label: "duration above database int" },
    {
      body: { questionId: questionId(), submittedAnswers: ["A"], durationSec: "2147483648" },
      label: "numeric string duration above database int"
    },
    {
      body: { questionId: questionId(), submittedAnswers: ["A"], durationSec: "999999999999999999999999999999999999" },
      label: "numeric string duration above safe integer range"
    },
    { body: { questionId: "not-a-uuid", submittedAnswers: ["A"] }, label: "invalid question id" }
  ])("rejects invalid practice submissions: $label", async ({ body }) => {
    const db = dbMock({ question: questionRecord(), mistake: null });
    const service = new PracticeService(db.service as never);

    await expect(service.submit(body as never, identity())).rejects.toThrow(BadRequestException);
    expect(db.client.insert).not.toHaveBeenCalled();
  });

  it("rejects submitted answers that are not valid option keys for the question", async () => {
    const db = dbMock({ question: questionRecord(), mistake: null });
    const service = new PracticeService(db.service as never);

    await expect(service.submit({ questionId: questionId(), submittedAnswers: ["Z"] }, identity())).rejects.toThrow(
      BadRequestException
    );
    expect(db.client.insert).not.toHaveBeenCalled();
  });

  it("rejects invalid persisted question answer definitions before scoring", async () => {
    const db = dbMock({
      question: questionRecord({ options: [{ key: "A", text: "Only one option" }], correctAnswers: ["A"] }),
      mistake: null
    });
    const service = new PracticeService(db.service as never);

    await expect(service.submit({ questionId: questionId(), submittedAnswers: ["A"] }, identity())).rejects.toThrow(
      InternalServerErrorException
    );
    expect(db.client.insert).not.toHaveBeenCalled();
  });

  it("uses a serializable transaction and retries write conflicts", async () => {
    const firstConflict = Object.assign(new Error("serialization failure"), { code: "40001" });
    const db = dbMock({
      question: questionRecord({ correctAnswers: ["B"] }),
      mistake: mistakeRecord({ consecutiveCorrectCount: 2, isMastered: false }),
      updatedMistake: mistakeRecord({ consecutiveCorrectCount: 3, isMastered: true }),
      transactionErrors: [firstConflict]
    });
    const service = new PracticeService(db.service as never);

    await expect(service.submit({ questionId: questionId(), submittedAnswers: ["B"] }, identity())).resolves.toMatchObject({
      isCorrect: true,
      masteryStatus: { code: "mastered" }
    });

    expect(db.client.transaction).toHaveBeenCalledTimes(2);
  });
});

function identity(): RequestIdentity {
  return { ip: "10.0.0.5", role: "learner", roleLabel: "learner", permissions: [] };
}

function dbMock(options: { question: unknown; mistake: unknown; updatedMistake?: unknown; transactionErrors?: unknown[] }) {
  return drizzleMock({
    select: [
      [{ id: "v1", ip: "10.0.0.5" }],
      options.question === null ? [] : [options.question],
      options.updatedMistake !== undefined ? [options.updatedMistake] : options.mistake === null ? [] : [options.mistake]
    ],
    insert: [[{ id: "attempt1" }], [mistakeRecord({ wrongCount: 1 })]],
    update: [[], options.mistake === null ? [] : [{ id: "m1" }], []],
    transactionErrors: options.transactionErrors
  });
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

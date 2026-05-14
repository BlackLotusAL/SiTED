import type { RequestIdentity } from "../identity/identity.service";
import { drizzleMock } from "../testing/drizzle-mock";
import { ReviewService } from "./review.service";

describe("ReviewService", () => {
  it("returns mistakes for the current visitor with distinct mastery status labels and colors from whitelisted question fields", async () => {
    const db = drizzleMock({
      select: [
        [{ id: "v1" }],
        [
          mistakeRecord({ id: "m1", questionId: "q1", consecutiveCorrectCount: 0, isMastered: false }),
          mistakeRecord({ id: "m2", questionId: "q2", consecutiveCorrectCount: 2, isMastered: false }),
          mistakeRecord({ id: "m3", questionId: "q3", consecutiveCorrectCount: 3, isMastered: true })
        ]
      ]
    });
    const service = new ReviewService(db.service as never);

    const result = await service.listMistakes(identity());

    expect(db.client.select).toHaveBeenCalledTimes(2);
    expect(result.items.map((item) => item.masteryStatus)).toEqual([
      { code: "unmastered", label: "\u672a\u638c\u63e1", color: "danger" },
      { code: "consecutive_correct_2", label: "\u8fde\u7eed\u7b54\u5bf9 2 \u6b21", color: "warning" },
      { code: "mastered", label: "\u5df2\u638c\u63e1", color: "success" }
    ]);
    expect(JSON.stringify(result)).not.toContain("correctAnswers");
    expect(JSON.stringify(result)).not.toContain("createdByIp");
    expect(JSON.stringify(result)).not.toContain("options");
  });

  it("returns bookmarked questions for the current visitor without leaking raw answer fields", async () => {
    const db = drizzleMock({
      select: [[{ id: "v1" }], [{ id: "b1", questionId: "q1", note: null, tags: [], createdAt: now(), question: questionRecord() }]]
    });
    const service = new ReviewService(db.service as never);

    const result = await service.listBookmarks(identity());

    expect(db.client.select).toHaveBeenCalledTimes(2);
    expect(result.items[0]).toMatchObject({
      id: "b1",
      questionId: "q1",
      question: { id: "q1", subject: "programming", language: "java", level: "working", type: "single" }
    });
    expect(JSON.stringify(result)).not.toContain("correctAnswers");
    expect(JSON.stringify(result)).not.toContain("createdByIp");
    expect(JSON.stringify(result)).not.toContain("options");
  });

  it("returns only exam records for the current visitor and does not query single-question practice attempts", async () => {
    const db = drizzleMock({
      select: [
        [{ id: "v1" }],
        [
        {
          id: "ea1",
          subject: "programming",
          language: "java",
          level: "working",
          status: "submitted",
          scorePercent: "88.50",
          isPassed: true,
          startedAt: now(),
          deadlineAt: now(),
          submittedAt: now()
        }
        ]
      ]
    });
    const service = new ReviewService(db.service as never);

    const result = await service.listRecords(identity());

    expect(db.client.select).toHaveBeenCalledTimes(2);
    expect(result.items[0]).toMatchObject({
      kind: "exam",
      id: "ea1",
      status: "submitted",
      scorePercent: 88.5,
      isPassed: true
    });
    expect(JSON.stringify(result)).not.toContain("pa1");
    expect(JSON.stringify(result)).not.toContain("correctAnswers");
    expect(JSON.stringify(result)).not.toContain("createdByIp");
    expect(JSON.stringify(result)).not.toContain("options");
  });

  it("returns empty review collections for a visitor that has no persisted visitor row", async () => {
    const db = drizzleMock({ select: [[], [], []] });
    const service = new ReviewService(db.service as never);

    await expect(service.listMistakes(identity())).resolves.toEqual({ items: [] });
    await expect(service.listBookmarks(identity())).resolves.toEqual({ items: [] });
    await expect(service.listRecords(identity())).resolves.toEqual({ items: [] });
  });

  it("marks only the current visitor mistake mastered and returns the updated mastery status", async () => {
    const db = drizzleMock({
      select: [[{ id: "v1" }], [mistakeRecord({ id: "m1", consecutiveCorrectCount: 1, isMastered: false })]],
      update: [[mistakeRecord({ id: "m1", consecutiveCorrectCount: 3, isMastered: true, masteredAt: now() })]]
    });
    const service = new ReviewService(db.service as never);

    const result = await service.updateMistakeMastery("m1", { isMastered: true }, identity());

    const updateBuilder = db.client.update.mock.results[0].value as { set: jest.Mock };
    expect(updateBuilder.set).toHaveBeenCalledWith(expect.objectContaining({ isMastered: true, consecutiveCorrectCount: 3 }));
    expect(result.masteryStatus).toEqual({ code: "mastered", label: "\u5df2\u638c\u63e1", color: "success" });
  });

  it("cancels mastery for only the current visitor mistake", async () => {
    const db = drizzleMock({
      select: [[{ id: "v1" }], [mistakeRecord({ id: "m1", consecutiveCorrectCount: 3, isMastered: true })]],
      update: [[mistakeRecord({ id: "m1", consecutiveCorrectCount: 0, isMastered: false, masteredAt: null })]]
    });
    const service = new ReviewService(db.service as never);

    const result = await service.updateMistakeMastery("m1", { isMastered: false }, identity());

    const updateBuilder = db.client.update.mock.results[0].value as { set: jest.Mock };
    expect(updateBuilder.set).toHaveBeenCalledWith(expect.objectContaining({ isMastered: false, masteredAt: null, consecutiveCorrectCount: 0 }));
    expect(result.masteryStatus).toEqual({ code: "unmastered", label: "\u672a\u638c\u63e1", color: "danger" });
  });

  it("removes only the current visitor mistake idempotently", async () => {
    const db = drizzleMock({ select: [[{ id: "v1" }]], delete: [[{ id: "m1" }]] });
    const service = new ReviewService(db.service as never);

    const result = await service.removeMistake("m1", identity());

    expect(db.client.delete).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ deleted: true });
  });
});

function identity(): RequestIdentity {
  return { ip: "10.0.0.5", role: "learner", roleLabel: "learner", permissions: [] };
}

function mistakeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    visitorId: "v1",
    questionId: "q1",
    wrongCount: 1,
    consecutiveCorrectCount: 0,
    isMastered: false,
    lastWrongAt: now(),
    masteredAt: null,
    updatedAt: now(),
    question: questionRecord(overrides.question as Record<string, unknown> | undefined),
    ...overrides
  };
}

function questionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "q1",
    sourceCode: "SRC-1",
    subject: "programming",
    language: "java",
    level: "working",
    type: "single",
    stemMd: "stem",
    memo: "memo",
    tags: ["collections"],
    totalAttempts: 2,
    correctAttempts: 1,
    status: "published",
    correctAnswers: ["B"],
    options: [{ key: "B", text: "Option B" }],
    createdByIp: "10.0.0.9",
    ...overrides
  };
}

function now() {
  return new Date("2026-05-03T10:00:00.000Z");
}

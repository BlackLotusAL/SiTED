import type { RequestIdentity } from "../identity/identity.service";
import { ReviewService } from "./review.service";

describe("ReviewService", () => {
  it("returns mistakes for the current visitor with distinct mastery status labels and colors from whitelisted question fields", async () => {
    const prisma = prismaMock({
      mistakes: [
        mistakeRecord({ id: "m1", questionId: "q1", consecutiveCorrectCount: 0, isMastered: false }),
        mistakeRecord({ id: "m2", questionId: "q2", consecutiveCorrectCount: 2, isMastered: false }),
        mistakeRecord({ id: "m3", questionId: "q3", consecutiveCorrectCount: 3, isMastered: true })
      ]
    });
    const service = new ReviewService(prisma as never);

    const result = await service.listMistakes(identity());

    expect(prisma.visitor.findUnique).toHaveBeenCalledWith({ where: { ip: "10.0.0.5" }, select: { id: true } });
    expect(prisma.mistake.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { visitorId: "v1" },
        select: expect.objectContaining({
          id: true,
          question: { select: questionSelect() }
        }),
        orderBy: [{ isMastered: "asc" }, { lastWrongAt: "desc" }, { updatedAt: "desc" }]
      })
    );
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
    const prisma = prismaMock({
      bookmarks: [{ id: "b1", questionId: "q1", note: null, tags: [], createdAt: now(), question: questionRecord() }]
    });
    const service = new ReviewService(prisma as never);

    const result = await service.listBookmarks(identity());

    expect(prisma.bookmark.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { visitorId: "v1" },
        select: expect.objectContaining({
          id: true,
          question: { select: questionSelect() }
        }),
        orderBy: { createdAt: "desc" }
      })
    );
    expect(result.items[0]).toMatchObject({
      id: "b1",
      questionId: "q1",
      question: { id: "q1", subject: "programming", language: "java", level: "working", type: "single" }
    });
    expect(JSON.stringify(result)).not.toContain("correctAnswers");
    expect(JSON.stringify(result)).not.toContain("createdByIp");
    expect(JSON.stringify(result)).not.toContain("options");
  });

  it("returns practice and exam records for the current visitor without creating or scoring exams", async () => {
    const prisma = prismaMock({
      practiceAttempts: [
        {
          id: "pa1",
          questionId: "q1",
          selectedKeys: ["B"],
          isCorrect: true,
          mode: "practice",
          durationSec: 9,
          createdAt: now(),
          question: questionRecord()
        }
      ],
      examAttempts: [
        {
          id: "ea1",
          subject: "programming",
          language: "java",
          level: "working",
          status: "submitted",
          scorePercent: { toString: () => "88.50" },
          isPassed: true,
          startedAt: now(),
          deadlineAt: now(),
          submittedAt: now()
        }
      ]
    });
    const service = new ReviewService(prisma as never);

    const result = await service.listRecords(identity());

    expect(prisma.practiceAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { visitorId: "v1" },
        select: expect.objectContaining({
          id: true,
          question: { select: questionSelect() }
        })
      })
    );
    expect(prisma.examAttempt.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { visitorId: "v1" } }));
    expect(result.practice.items[0]).toMatchObject({ kind: "practice", id: "pa1", isCorrect: true });
    expect(result.exams.items[0]).toMatchObject({
      kind: "exam",
      id: "ea1",
      status: "submitted",
      scorePercent: 88.5,
      isPassed: true
    });
    expect(JSON.stringify(result.practice)).not.toContain("correctAnswers");
    expect(JSON.stringify(result.practice)).not.toContain("createdByIp");
    expect(JSON.stringify(result.practice)).not.toContain("options");
  });

  it("returns empty review collections for a visitor that has no persisted visitor row", async () => {
    const prisma = prismaMock({ visitor: null });
    const service = new ReviewService(prisma as never);

    await expect(service.listMistakes(identity())).resolves.toEqual({ items: [] });
    await expect(service.listBookmarks(identity())).resolves.toEqual({ items: [] });
    await expect(service.listRecords(identity())).resolves.toEqual({ practice: { items: [] }, exams: { items: [] } });
  });
});

function identity(): RequestIdentity {
  return { ip: "10.0.0.5", role: "learner", roleLabel: "learner", permissions: [] };
}

function prismaMock(
  overrides: {
    visitor?: unknown;
    mistakes?: unknown[];
    bookmarks?: unknown[];
    practiceAttempts?: unknown[];
    examAttempts?: unknown[];
  } = {}
) {
  return {
    visitor: {
      findUnique: jest.fn().mockResolvedValue(overrides.visitor === undefined ? { id: "v1" } : overrides.visitor)
    },
    mistake: {
      findMany: jest.fn().mockResolvedValue(overrides.mistakes ?? [])
    },
    bookmark: {
      findMany: jest.fn().mockResolvedValue(overrides.bookmarks ?? [])
    },
    practiceAttempt: {
      findMany: jest.fn().mockResolvedValue(overrides.practiceAttempts ?? [])
    },
    examAttempt: {
      findMany: jest.fn().mockResolvedValue(overrides.examAttempts ?? [])
    }
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

function questionSelect() {
  return {
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
  };
}

function now() {
  return new Date("2026-05-03T10:00:00.000Z");
}

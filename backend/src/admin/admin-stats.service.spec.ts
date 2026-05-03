import { AdminStatsService } from "./admin-stats.service";

describe("AdminStatsService", () => {
  it("returns question totals, subject distribution, low-correct-rate top 10, today's counts, and split seven-day trends", async () => {
    const prisma = prismaMock();
    const service = new AdminStatsService(prisma as never, () => new Date("2026-05-03T12:00:00.000Z"));

    const stats = await service.getStats();

    expect(stats.questions).toEqual({
      total: 42,
      published: 30,
      bySubject: [
        { subject: "programming", count: 18 },
        { subject: "security_privacy", count: 9 },
        { subject: "refactoring", count: 0 }
      ]
    });
    expect(stats.lowCorrectRateQuestions).toHaveLength(2);
    expect(stats.lowCorrectRateQuestions[0]).toEqual(
      expect.objectContaining({
        id: "q-low",
        sourceCode: "SRC-LOW",
        totalAttempts: 10,
        correctAttempts: 2,
        correctRate: 20
      })
    );
    expect(stats.today).toEqual({ visitors: 3, practiceQuestions: 7, exams: 2 });
    expect(stats.trends).toEqual({
      visitors: expect.arrayContaining([{ date: "2026-05-03", count: 3 }]),
      practiceQuestions: expect.arrayContaining([{ date: "2026-05-03", count: 7 }]),
      exams: expect.arrayContaining([{ date: "2026-05-03", count: 2 }])
    });
    expect(stats.trends.visitors).toHaveLength(7);
    expect(stats.trends.practiceQuestions).toHaveLength(7);
    expect(stats.trends.exams).toHaveLength(7);
    expect(prisma.question.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { totalAttempts: { gt: 0 } },
        orderBy: [{ totalAttempts: "desc" }, { updatedAt: "desc" }],
        take: 100
      })
    );
  });
});

function prismaMock() {
  return {
    question: {
      count: jest.fn(async ({ where }: { where?: { status?: string } } = {}) => (where?.status === "published" ? 30 : 42)),
      groupBy: jest.fn().mockResolvedValue([
        { subject: "programming", _count: { _all: 18 } },
        { subject: "security_privacy", _count: { _all: 9 } }
      ]),
      findMany: jest.fn().mockResolvedValue([
        questionRecord({ id: "q-high", sourceCode: "SRC-HIGH", totalAttempts: 20, correctAttempts: 18 }),
        questionRecord({ id: "q-low", sourceCode: "SRC-LOW", totalAttempts: 10, correctAttempts: 2 })
      ])
    },
    visitor: {
      count: jest.fn().mockResolvedValue(3),
      groupBy: jest.fn().mockResolvedValue([{ lastSeenAt: new Date("2026-05-03T03:00:00.000Z"), _count: { _all: 3 } }])
    },
    practiceAttempt: {
      count: jest.fn().mockResolvedValue(7),
      groupBy: jest.fn().mockResolvedValue([{ createdAt: new Date("2026-05-03T03:00:00.000Z"), _count: { _all: 7 } }])
    },
    examAttempt: {
      count: jest.fn().mockResolvedValue(2),
      groupBy: jest.fn().mockResolvedValue([{ startedAt: new Date("2026-05-03T03:00:00.000Z"), _count: { _all: 2 } }])
    }
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
    stemMd: "Stem",
    totalAttempts: 10,
    correctAttempts: 5,
    updatedAt: new Date("2026-05-03T00:00:00.000Z"),
    ...overrides
  };
}

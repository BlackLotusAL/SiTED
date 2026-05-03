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
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(4);
    expect(prisma.question.findMany).not.toHaveBeenCalled();
    expect(prisma.visitor.groupBy).not.toHaveBeenCalled();
    expect(prisma.practiceAttempt.groupBy).not.toHaveBeenCalled();
    expect(prisma.examAttempt.groupBy).not.toHaveBeenCalled();
  });

  it("does not lose low-correct-rate questions outside the first 100 most-attempted rows", async () => {
    const prisma = prismaMock();
    prisma.$queryRaw.mockReset();
    prisma.$queryRaw
      .mockResolvedValueOnce([questionRecord({ id: "q-rare-low", totalAttempts: 1, correctAttempts: 0 })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const service = new AdminStatsService(prisma as never, () => new Date("2026-05-03T12:00:00.000Z"));

    const stats = await service.getStats();

    expect(stats.lowCorrectRateQuestions).toEqual([expect.objectContaining({ id: "q-rare-low", correctRate: 0 })]);
    expect(prisma.$queryRaw.mock.calls[0][0].sql).toContain("ORDER BY");
    expect(prisma.$queryRaw.mock.calls[0][0].sql).toContain("LIMIT 10");
  });

  it("aggregates trends in the Asia/Hong_Kong business timezone instead of grouping every raw timestamp", async () => {
    const prisma = prismaMock();
    const service = new AdminStatsService(prisma as never, () => new Date("2026-05-03T16:30:00.000Z"));

    await service.getStats();

    const trendSql = prisma.$queryRaw.mock.calls[1][0].sql as string;
    expect(trendSql).toContain("Asia/Hong_Kong");
    expect(trendSql).toContain("AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Hong_Kong'");
    expect(trendSql).toContain("date_trunc");
    expect(prisma.visitor.count).toHaveBeenCalledWith({
      where: {
        lastSeenAt: {
          gte: new Date("2026-05-03T16:00:00.000Z"),
          lt: new Date("2026-05-04T16:00:00.000Z")
        }
      }
    });
    expect(prisma.visitor.groupBy).not.toHaveBeenCalled();
  });

  it("preserves exact database low-rate ordering when displayed rounded percentages tie", async () => {
    const prisma = prismaMock();
    prisma.$queryRaw.mockReset();
    prisma.$queryRaw
      .mockResolvedValueOnce([
        questionRecord({ id: "q-exact-lower", totalAttempts: 100, correctAttempts: 33 }),
        questionRecord({ id: "q-rounded-tie", totalAttempts: 1000, correctAttempts: 334 })
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const service = new AdminStatsService(prisma as never, () => new Date("2026-05-03T12:00:00.000Z"));

    const stats = await service.getStats();

    expect(stats.lowCorrectRateQuestions.map((question) => question.id)).toEqual(["q-exact-lower", "q-rounded-tie"]);
    expect(stats.lowCorrectRateQuestions.map((question) => question.correctRate)).toEqual([33, 33]);
  });
});

function prismaMock() {
  return {
    $queryRaw: jest
      .fn()
      .mockResolvedValueOnce([
        questionRecord({ id: "q-low", sourceCode: "SRC-LOW", totalAttempts: 10, correctAttempts: 2 }),
        questionRecord({ id: "q-high", sourceCode: "SRC-HIGH", totalAttempts: 20, correctAttempts: 18 })
      ])
      .mockResolvedValueOnce([{ date: "2026-05-03", count: 3 }])
      .mockResolvedValueOnce([{ date: "2026-05-03", count: 7 }])
      .mockResolvedValueOnce([{ date: "2026-05-03", count: 2 }]),
    question: {
      count: jest.fn(async ({ where }: { where?: { status?: string } } = {}) => (where?.status === "published" ? 30 : 42)),
      groupBy: jest.fn().mockResolvedValue([
        { subject: "programming", _count: { _all: 18 } },
        { subject: "security_privacy", _count: { _all: 9 } }
      ]),
      findMany: jest.fn()
    },
    visitor: {
      count: jest.fn().mockResolvedValue(3),
      groupBy: jest.fn()
    },
    practiceAttempt: {
      count: jest.fn().mockResolvedValue(7),
      groupBy: jest.fn()
    },
    examAttempt: {
      count: jest.fn().mockResolvedValue(2),
      groupBy: jest.fn()
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

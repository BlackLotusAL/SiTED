import { ConflictException, NotFoundException } from "@nestjs/common";
import { MarkdownService } from "./markdown.service";
import { QuestionsService } from "./questions.service";

describe("QuestionsService", () => {
  it("lists only published questions with filters, keyword, tag matching, and pagination", async () => {
    const prisma = {
      question: {
        findMany: jest.fn().mockResolvedValue([questionRecord({ id: "q1", tags: ["collections"] })]),
        count: jest.fn().mockResolvedValue(1)
      }
    };
    const service = new QuestionsService(prisma as never, markdownStub());

    const result = await service.listPublic({
      subject: "programming",
      language: "java",
      level: "working",
      type: "single",
      tags: "collections,threading",
      keyword: "ConcurrentHashMap",
      page: "2",
      pageSize: "10"
    });

    expect(prisma.question.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "published",
          subject: "programming",
          language: "java",
          level: "working",
          type: "single",
          tags: { hasEvery: ["collections", "threading"] },
          OR: [
            { stemMd: { contains: "ConcurrentHashMap", mode: "insensitive" } },
            { explanationMd: { contains: "ConcurrentHashMap", mode: "insensitive" } },
            { memo: { contains: "ConcurrentHashMap", mode: "insensitive" } },
            { sourceCode: { contains: "ConcurrentHashMap", mode: "insensitive" } }
          ]
        }),
        skip: 10,
        take: 10
      })
    );
    expect(result).toMatchObject({ page: 2, pageSize: 10, total: 1 });
    expect(result.items[0]).toMatchObject({
      id: "q1",
      correctRate: 50,
      totalAttempts: 4,
      correctAttempts: 2
    });
  });

  it("returns sanitized public detail for published questions and hides unpublished ones", async () => {
    const prisma = {
      question: {
        findFirst: jest.fn().mockResolvedValue(questionRecord({ status: "published" }))
      }
    };
    const markdown = markdownStub();
    const service = new QuestionsService(prisma as never, markdown);

    const detail = await service.getPublicDetail("q1");

    expect(prisma.question.findFirst).toHaveBeenCalledWith({ where: { id: "q1", status: "published" } });
    expect(markdown.render).toHaveBeenCalledWith("stem **md**");
    expect(detail).toMatchObject({
      id: "q1",
      stemHtml: "<p>safe</p>",
      explanationHtml: "<p>safe</p>",
      source: { subject: "programming", language: "java", level: "working", type: "single", sourceCode: "SRC-1" },
      options: [
        { key: "A", text: "ArrayList" },
        { key: "B", text: "ConcurrentHashMap" }
      ],
      tags: ["collections"],
      stats: { totalAttempts: 4, correctAttempts: 2, correctRate: 50 }
    });

    prisma.question.findFirst.mockResolvedValueOnce(null);
    await expect(service.getPublicDetail("draft-id")).rejects.toThrow(NotFoundException);
  });

  it("creates admin drafts with normalized answers and returns raw markdown plus preview for admin detail", async () => {
    const prisma = {
      question: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...questionRecord({ id: "created" }), ...data })),
        findUnique: jest.fn().mockResolvedValue(questionRecord({ status: "draft" }))
      }
    };
    const service = new QuestionsService(prisma as never, markdownStub());

    const created = await service.createAdmin(
      {
        subject: "programming",
        language: "java",
        level: "working",
        type: "single",
        stemMd: "stem **md**",
        options: [
          { key: "A", text: "ArrayList", isCorrect: false },
          { key: "B", text: "ConcurrentHashMap", isCorrect: true }
        ],
        explanationMd: "explanation",
        memo: "memo",
        tags: [" collections ", "collections", "threading"],
        sourceCode: "SRC-1"
      },
      "10.0.0.5"
    );

    expect(prisma.question.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          correctAnswers: ["B"],
          createdByIp: "10.0.0.5",
          status: "draft",
          tags: ["collections", "threading"]
        })
      })
    );
    expect(created.id).toBe("created");

    const detail = await service.getAdminDetail("q1");

    expect(detail).toMatchObject({
      stemMd: "stem **md**",
      stemHtml: "<p>safe</p>",
      explanationMd: "explanation",
      explanationHtml: "<p>safe</p>"
    });
  });

  it("maps duplicate sourceCode create and update failures to conflict responses", async () => {
    const duplicateError = { code: "P2002", meta: { target: ["sourceCode"] } };
    const prisma = {
      question: {
        create: jest.fn().mockRejectedValue(duplicateError),
        findUnique: jest.fn().mockResolvedValue(questionRecord({ status: "draft" })),
        update: jest.fn().mockRejectedValue(duplicateError)
      }
    };
    const service = new QuestionsService(prisma as never, markdownStub());

    await expect(service.createAdmin(validQuestionInput(), "10.0.0.5")).rejects.toThrow(ConflictException);
    await expect(service.updateAdmin("q1", { sourceCode: "SRC-1" })).rejects.toThrow(ConflictException);
  });

  it("archives missing questions with a unified not found response", async () => {
    const prisma = {
      question: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn()
      }
    };
    const service = new QuestionsService(prisma as never, markdownStub());

    await expect(service.archiveAdmin("missing")).rejects.toThrow(NotFoundException);
    expect(prisma.question.update).not.toHaveBeenCalled();
  });

  it("uses explicit admin status transitions for publish and archive", async () => {
    const prisma = {
      question: {
        findUnique: jest.fn().mockResolvedValue(questionRecord({ status: "draft" })),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve(questionRecord({ status: data.status })))
      }
    };
    const service = new QuestionsService(prisma as never, markdownStub());

    await service.publishAdmin("q1");
    await service.archiveAdmin("q1");

    expect(prisma.question.update).toHaveBeenNthCalledWith(1, { where: { id: "q1" }, data: { status: "published" } });
    expect(prisma.question.update).toHaveBeenNthCalledWith(2, { where: { id: "q1" }, data: { status: "archived" } });
  });
});

function validQuestionInput(overrides: Record<string, unknown> = {}) {
  return {
    subject: "programming",
    language: "java",
    level: "working",
    type: "single",
    stemMd: "stem **md**",
    options: [
      { key: "A", text: "ArrayList", isCorrect: false },
      { key: "B", text: "ConcurrentHashMap", isCorrect: true }
    ],
    explanationMd: "explanation",
    memo: "memo",
    tags: ["collections"],
    sourceCode: "SRC-1",
    ...overrides
  };
}

function questionRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "q1",
    sourceCode: "SRC-1",
    subject: "programming",
    language: "java",
    level: "working",
    type: "single",
    stemMd: "stem **md**",
    options: [
      { key: "A", text: "ArrayList", isCorrect: false },
      { key: "B", text: "ConcurrentHashMap", isCorrect: true }
    ],
    correctAnswers: ["B"],
    explanationMd: "explanation",
    memo: "memo",
    tags: ["collections"],
    totalAttempts: 4,
    correctAttempts: 2,
    status: "published",
    createdAt: new Date("2026-05-03T00:00:00.000Z"),
    updatedAt: new Date("2026-05-03T00:00:00.000Z"),
    ...overrides
  };
}

function markdownStub(): MarkdownService {
  return {
    render: jest.fn().mockReturnValue("<p>safe</p>")
  } as never;
}

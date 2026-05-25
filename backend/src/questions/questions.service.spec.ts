import { ConflictException, NotFoundException } from "@nestjs/common";
import { drizzleMock } from "../testing/drizzle-mock";
import { MarkdownService } from "./markdown.service";
import { QuestionsService } from "./questions.service";

describe("QuestionsService", () => {
  it("lists only published questions with filters, keyword, tag matching, and pagination", async () => {
    const db = drizzleMock({ select: [[{ value: 1 }], [questionRecord({ id: "q1", tags: ["collections"] })]] });
    const service = new QuestionsService(db.service as never, markdownStub());

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

    expect(db.client.select).toHaveBeenCalledTimes(2);
    const listBuilder = db.client.select.mock.results[0]?.value as { orderBy: jest.Mock; offset: jest.Mock; limit: jest.Mock };
    expect(listBuilder.orderBy).toHaveBeenCalledWith(expect.anything(), expect.anything());
    expect(listBuilder.offset).toHaveBeenCalledWith(10);
    expect(listBuilder.limit).toHaveBeenCalledWith(10);
    expect(result).toMatchObject({ page: 2, pageSize: 10, total: 1 });
    expect(result.items[0]).toMatchObject({
      id: "q1",
      correctRate: 50,
      totalAttempts: 4,
      correctAttempts: 2
    });
  });

  it("returns sanitized public detail for published questions and hides unpublished ones", async () => {
    const db = drizzleMock({ select: [[questionRecord({ status: "published" })], []] });
    const markdown = markdownStub();
    const service = new QuestionsService(db.service as never, markdown);

    const detail = await service.getPublicDetail("q1");

    expect(db.client.select).toHaveBeenCalled();
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
    expect(detail).not.toHaveProperty("correctAnswers");

    await expect(service.getPublicDetail("draft-id")).rejects.toThrow(NotFoundException);
  });

  it("returns recite detail with correct answers only for published questions", async () => {
    const db = drizzleMock({ select: [[questionRecord({ status: "published" })], []] });
    const service = new QuestionsService(db.service as never, markdownStub());

    const detail = await service.getReciteDetail("q1");

    expect(db.client.select).toHaveBeenCalled();
    expect(detail).toMatchObject({
      id: "q1",
      stemHtml: "<p>safe</p>",
      explanationHtml: "<p>safe</p>",
      correctAnswers: ["B"],
      options: [
        { key: "A", text: "ArrayList" },
        { key: "B", text: "ConcurrentHashMap" }
      ]
    });

    await expect(service.getReciteDetail("draft-id")).rejects.toThrow(NotFoundException);
  });

  it("creates admin drafts with normalized answers and returns raw markdown plus preview for admin detail", async () => {
    const db = drizzleMock({
      insert: [[questionRecord({ id: "created", status: "draft", tags: ["collections", "threading"] })]],
      select: [[questionRecord({ status: "draft" })]]
    });
    const service = new QuestionsService(db.service as never, markdownStub());

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

    expect(db.client.insert).toHaveBeenCalledTimes(1);
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
    const duplicateError = Object.assign(new Error("duplicate"), { code: "23505" });
    const db = drizzleMock({
      insert: [duplicateError],
      select: [[questionRecord({ status: "draft" })]],
      update: [duplicateError]
    });
    const service = new QuestionsService(db.service as never, markdownStub());

    await expect(service.createAdmin(validQuestionInput(), "10.0.0.5")).rejects.toThrow(ConflictException);
    await expect(service.updateAdmin("q1", { sourceCode: "SRC-1" })).rejects.toThrow(ConflictException);
  });

  it("archives missing questions with a unified not found response", async () => {
    const db = drizzleMock({ select: [[]] });
    const service = new QuestionsService(db.service as never, markdownStub());

    await expect(service.archiveAdmin("missing")).rejects.toThrow(NotFoundException);
    expect(db.client.update).not.toHaveBeenCalled();
  });

  it("uses explicit admin status transitions for publish and archive", async () => {
    const db = drizzleMock({
      select: [[questionRecord({ status: "draft" })], [questionRecord({ status: "draft" })]],
      update: [[questionRecord({ status: "published" })], [questionRecord({ status: "archived" })]]
    });
    const service = new QuestionsService(db.service as never, markdownStub());

    await service.publishAdmin("q1");
    await service.archiveAdmin("q1");

    expect(db.client.update).toHaveBeenCalledTimes(2);
  });

  it("maps publish and archive disappeared rows to unified not found responses", async () => {
    const db = drizzleMock({
      select: [[questionRecord({ status: "draft" })], [questionRecord({ status: "draft" })]],
      update: [[], []]
    });
    const service = new QuestionsService(db.service as never, markdownStub());

    await expect(service.publishAdmin("q1")).rejects.toThrow(NotFoundException);
    await expect(service.archiveAdmin("q1")).rejects.toThrow(NotFoundException);
  });

  it("hard deletes questions and direct linked records in one transaction", async () => {
    const db = drizzleMock({
      select: [[questionRecord({ id: "q1" })]],
      delete: [[{ id: "b1" }, { id: "b2" }], [{ id: "m1" }], [{ id: "p1" }, { id: "p2" }, { id: "p3" }], [{ id: "q1" }]]
    });
    const service = new QuestionsService(db.service as never, markdownStub());

    const result = await service.deleteAdmin("q1");

    expect(db.client.transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(db.client.delete).toHaveBeenCalledTimes(4);
    expect(result).toEqual({
      deleted: true,
      id: "q1",
      deletedRecords: { bookmarks: 2, mistakes: 1, practiceAttempts: 3 }
    });
  });

  it("rejects hard deletes for missing questions without deleting linked records", async () => {
    const db = drizzleMock({ select: [[]] });
    const service = new QuestionsService(db.service as never, markdownStub());

    await expect(service.deleteAdmin("missing")).rejects.toThrow(NotFoundException);
    expect(db.client.delete).not.toHaveBeenCalled();
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

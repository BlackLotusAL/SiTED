import { NotFoundException } from "@nestjs/common";
import type { RequestIdentity } from "../identity/identity.service";
import { BookmarksService } from "./bookmarks.service";

describe("BookmarksService", () => {
  it("creates a bookmark for the current visitor and only for published questions", async () => {
    const prisma = prismaMock({ question: questionRecord() });
    const service = new BookmarksService(prisma as never);

    const result = await service.add(questionId(), identity());

    expect(prisma.question.findFirst).toHaveBeenCalledWith({ where: { id: questionId(), status: "published" } });
    expect(prisma.bookmark.upsert).toHaveBeenCalledWith({
      where: { visitorId_questionId: { visitorId: "v1", questionId: questionId() } },
      create: { visitorId: "v1", questionId: questionId() },
      update: {}
    });
    expect(result).toMatchObject({ id: "b1", questionId: questionId() });
  });

  it("does not create bookmarks for missing, draft, or archived questions", async () => {
    const prisma = prismaMock({ question: null });
    const service = new BookmarksService(prisma as never);

    await expect(service.add(questionId(), identity())).rejects.toThrow(NotFoundException);
    expect(prisma.bookmark.upsert).not.toHaveBeenCalled();
  });

  it("removes only the current visitor bookmark idempotently without requiring a published question", async () => {
    const prisma = prismaMock({ question: null, deleteCount: 0 });
    const service = new BookmarksService(prisma as never);

    const result = await service.remove(questionId(), identity());

    expect(prisma.question.findFirst).not.toHaveBeenCalled();
    expect(prisma.bookmark.deleteMany).toHaveBeenCalledWith({ where: { visitorId: "v1", questionId: questionId() } });
    expect(result).toEqual({ deleted: false });
  });
});

function identity(): RequestIdentity {
  return { ip: "10.0.0.5", role: "learner", roleLabel: "learner", permissions: [] };
}

function prismaMock(overrides: { question: unknown; deleteCount?: number }) {
  return {
    visitor: {
      findUnique: jest.fn().mockResolvedValue({ id: "v1" })
    },
    question: {
      findFirst: jest.fn().mockResolvedValue(overrides.question)
    },
    bookmark: {
      upsert: jest
        .fn()
        .mockResolvedValue({ id: "b1", visitorId: "v1", questionId: questionId(), createdAt: new Date() }),
      deleteMany: jest.fn().mockResolvedValue({ count: overrides.deleteCount ?? 1 })
    }
  };
}

function questionRecord() {
  return { id: questionId(), status: "published" };
}

function questionId() {
  return "11111111-1111-4111-8111-111111111111";
}

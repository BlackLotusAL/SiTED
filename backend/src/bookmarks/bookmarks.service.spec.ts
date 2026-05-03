import { NotFoundException } from "@nestjs/common";
import type { RequestIdentity } from "../identity/identity.service";
import { BookmarksService } from "./bookmarks.service";

describe("BookmarksService", () => {
  it("creates a bookmark for the current visitor and only for published questions", async () => {
    const prisma = prismaMock({ question: questionRecord() });
    const service = new BookmarksService(prisma as never);

    const result = await service.add("q1", identity());

    expect(prisma.question.findFirst).toHaveBeenCalledWith({ where: { id: "q1", status: "published" } });
    expect(prisma.bookmark.upsert).toHaveBeenCalledWith({
      where: { visitorId_questionId: { visitorId: "v1", questionId: "q1" } },
      create: { visitorId: "v1", questionId: "q1" },
      update: {}
    });
    expect(result).toMatchObject({ id: "b1", questionId: "q1" });
  });

  it("does not create bookmarks for missing, draft, or archived questions", async () => {
    const prisma = prismaMock({ question: null });
    const service = new BookmarksService(prisma as never);

    await expect(service.add("draft-id", identity())).rejects.toThrow(NotFoundException);
    expect(prisma.bookmark.upsert).not.toHaveBeenCalled();
  });

  it("removes only the current visitor bookmark after confirming the question is published", async () => {
    const prisma = prismaMock({ question: questionRecord() });
    const service = new BookmarksService(prisma as never);

    const result = await service.remove("q1", identity());

    expect(prisma.bookmark.deleteMany).toHaveBeenCalledWith({ where: { visitorId: "v1", questionId: "q1" } });
    expect(result).toEqual({ deleted: true });
  });
});

function identity(): RequestIdentity {
  return { ip: "10.0.0.5", role: "learner", roleLabel: "learner", permissions: [] };
}

function prismaMock(overrides: { question: unknown }) {
  return {
    visitor: {
      findUnique: jest.fn().mockResolvedValue({ id: "v1" })
    },
    question: {
      findFirst: jest.fn().mockResolvedValue(overrides.question)
    },
    bookmark: {
      upsert: jest.fn().mockResolvedValue({ id: "b1", visitorId: "v1", questionId: "q1", createdAt: new Date() }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 })
    }
  };
}

function questionRecord() {
  return { id: "q1", status: "published" };
}

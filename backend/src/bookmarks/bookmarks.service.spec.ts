import { NotFoundException } from "@nestjs/common";
import type { RequestIdentity } from "../identity/identity.service";
import { drizzleMock } from "../testing/drizzle-mock";
import { BookmarksService } from "./bookmarks.service";

describe("BookmarksService", () => {
  it("creates a bookmark for the current visitor and only for published questions", async () => {
    const db = drizzleMock({
      select: [[questionRecord()], [{ id: "v1" }]],
      insert: [[bookmarkRecord()]]
    });
    const service = new BookmarksService(db.service as never);

    const result = await service.add(questionId(), identity());

    expect(db.client.select).toHaveBeenCalledTimes(2);
    expect(db.client.insert).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ id: "b1", questionId: questionId() });
  });

  it("does not create bookmarks for missing, draft, or archived questions", async () => {
    const db = drizzleMock({ select: [[]] });
    const service = new BookmarksService(db.service as never);

    await expect(service.add(questionId(), identity())).rejects.toThrow(NotFoundException);
    expect(db.client.insert).not.toHaveBeenCalled();
  });

  it("removes only the current visitor bookmark idempotently without requiring a published question", async () => {
    const db = drizzleMock({ select: [[{ id: "v1" }]], delete: [[]] });
    const service = new BookmarksService(db.service as never);

    const result = await service.remove(questionId(), identity());

    expect(db.client.select).toHaveBeenCalledTimes(1);
    expect(db.client.delete).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ deleted: false });
  });

  it("updates note and tags for only the current visitor bookmark with normalized values", async () => {
    const db = drizzleMock({
      select: [[{ id: "v1" }]],
      update: [[bookmarkRecord({ note: "focus later", tags: ["java", "review"] })]]
    });
    const service = new BookmarksService(db.service as never);

    const result = await service.update(questionId(), { note: "  focus later  ", tags: [" java ", "", "review", "java"] }, identity());

    const updateBuilder = db.client.update.mock.results[0].value as { set: jest.Mock };
    expect(updateBuilder.set).toHaveBeenCalledWith(expect.objectContaining({ note: "focus later", tags: ["java", "review"] }));
    expect(result).toMatchObject({ id: "b1", questionId: questionId(), note: "focus later", tags: ["java", "review"] });
  });

  it("stores blank bookmark notes as null", async () => {
    const db = drizzleMock({
      select: [[{ id: "v1" }]],
      update: [[bookmarkRecord({ note: null })]]
    });
    const service = new BookmarksService(db.service as never);

    await service.update(questionId(), { note: "   " }, identity());

    const updateBuilder = db.client.update.mock.results[0].value as { set: jest.Mock };
    expect(updateBuilder.set).toHaveBeenCalledWith(expect.objectContaining({ note: null }));
  });
});

function identity(): RequestIdentity {
  return { ip: "10.0.0.5", role: "learner", roleLabel: "learner", permissions: [] };
}

function questionRecord() {
  return { id: questionId(), status: "published" };
}

function bookmarkRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "b1",
    visitorId: "v1",
    questionId: questionId(),
    note: undefined,
    tags: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

function questionId() {
  return "11111111-1111-4111-8111-111111111111";
}

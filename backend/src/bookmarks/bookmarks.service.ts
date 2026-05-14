import { BadRequestException, Inject, Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DbService } from "../db/db.service";
import { bookmarks, questions, visitors } from "../db/schema";
import type { RequestIdentity } from "../identity/identity.service";

@Injectable()
export class BookmarksService {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  async add(questionId: string, identity: RequestIdentity) {
    await this.ensurePublishedQuestion(questionId);
    const visitor = await this.requireVisitor(identity);

    const [bookmark] = await this.db.client
      .insert(bookmarks)
      .values({ visitorId: visitor.id, questionId, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [bookmarks.visitorId, bookmarks.questionId],
        set: { updatedAt: new Date() }
      })
      .returning();

    return toBookmarkResponse(requireBookmark(bookmark));
  }

  async remove(questionId: string, identity: RequestIdentity) {
    const visitor = await this.requireVisitor(identity);

    const deleted = await this.db.client
      .delete(bookmarks)
      .where(and(eq(bookmarks.visitorId, visitor.id), eq(bookmarks.questionId, questionId)))
      .returning({ id: bookmarks.id });
    return { deleted: deleted.length > 0 };
  }

  async update(questionId: string, input: unknown, identity: RequestIdentity) {
    const visitor = await this.requireVisitor(identity);
    const data = normalizeBookmarkUpdateInput(input);

    const updated = await this.db.client
      .update(bookmarks)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(bookmarks.visitorId, visitor.id), eq(bookmarks.questionId, questionId)))
      .returning();
    if (updated.length === 0) {
      throw new NotFoundException({ code: "BOOKMARK_NOT_FOUND", message: "Bookmark was not found" });
    }

    return toBookmarkResponse(requireBookmark(updated[0]));
  }

  private async ensurePublishedQuestion(questionId: string): Promise<void> {
    const [question] = await this.db.client
      .select({ id: questions.id })
      .from(questions)
      .where(and(eq(questions.id, questionId), eq(questions.status, "published")))
      .limit(1);
    if (question === undefined) {
      throw new NotFoundException({ code: "QUESTION_NOT_FOUND", message: "Question was not found" });
    }
  }

  private async requireVisitor(identity: RequestIdentity): Promise<{ id: string }> {
    const [visitor] = await this.db.client
      .select({ id: visitors.id })
      .from(visitors)
      .where(eq(visitors.ip, identity.ip))
      .limit(1);
    if (visitor === undefined) {
      throw new InternalServerErrorException({ code: "VISITOR_NOT_FOUND", message: "Request visitor was not found" });
    }
    return visitor;
  }
}

function toBookmarkResponse(bookmark: {
  id: string;
  questionId: string;
  note?: string | null;
  tags?: string[];
  createdAt: Date;
  updatedAt?: Date;
}) {
  return {
    id: bookmark.id,
    questionId: bookmark.questionId,
    note: bookmark.note,
    tags: bookmark.tags,
    createdAt: bookmark.createdAt,
    updatedAt: bookmark.updatedAt
  };
}

function normalizeBookmarkUpdateInput(input: unknown): { note?: string | null; tags?: string[] } {
  if (!isRecord(input)) {
    throw invalidBookmarkUpdate("body must be an object");
  }

  const data: { note?: string | null; tags?: string[] } = {};
  if ("note" in input) {
    if (input.note !== null && input.note !== undefined && typeof input.note !== "string") {
      throw invalidBookmarkUpdate("note must be a string or null");
    }
    const trimmedNote = typeof input.note === "string" ? input.note.trim() : "";
    data.note = trimmedNote.length > 0 ? trimmedNote : null;
  }

  if ("tags" in input) {
    if (!Array.isArray(input.tags) || !input.tags.every((tag) => typeof tag === "string")) {
      throw invalidBookmarkUpdate("tags must be an array of strings");
    }
    data.tags = [...new Set(input.tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0))];
  }

  if (!("note" in data) && !("tags" in data)) {
    throw invalidBookmarkUpdate("note or tags is required");
  }

  return data;
}

function invalidBookmarkUpdate(message: string): BadRequestException {
  return new BadRequestException({ code: "INVALID_BOOKMARK_UPDATE", message });
}

function requireBookmark<T>(bookmark: T | undefined): T {
  if (bookmark === undefined) {
    throw new NotFoundException({ code: "BOOKMARK_NOT_FOUND", message: "Bookmark was not found" });
  }
  return bookmark;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

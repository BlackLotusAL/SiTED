import { BadRequestException, Inject, Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import type { RequestIdentity } from "../identity/identity.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class BookmarksService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async add(questionId: string, identity: RequestIdentity) {
    await this.ensurePublishedQuestion(questionId);
    const visitor = await this.requireVisitor(identity);

    const bookmark = await this.prisma.bookmark.upsert({
      where: { visitorId_questionId: { visitorId: visitor.id, questionId } },
      create: { visitorId: visitor.id, questionId },
      update: {}
    });

    return toBookmarkResponse(bookmark);
  }

  async remove(questionId: string, identity: RequestIdentity) {
    const visitor = await this.requireVisitor(identity);

    const result = await this.prisma.bookmark.deleteMany({ where: { visitorId: visitor.id, questionId } });
    return { deleted: result.count > 0 };
  }

  async update(questionId: string, input: unknown, identity: RequestIdentity) {
    const visitor = await this.requireVisitor(identity);
    const data = normalizeBookmarkUpdateInput(input);

    const result = await this.prisma.bookmark.updateMany({
      where: { visitorId: visitor.id, questionId },
      data
    });
    if (result.count === 0) {
      throw new NotFoundException({ code: "BOOKMARK_NOT_FOUND", message: "Bookmark was not found" });
    }

    const bookmark = await this.prisma.bookmark.findUnique({
      where: { visitorId_questionId: { visitorId: visitor.id, questionId } }
    });
    if (bookmark === null) {
      throw new NotFoundException({ code: "BOOKMARK_NOT_FOUND", message: "Bookmark was not found" });
    }

    return toBookmarkResponse(bookmark);
  }

  private async ensurePublishedQuestion(questionId: string): Promise<void> {
    const question = await this.prisma.question.findFirst({ where: { id: questionId, status: "published" } });
    if (question === null) {
      throw new NotFoundException({ code: "QUESTION_NOT_FOUND", message: "Question was not found" });
    }
  }

  private async requireVisitor(identity: RequestIdentity): Promise<{ id: string }> {
    const visitor = await this.prisma.visitor.findUnique({ where: { ip: identity.ip }, select: { id: true } });
    if (visitor === null) {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

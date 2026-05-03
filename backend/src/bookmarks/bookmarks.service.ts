import { Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import type { RequestIdentity } from "../identity/identity.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class BookmarksService {
  constructor(private readonly prisma: PrismaService) {}

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
    await this.ensurePublishedQuestion(questionId);
    const visitor = await this.requireVisitor(identity);

    const result = await this.prisma.bookmark.deleteMany({ where: { visitorId: visitor.id, questionId } });
    return { deleted: result.count > 0 };
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

function toBookmarkResponse(bookmark: { id: string; questionId: string; createdAt: Date; updatedAt?: Date }) {
  return {
    id: bookmark.id,
    questionId: bookmark.questionId,
    createdAt: bookmark.createdAt,
    updatedAt: bookmark.updatedAt
  };
}

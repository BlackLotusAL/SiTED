import { Controller, Delete, Inject, InternalServerErrorException, Param, ParseUUIDPipe, Post, Req } from "@nestjs/common";
import type { IdentityRequest } from "../identity/identity.middleware";
import type { RequestIdentity } from "../identity/identity.service";
import { BookmarksService } from "./bookmarks.service";

@Controller("bookmarks")
export class BookmarksController {
  constructor(@Inject(BookmarksService) private readonly bookmarksService: BookmarksService) {}

  @Post(":questionId")
  add(@Param("questionId", new ParseUUIDPipe({ version: "4" })) questionId: string, @Req() request: IdentityRequest) {
    return this.bookmarksService.add(questionId, requireIdentity(request));
  }

  @Delete(":questionId")
  remove(@Param("questionId", new ParseUUIDPipe({ version: "4" })) questionId: string, @Req() request: IdentityRequest) {
    return this.bookmarksService.remove(questionId, requireIdentity(request));
  }
}

function requireIdentity(request: IdentityRequest): RequestIdentity {
  if (request.identity === undefined) {
    throw new InternalServerErrorException({ code: "IDENTITY_MISSING", message: "Request identity is missing" });
  }
  return request.identity;
}

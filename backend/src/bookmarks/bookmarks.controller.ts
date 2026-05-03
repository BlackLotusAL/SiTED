import { Controller, Delete, InternalServerErrorException, Param, Post, Req } from "@nestjs/common";
import type { IdentityRequest } from "../identity/identity.middleware";
import type { RequestIdentity } from "../identity/identity.service";
import { BookmarksService } from "./bookmarks.service";

@Controller("bookmarks")
export class BookmarksController {
  constructor(private readonly bookmarksService: BookmarksService) {}

  @Post(":questionId")
  add(@Param("questionId") questionId: string, @Req() request: IdentityRequest) {
    return this.bookmarksService.add(questionId, requireIdentity(request));
  }

  @Delete(":questionId")
  remove(@Param("questionId") questionId: string, @Req() request: IdentityRequest) {
    return this.bookmarksService.remove(questionId, requireIdentity(request));
  }
}

function requireIdentity(request: IdentityRequest): RequestIdentity {
  if (request.identity === undefined) {
    throw new InternalServerErrorException({ code: "IDENTITY_MISSING", message: "Request identity is missing" });
  }
  return request.identity;
}

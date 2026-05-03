import { Controller, Get, Inject, InternalServerErrorException, Req } from "@nestjs/common";
import type { IdentityRequest } from "../identity/identity.middleware";
import type { RequestIdentity } from "../identity/identity.service";
import { ReviewService } from "./review.service";

@Controller("review")
export class ReviewController {
  constructor(@Inject(ReviewService) private readonly reviewService: ReviewService) {}

  @Get("mistakes")
  mistakes(@Req() request: IdentityRequest) {
    return this.reviewService.listMistakes(requireIdentity(request));
  }

  @Get("bookmarks")
  bookmarks(@Req() request: IdentityRequest) {
    return this.reviewService.listBookmarks(requireIdentity(request));
  }

  @Get("records")
  records(@Req() request: IdentityRequest) {
    return this.reviewService.listRecords(requireIdentity(request));
  }
}

function requireIdentity(request: IdentityRequest): RequestIdentity {
  if (request.identity === undefined) {
    throw new InternalServerErrorException({ code: "IDENTITY_MISSING", message: "Request identity is missing" });
  }
  return request.identity;
}

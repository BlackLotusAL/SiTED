import { Body, Controller, InternalServerErrorException, ParseUUIDPipe, Post, Req } from "@nestjs/common";
import type { IdentityRequest } from "../identity/identity.middleware";
import type { RequestIdentity } from "../identity/identity.service";
import { PracticeService, type PracticeSubmitInput } from "./practice.service";

@Controller("practice")
export class PracticeController {
  constructor(private readonly practiceService: PracticeService) {}

  @Post("submit")
  submit(
    @Body("questionId", new ParseUUIDPipe({ version: "4" })) questionId: string,
    @Body() body: PracticeSubmitInput,
    @Req() request: IdentityRequest
  ) {
    return this.practiceService.submit({ ...body, questionId }, requireIdentity(request));
  }
}

function requireIdentity(request: IdentityRequest): RequestIdentity {
  if (request.identity === undefined) {
    throw new InternalServerErrorException({ code: "IDENTITY_MISSING", message: "Request identity is missing" });
  }
  return request.identity;
}

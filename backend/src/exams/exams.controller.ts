import { Body, Controller, Get, Inject, InternalServerErrorException, Param, ParseUUIDPipe, Patch, Post, Req } from "@nestjs/common";
import type { IdentityRequest } from "../identity/identity.middleware";
import type { RequestIdentity } from "../identity/identity.service";
import { ExamsService, type ExamAnswerSaveInput, type ExamCreateInput, type ExamSubmitInput } from "./exams.service";

@Controller("exams")
export class ExamsController {
  constructor(@Inject(ExamsService) private readonly examsService: ExamsService) {}

  @Get()
  list(@Req() request: IdentityRequest) {
    return this.examsService.list(requireIdentity(request));
  }

  @Post()
  create(@Body() body: ExamCreateInput, @Req() request: IdentityRequest) {
    return this.examsService.create(body, requireIdentity(request));
  }

  @Get(":id")
  get(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Req() request: IdentityRequest) {
    return this.examsService.get(id, requireIdentity(request));
  }

  @Patch(":id/answers")
  saveAnswers(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() body: ExamAnswerSaveInput,
    @Req() request: IdentityRequest
  ) {
    return this.examsService.saveAnswers(id, body, requireIdentity(request));
  }

  @Post(":id/submit")
  submit(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() body: ExamSubmitInput,
    @Req() request: IdentityRequest
  ) {
    return this.examsService.submit(id, body, requireIdentity(request));
  }

  @Post(":id/abandon")
  abandon(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Req() request: IdentityRequest) {
    return this.examsService.abandon(id, requireIdentity(request));
  }
}

function requireIdentity(request: IdentityRequest): RequestIdentity {
  if (request.identity === undefined) {
    throw new InternalServerErrorException({ code: "IDENTITY_MISSING", message: "Request identity is missing" });
  }
  return request.identity;
}

import { Body, Controller, Get, InternalServerErrorException, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Role } from "../domain/constants";
import type { IdentityRequest } from "../identity/identity.middleware";
import { Roles } from "../identity/roles.guard";
import { ImportExportService } from "./import-export.service";
import { QuestionsService, type QuestionListQuery } from "../questions/questions.service";

@Controller("admin/questions")
@Roles("content_admin")
export class AdminQuestionsController {
  constructor(
    private readonly questionsService: QuestionsService,
    private readonly importExportService: ImportExportService
  ) {}

  @Get("export")
  export(@Query() query: QuestionListQuery) {
    return this.importExportService.exportQuestions(query);
  }

  @Post("import/validate")
  validateImport(@Body() body: unknown) {
    return this.importExportService.validateImport(body);
  }

  @Post("import/commit")
  commitImport(@Body() body: unknown, @Req() request: IdentityRequest) {
    const identity = requireIdentity(request);
    return this.importExportService.commitImport(body, { actorIp: identity.ip, role: identity.role });
  }

  @Get()
  list(@Query() query: QuestionListQuery) {
    return this.questionsService.listAdmin(query);
  }

  @Post()
  create(@Body() body: unknown, @Req() request: IdentityRequest) {
    return this.questionsService.createAdmin(body, requireIdentity(request).ip);
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.questionsService.getAdminDetail(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: unknown) {
    return this.questionsService.updateAdmin(id, body);
  }

  @Post(":id/publish")
  publish(@Param("id") id: string) {
    return this.questionsService.publishAdmin(id);
  }

  @Post(":id/archive")
  archive(@Param("id") id: string) {
    return this.questionsService.archiveAdmin(id);
  }
}

function requireIdentity(request: IdentityRequest): { ip: string; role: Role } {
  if (request.identity === undefined) {
    throw new InternalServerErrorException({ code: "IDENTITY_MISSING", message: "Request identity is missing" });
  }

  return request.identity;
}

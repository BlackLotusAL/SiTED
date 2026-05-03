import { Body, Controller, Get, Inject, InternalServerErrorException, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Role } from "../domain/constants";
import { AuditService } from "../audit/audit.service";
import type { IdentityRequest } from "../identity/identity.middleware";
import { Roles } from "../identity/roles.guard";
import { ImportExportService } from "./import-export.service";
import { QuestionsService, type QuestionListQuery } from "../questions/questions.service";

@Controller("admin/questions")
@Roles("content_admin")
export class AdminQuestionsController {
  constructor(
    @Inject(QuestionsService)
    private readonly questionsService: QuestionsService,
    @Inject(ImportExportService)
    private readonly importExportService: ImportExportService,
    @Inject(AuditService)
    private readonly audit: AuditService
  ) {}

  @Get("export")
  async export(@Query() query: QuestionListQuery, @Req() request: IdentityRequest) {
    const identity = requireIdentity(request);
    const result = await this.importExportService.exportQuestions(query);
    await this.recordAudit({
      actor: { ip: identity.ip, role: identity.role },
      action: "question_export",
      target: "questions",
      detail: { exportedCount: result.questions.length, filters: query }
    });
    return result;
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
  async create(@Body() body: unknown, @Req() request: IdentityRequest) {
    const identity = requireIdentity(request);
    const question = await this.questionsService.createAdmin(body, identity.ip);
    await this.recordAudit({
      actor: { ip: identity.ip, role: identity.role },
      action: "question_create",
      target: question.id
    });
    return question;
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.questionsService.getAdminDetail(id);
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: unknown, @Req() request: IdentityRequest) {
    const identity = requireIdentity(request);
    const question = await this.questionsService.updateAdmin(id, body);
    await this.recordAudit({
      actor: { ip: identity.ip, role: identity.role },
      action: "question_update",
      target: id
    });
    return question;
  }

  @Post(":id/publish")
  async publish(@Param("id") id: string, @Req() request: IdentityRequest) {
    const identity = requireIdentity(request);
    const question = await this.questionsService.publishAdmin(id);
    await this.recordAudit({
      actor: { ip: identity.ip, role: identity.role },
      action: "question_publish",
      target: id
    });
    return question;
  }

  @Post(":id/archive")
  async archive(@Param("id") id: string, @Req() request: IdentityRequest) {
    const identity = requireIdentity(request);
    const question = await this.questionsService.archiveAdmin(id);
    await this.recordAudit({
      actor: { ip: identity.ip, role: identity.role },
      action: "question_archive",
      target: id
    });
    return question;
  }

  private async recordAudit(input: Parameters<AuditService["record"]>[0]): Promise<void> {
    try {
      await this.audit.record(input);
    } catch {
      // Admin writes are authoritative; audit is best-effort for these existing non-transactional service calls.
    }
  }
}

function requireIdentity(request: IdentityRequest): { ip: string; role: Role } {
  if (request.identity === undefined) {
    throw new InternalServerErrorException({ code: "IDENTITY_MISSING", message: "Request identity is missing" });
  }

  return request.identity;
}

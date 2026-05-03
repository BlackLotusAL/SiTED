import { Controller, InternalServerErrorException, Post, Req, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { AuditService } from "../audit/audit.service";
import type { IdentityRequest } from "../identity/identity.middleware";
import type { RequestIdentity } from "../identity/identity.service";
import { Roles } from "../identity/roles.guard";
import { UploadsService } from "./uploads.service";

@Controller("admin/uploads")
@Roles("content_admin")
export class UploadsController {
  constructor(
    private readonly uploadsService: UploadsService,
    private readonly audit: AuditService
  ) {}

  @Post("questions")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 + 1 }
    })
  )
  async uploadQuestionImage(@UploadedFile() file: Express.Multer.File | undefined, @Req() request: IdentityRequest) {
    const identity = requireIdentity(request);
    const result = await this.uploadsService.saveQuestionImage(file);
    await this.audit.record({
      actor: { ip: identity.ip, role: identity.role },
      action: "question_upload",
      target: result.url,
      detail: { originalName: file?.originalname, size: file?.size, result: "success" }
    });
    return result;
  }
}

function requireIdentity(request: IdentityRequest): RequestIdentity {
  if (request.identity === undefined) {
    throw new InternalServerErrorException({ code: "IDENTITY_MISSING", message: "Request identity is missing" });
  }
  return request.identity;
}

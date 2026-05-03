import { Module } from "@nestjs/common";
import { AdminQuestionsController } from "../admin/admin-questions.controller";
import { ImportExportService } from "../admin/import-export.service";
import { AuditService } from "../audit/audit.service";
import { PrismaModule } from "../prisma/prisma.module";
import { UploadsController } from "../uploads/uploads.controller";
import { UploadsService } from "../uploads/uploads.service";
import { MarkdownService } from "./markdown.service";
import { QuestionsController } from "./questions.controller";
import { QuestionsService } from "./questions.service";

@Module({
  imports: [PrismaModule],
  controllers: [QuestionsController, AdminQuestionsController, UploadsController],
  providers: [QuestionsService, MarkdownService, ImportExportService, UploadsService, AuditService],
  exports: [QuestionsService, MarkdownService]
})
export class QuestionsModule {}

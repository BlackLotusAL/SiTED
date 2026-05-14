import { Module } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { DbModule } from "../db/db.module";
import { ExamConfigService } from "./exam-config.service";
import { ExamsController } from "./exams.controller";
import { EXAM_NOW_PROVIDER, ExamsService } from "./exams.service";

@Module({
  imports: [DbModule],
  controllers: [ExamsController],
  providers: [ExamConfigService, ExamsService, AuditService, { provide: EXAM_NOW_PROVIDER, useValue: () => new Date() }]
})
export class ExamsModule {}

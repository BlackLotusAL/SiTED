import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ExamConfigService } from "./exam-config.service";
import { ExamsController } from "./exams.controller";
import { EXAM_NOW_PROVIDER, ExamsService } from "./exams.service";

@Module({
  imports: [PrismaModule],
  controllers: [ExamsController],
  providers: [ExamConfigService, ExamsService, { provide: EXAM_NOW_PROVIDER, useValue: () => new Date() }]
})
export class ExamsModule {}

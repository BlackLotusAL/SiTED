import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PracticeController } from "./practice.controller";
import { PracticeService } from "./practice.service";

@Module({
  imports: [PrismaModule],
  controllers: [PracticeController],
  providers: [PracticeService],
  exports: [PracticeService]
})
export class PracticeModule {}

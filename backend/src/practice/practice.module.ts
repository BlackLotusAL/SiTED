import { Module } from "@nestjs/common";
import { DbModule } from "../db/db.module";
import { PracticeController } from "./practice.controller";
import { PracticeService } from "./practice.service";

@Module({
  imports: [DbModule],
  controllers: [PracticeController],
  providers: [PracticeService],
  exports: [PracticeService]
})
export class PracticeModule {}

import { Module } from "@nestjs/common";
import { BookmarksController } from "../bookmarks/bookmarks.controller";
import { BookmarksService } from "../bookmarks/bookmarks.service";
import { PrismaModule } from "../prisma/prisma.module";
import { ReviewController } from "./review.controller";
import { ReviewService } from "./review.service";

@Module({
  imports: [PrismaModule],
  controllers: [ReviewController, BookmarksController],
  providers: [ReviewService, BookmarksService],
  exports: [ReviewService, BookmarksService]
})
export class ReviewModule {}

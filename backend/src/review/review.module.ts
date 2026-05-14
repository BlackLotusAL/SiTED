import { Module } from "@nestjs/common";
import { BookmarksController } from "../bookmarks/bookmarks.controller";
import { BookmarksService } from "../bookmarks/bookmarks.service";
import { DbModule } from "../db/db.module";
import { ReviewController } from "./review.controller";
import { ReviewService } from "./review.service";

@Module({
  imports: [DbModule],
  controllers: [ReviewController, BookmarksController],
  providers: [ReviewService, BookmarksService],
  exports: [ReviewService, BookmarksService]
})
export class ReviewModule {}

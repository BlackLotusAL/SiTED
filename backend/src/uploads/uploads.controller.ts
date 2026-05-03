import { Controller, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { Roles } from "../identity/roles.guard";
import { UploadsService } from "./uploads.service";

@Controller("admin/uploads")
@Roles("content_admin")
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post("questions")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 + 1 }
    })
  )
  uploadQuestionImage(@UploadedFile() file: Express.Multer.File | undefined) {
    return this.uploadsService.saveQuestionImage(file);
  }
}

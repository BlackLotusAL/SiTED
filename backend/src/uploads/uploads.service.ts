import { BadRequestException, Injectable } from "@nestjs/common";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif"
};

@Injectable()
export class UploadsService {
  async saveQuestionImage(file: Express.Multer.File | undefined) {
    if (file === undefined) {
      throw new BadRequestException({ code: "UPLOAD_REQUIRED", message: "Image file is required" });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException({ code: "UPLOAD_TOO_LARGE", message: "Image file must be at most 5 MB" });
    }

    const extension = extensionFor(file);
    if (extension === undefined) {
      throw new BadRequestException({ code: "UPLOAD_TYPE_NOT_ALLOWED", message: "Only PNG, JPEG, WebP, and GIF images are allowed" });
    }

    const month = currentMonthKey();
    const filename = `${randomUUID()}${extension}`;
    const directory = join(resolveUploadRoot(), "questions", month);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, filename), file.buffer);

    return {
      url: `/uploads/questions/${month}/${filename}`
    };
  }
}

export function resolveUploadRoot(): string {
  const configured = process.env.UPLOAD_ROOT ?? "backend/uploads";
  if (resolve(configured) === configured) {
    return configured;
  }

  const cwd = process.cwd();
  const base = basename(cwd).toLowerCase() === "backend" && configured.replaceAll("\\", "/").startsWith("backend/")
    ? resolve(cwd, "..")
    : cwd;
  return resolve(base, configured);
}

function extensionFor(file: Express.Multer.File): string | undefined {
  const byMime = MIME_EXTENSIONS[file.mimetype];
  if (byMime !== undefined) {
    return byMime;
  }

  const byName = extname(file.originalname).toLowerCase();
  return Object.values(MIME_EXTENSIONS).includes(byName) || byName === ".jpeg" ? byName : undefined;
}

function currentMonthKey(date = new Date()): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
}

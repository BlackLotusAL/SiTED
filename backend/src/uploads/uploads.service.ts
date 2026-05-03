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
const EXTENSION_MIMES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif"
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

    const extension = validateImageType(file);
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

function validateImageType(file: Express.Multer.File): string | undefined {
  const nameExtension = extname(file.originalname).toLowerCase();
  const expectedMime = EXTENSION_MIMES[nameExtension];
  const canonicalExtension = MIME_EXTENSIONS[file.mimetype];
  if (expectedMime === undefined || canonicalExtension === undefined || expectedMime !== file.mimetype) {
    return undefined;
  }
  if (!matchesMagicBytes(file.buffer, file.mimetype)) {
    return undefined;
  }

  return nameExtension === ".jpeg" ? ".jpg" : canonicalExtension;
}

function currentMonthKey(date = new Date()): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function matchesMagicBytes(buffer: Buffer, mimetype: string): boolean {
  if (mimetype === "image/png") {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimetype === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimetype === "image/gif") {
    const header = buffer.subarray(0, 6).toString("ascii");
    return header === "GIF87a" || header === "GIF89a";
  }
  if (mimetype === "image/webp") {
    return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

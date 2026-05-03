import { BadRequestException } from "@nestjs/common";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UploadsService } from "./uploads.service";

describe("UploadsService", () => {
  const originalEnv = process.env;
  let uploadRoot: string;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    uploadRoot = await mkdtemp(join(tmpdir(), "sited-upload-test-"));
    process.env.UPLOAD_ROOT = uploadRoot;
  });

  afterEach(async () => {
    process.env = originalEnv;
    await rm(uploadRoot, { recursive: true, force: true });
  });

  it("stores valid image files under questions yyyyMM path and returns a stable URL", async () => {
    const result = await new UploadsService().saveQuestionImage(file({ originalname: "image.png", mimetype: "image/png", buffer: pngBytes() }));

    expect(result.url).toMatch(/^\/uploads\/questions\/\d{6}\/[0-9a-f-]+\.png$/);
  });

  it("rejects extension spoofing, mime mismatches, bad magic bytes, and files over 5 MB", async () => {
    const service = new UploadsService();

    await expect(service.saveQuestionImage(file({ originalname: "image.png", mimetype: "text/plain", buffer: pngBytes() }))).rejects.toThrow(BadRequestException);
    await expect(service.saveQuestionImage(file({ originalname: "image.png", mimetype: "image/jpeg", buffer: pngBytes() }))).rejects.toThrow(BadRequestException);
    await expect(service.saveQuestionImage(file({ originalname: "image.png", mimetype: "image/png", buffer: Buffer.from("not an image") }))).rejects.toThrow(BadRequestException);
    await expect(service.saveQuestionImage(file({ originalname: "image.png", mimetype: "image/png", buffer: Buffer.alloc(5 * 1024 * 1024 + 1) }))).rejects.toThrow(BadRequestException);
  });
});

function file(input: { originalname: string; mimetype: string; buffer: Buffer }): Express.Multer.File {
  return {
    fieldname: "file",
    originalname: input.originalname,
    encoding: "7bit",
    mimetype: input.mimetype,
    size: input.buffer.length,
    buffer: input.buffer,
    destination: "",
    filename: "",
    path: "",
    stream: undefined as never
  };
}

function pngBytes(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
}

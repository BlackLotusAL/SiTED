import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { resolveUploadRoot } from "./uploads/uploads.service";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useStaticAssets(resolveUploadRoot(), { prefix: "/uploads/" });
  app.setGlobalPrefix("api");
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();

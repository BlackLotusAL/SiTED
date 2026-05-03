import { MiddlewareConsumer, Module, NestModule, RequestMethod } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { IdentityMiddleware } from "./identity/identity.middleware";
import { IdentityModule } from "./identity/identity.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [PrismaModule, IdentityModule],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(IdentityMiddleware).forRoutes({ path: "*", method: RequestMethod.ALL });
  }
}

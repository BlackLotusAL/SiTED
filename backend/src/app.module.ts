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
    // Nest expands this wildcard under the global "api" prefix, so identity runs only for /api routes.
    consumer.apply(IdentityMiddleware).forRoutes({ path: "/{*apiPath}", method: RequestMethod.ALL });
  }
}

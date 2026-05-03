import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { PrismaModule } from "../prisma/prisma.module";
import { IdentityController } from "./identity.controller";
import { IdentityService } from "./identity.service";
import { RolesGuard } from "./roles.guard";

@Module({
  imports: [PrismaModule],
  controllers: [IdentityController],
  providers: [
    IdentityService,
    RolesGuard,
    {
      provide: APP_GUARD,
      useClass: RolesGuard
    }
  ],
  exports: [IdentityService, RolesGuard]
})
export class IdentityModule {}

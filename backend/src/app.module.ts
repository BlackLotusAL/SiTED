import { MiddlewareConsumer, Module, NestModule, RequestMethod } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AdminSettingsController } from "./admin/admin-settings.controller";
import { AdminSettingsService } from "./admin/admin-settings.service";
import { AdminStatsController } from "./admin/admin-stats.controller";
import { AdminStatsService } from "./admin/admin-stats.service";
import { AuditService } from "./audit/audit.service";
import { DashboardController } from "./dashboard/dashboard.controller";
import { DashboardService } from "./dashboard/dashboard.service";
import { IdentityMiddleware } from "./identity/identity.middleware";
import { IdentityModule } from "./identity/identity.module";
import { ExamsModule } from "./exams/exams.module";
import { PracticeModule } from "./practice/practice.module";
import { DbModule } from "./db/db.module";
import { QuestionsModule } from "./questions/questions.module";
import { ReviewModule } from "./review/review.module";

@Module({
  imports: [DbModule, IdentityModule, QuestionsModule, PracticeModule, ReviewModule, ExamsModule],
  controllers: [AppController, AdminStatsController, AdminSettingsController, DashboardController],
  providers: [AppService, AdminStatsService, AdminSettingsService, DashboardService, AuditService]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Nest expands this wildcard under the global "api" prefix, so identity runs only for /api routes.
    consumer.apply(IdentityMiddleware).forRoutes({ path: "/{*apiPath}", method: RequestMethod.ALL });
  }
}

import { Controller, Get } from "@nestjs/common";
import { Roles } from "../identity/roles.guard";
import { AdminStatsService } from "./admin-stats.service";

@Controller("admin/stats")
@Roles("content_admin")
export class AdminStatsController {
  constructor(private readonly statsService: AdminStatsService) {}

  @Get()
  getStats() {
    return this.statsService.getStats();
  }
}

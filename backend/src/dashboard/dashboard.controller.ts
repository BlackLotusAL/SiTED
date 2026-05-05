import { Controller, Get, Inject, InternalServerErrorException, Req } from "@nestjs/common";
import type { IdentityRequest } from "../identity/identity.middleware";
import type { RequestIdentity } from "../identity/identity.service";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboardService: DashboardService) {}

  @Get()
  getSummary(@Req() request: IdentityRequest) {
    return this.dashboardService.getSummary(requireIdentity(request));
  }
}

function requireIdentity(request: IdentityRequest): RequestIdentity {
  if (request.identity === undefined) {
    throw new InternalServerErrorException({ code: "IDENTITY_MISSING", message: "Request identity is missing" });
  }
  return request.identity;
}

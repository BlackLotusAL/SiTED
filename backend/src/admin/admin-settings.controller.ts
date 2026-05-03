import { Body, Controller, Delete, Get, InternalServerErrorException, Param, Post, Put, Query, Req } from "@nestjs/common";
import type { IdentityRequest } from "../identity/identity.middleware";
import type { RequestIdentity } from "../identity/identity.service";
import { Roles } from "../identity/roles.guard";
import { AdminSettingsService } from "./admin-settings.service";

@Controller("admin")
@Roles("system_admin")
export class AdminSettingsController {
  constructor(private readonly settingsService: AdminSettingsService) {}

  @Get("settings/ip-role-bindings")
  listRoleBindings() {
    return this.settingsService.listRoleBindings();
  }

  @Get("ip-roles")
  listIpRoles() {
    return this.settingsService.listRoleBindings();
  }

  @Post("settings/ip-role-bindings")
  upsertRoleBinding(@Body() body: unknown, @Req() request: IdentityRequest) {
    return this.settingsService.upsertRoleBinding(body, requireIdentity(request));
  }

  @Put("ip-roles/:ip")
  putIpRole(@Param("ip") ip: string, @Body() body: unknown, @Req() request: IdentityRequest) {
    return this.settingsService.upsertRoleBinding({ ...(isRecord(body) ? body : {}), ip }, requireIdentity(request));
  }

  @Delete("settings/ip-role-bindings/:ip")
  deleteRoleBinding(@Param("ip") ip: string, @Req() request: IdentityRequest) {
    return this.settingsService.deleteRoleBinding(ip, requireIdentity(request));
  }

  @Post("settings/data-clear")
  clearData(@Body() body: unknown, @Req() request: IdentityRequest) {
    return this.settingsService.clearData(body, requireIdentity(request));
  }

  @Post("data/clear")
  clearDataPrdPath(@Body() body: unknown, @Req() request: IdentityRequest) {
    return this.settingsService.clearData(body, requireIdentity(request));
  }

  @Get("audit-logs")
  listAuditLogs(@Query() query: { page?: string; pageSize?: string }) {
    return this.settingsService.listAuditLogs(query);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireIdentity(request: IdentityRequest): RequestIdentity {
  if (request.identity === undefined) {
    throw new InternalServerErrorException({ code: "IDENTITY_MISSING", message: "Request identity is missing" });
  }
  return request.identity;
}

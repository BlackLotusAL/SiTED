import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Role } from "../domain/constants";
import type { IdentityRequest } from "./identity.middleware";

const ROLES_KEY = "sited:roles";
const ROLE_RANK: Record<Role, number> = {
  learner: 1,
  content_admin: 2,
  system_admin: 3
};

export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles =
      this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [context.getHandler(), context.getClass()]) ?? [];
    if (requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<IdentityRequest>();
    const actualRole = request.identity?.role;
    if (actualRole === undefined) {
      throw new ForbiddenException({
        code: "ROLE_NOT_ALLOWED",
        message: "Role is not allowed"
      });
    }

    const minimumRank = Math.min(...requiredRoles.map((role) => ROLE_RANK[role]));
    if (ROLE_RANK[actualRole] >= minimumRank) {
      return true;
    }

    throw new ForbiddenException({
      code: "ROLE_NOT_ALLOWED",
      message: "Role is not allowed"
    });
  }
}

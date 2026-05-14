import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DbService } from "../db/db.service";
import { ipRoleBindings, visitors } from "../db/schema";
import type { Role } from "../domain/constants";
import { getRoleLabel } from "../domain/labels";
import { normalizeIpv4, parseCsv } from "./ip-resolver";
import { permissionsForRole, type Permission } from "./permissions";

type IpRoleBindingRole = Extract<Role, "learner" | "content_admin">;

export interface RequestIdentity {
  ip: string;
  role: Role;
  roleLabel: string;
  permissions: Permission[];
}

@Injectable()
export class IdentityService {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  async resolveIdentity(ip: string): Promise<RequestIdentity> {
    const role = await this.resolveRole(ip);
    await this.upsertVisitor(ip);

    return {
      ip,
      role,
      roleLabel: getRoleLabel(role),
      permissions: permissionsForRole(role)
    };
  }

  private async resolveRole(ip: string): Promise<Role> {
    if (this.systemAdminIps().has(ip)) {
      return "system_admin";
    }

    const [binding] = await this.db.client
      .select({ role: ipRoleBindings.role })
      .from(ipRoleBindings)
      .where(eq(ipRoleBindings.ip, ip))
      .limit(1);

    return binding === undefined ? "learner" : ipRoleBindingRoleToRole(binding.role);
  }

  private async upsertVisitor(ip: string): Promise<void> {
    await this.db.client
      .insert(visitors)
      .values({ ip })
      .onConflictDoUpdate({
        target: visitors.ip,
        set: { lastSeenAt: new Date() }
      });
  }

  private systemAdminIps(): Set<string> {
    return new Set(parseCsv(process.env.SYSTEM_ADMIN_IPS).map(normalizeIpv4).filter((ip): ip is string => ip !== null));
  }
}

function ipRoleBindingRoleToRole(role: IpRoleBindingRole): Role {
  return role;
}

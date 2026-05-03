import { Injectable } from "@nestjs/common";
import type { Role } from "../domain/constants";
import { getRoleLabel } from "../domain/labels";
import { PrismaService } from "../prisma/prisma.service";
import { normalizeIpv4, parseCsv } from "./ip-resolver";
import { permissionsForRole, type Permission } from "./permissions";

export interface RequestIdentity {
  ip: string;
  role: Role;
  roleLabel: string;
  permissions: Permission[];
}

@Injectable()
export class IdentityService {
  constructor(private readonly prisma: PrismaService) {}

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

    const binding = await this.prisma.ipRoleBinding.findUnique({
      where: { ip },
      select: { role: true }
    });

    return binding?.role === "content_admin" || binding?.role === "learner" ? binding.role : "learner";
  }

  private async upsertVisitor(ip: string): Promise<void> {
    await this.prisma.visitor.upsert({
      where: { ip },
      create: { ip },
      update: { lastSeenAt: new Date() }
    });
  }

  private systemAdminIps(): Set<string> {
    return new Set(parseCsv(process.env.SYSTEM_ADMIN_IPS).map(normalizeIpv4).filter((ip): ip is string => ip !== null));
  }
}

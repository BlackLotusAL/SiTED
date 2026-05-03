import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Role } from "../domain/constants";
import { IdentityService } from "./identity.service";
import { Roles, RolesGuard } from "./roles.guard";

type IpRoleBindingRole = Extract<Role, "learner" | "content_admin">;

describe("identity roles", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("grants system admin from SYSTEM_ADMIN_IPS before DB bindings", async () => {
    process.env.SYSTEM_ADMIN_IPS = "10.0.0.9";
    const prisma = prismaMock({ bindingRole: "content_admin" });
    const service = new IdentityService(prisma);

    await expect(service.resolveIdentity("10.0.0.9")).resolves.toMatchObject({
      ip: "10.0.0.9",
      role: "system_admin"
    });
  });

  it("uses content admin binding when IP is not a system admin", async () => {
    process.env.SYSTEM_ADMIN_IPS = "";
    const prisma = prismaMock({ bindingRole: "content_admin" });
    const service = new IdentityService(prisma);

    await expect(service.resolveIdentity("10.0.0.8")).resolves.toMatchObject({
      ip: "10.0.0.8",
      role: "content_admin"
    });
  });

  it("uses learner binding when IP is not a system admin", async () => {
    process.env.SYSTEM_ADMIN_IPS = "";
    const prisma = prismaMock({ bindingRole: "learner" });
    const service = new IdentityService(prisma);

    await expect(service.resolveIdentity("10.0.0.7")).resolves.toMatchObject({
      ip: "10.0.0.7",
      role: "learner"
    });
  });

  it("defaults to learner when no binding exists", async () => {
    process.env.SYSTEM_ADMIN_IPS = "";
    const prisma = prismaMock({ bindingRole: null });
    const service = new IdentityService(prisma);

    await expect(service.resolveIdentity("10.0.0.6")).resolves.toMatchObject({
      ip: "10.0.0.6",
      role: "learner"
    });
  });

  it("derives cumulative concrete permissions from role", async () => {
    process.env.SYSTEM_ADMIN_IPS = "10.0.0.9";
    const service = new IdentityService(prismaMock({ bindingRole: null }));

    const identity = await service.resolveIdentity("10.0.0.9");

    expect(identity.permissions).toEqual(
      expect.arrayContaining(["question:create", "ip_role:write", "audit:view", "practice:use"])
    );
  });

  it("allows higher roles to access lower role routes and denies insufficient roles", () => {
    class Target {
      @Roles("content_admin")
      handler() {
        return true;
      }
    }

    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);
    const handler = Target.prototype.handler;

    expect(guard.canActivate(context(handler, { role: "system_admin" }))).toBe(true);
    expect(guard.canActivate(context(handler, { role: "content_admin" }))).toBe(true);
    expect(() => guard.canActivate(context(handler, { role: "learner" }))).toThrow(ForbiddenException);
  });

  it("keeps Prisma IP role bindings narrower than application roles", () => {
    const schema = readFileSync(resolve(__dirname, "../../prisma/schema.prisma"), "utf8");

    expect(schema).toContain("role        IpRoleBindingRole");
    expect(schema).toContain("enum IpRoleBindingRole");
    expect(schema).toMatch(/enum IpRoleBindingRole\s+\{\s+learner\s+content_admin\s+\}/);
  });
});

function prismaMock(input: { bindingRole: IpRoleBindingRole | null }) {
  return {
    ipRoleBinding: {
      findUnique: jest.fn().mockResolvedValue(input.bindingRole === null ? null : { role: input.bindingRole })
    },
    visitor: {
      upsert: jest.fn().mockResolvedValue({})
    }
  } as never;
}

function context(handler: () => boolean, identity?: { role: string }) {
  return {
    getHandler: () => handler,
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () => ({ identity })
    })
  } as never;
}

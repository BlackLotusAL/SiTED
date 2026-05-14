import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Role } from "../domain/constants";
import { drizzleMock } from "../testing/drizzle-mock";
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
    const db = dbMock({ bindingRole: "content_admin" });
    const service = new IdentityService(db.service as never);

    await expect(service.resolveIdentity("10.0.0.9")).resolves.toMatchObject({
      ip: "10.0.0.9",
      role: "system_admin"
    });
  });

  it("uses content admin binding when IP is not a system admin", async () => {
    process.env.SYSTEM_ADMIN_IPS = "";
    const db = dbMock({ bindingRole: "content_admin" });
    const service = new IdentityService(db.service as never);

    await expect(service.resolveIdentity("10.0.0.8")).resolves.toMatchObject({
      ip: "10.0.0.8",
      role: "content_admin"
    });
  });

  it("uses learner binding when IP is not a system admin", async () => {
    process.env.SYSTEM_ADMIN_IPS = "";
    const db = dbMock({ bindingRole: "learner" });
    const service = new IdentityService(db.service as never);

    await expect(service.resolveIdentity("10.0.0.7")).resolves.toMatchObject({
      ip: "10.0.0.7",
      role: "learner"
    });
  });

  it("defaults to learner when no binding exists", async () => {
    process.env.SYSTEM_ADMIN_IPS = "";
    const db = dbMock({ bindingRole: null });
    const service = new IdentityService(db.service as never);

    await expect(service.resolveIdentity("10.0.0.6")).resolves.toMatchObject({
      ip: "10.0.0.6",
      role: "learner"
    });
  });

  it("derives cumulative concrete permissions from role", async () => {
    process.env.SYSTEM_ADMIN_IPS = "10.0.0.9";
    const service = new IdentityService(dbMock({ bindingRole: null }).service as never);

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

  it("keeps persisted IP role bindings narrower than application roles", () => {
    const schema = readFileSync(resolve(__dirname, "../db/schema.ts"), "utf8");

    expect(schema).toContain('pgEnum("IpRoleBindingRole"');
    expect(schema).toContain('"learner", "content_admin"');
  });
});

function dbMock(input: { bindingRole: IpRoleBindingRole | null }) {
  return drizzleMock({
    select: [input.bindingRole === null ? [] : [{ role: input.bindingRole }]],
    insert: [[]]
  });
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

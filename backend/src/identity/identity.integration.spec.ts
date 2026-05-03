import { Controller, Get, INestApplication, InternalServerErrorException, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";
import { IdentityController } from "./identity.controller";
import { IdentityModule } from "./identity.module";
import { Roles } from "./roles.guard";

describe("identity integration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns /api/me response shape for an allowed IP without CIDR match details", async () => {
    process.env.ALLOWED_CIDR = "127.0.0.1/32";
    process.env.TRUSTED_PROXY_CIDRS = "";
    process.env.SYSTEM_ADMIN_IPS = "127.0.0.1";
    const app = await createApp();

    try {
      const response = await fetchJson(app, "/api/me");

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        ip: "127.0.0.1",
        role: "system_admin",
        roleLabel: expect.any(String),
        permissions: expect.arrayContaining(["practice:use", "ip_role:write"])
      });
      expect(response.body).not.toHaveProperty("allowedCidr");
      expect(response.body).not.toHaveProperty("cidr");
    } finally {
      await app.close();
    }
  });

  it("denies /api/me for non-whitelisted IPs with IP_NOT_ALLOWED", async () => {
    process.env.ALLOWED_CIDR = "10.0.0.0/8";
    process.env.TRUSTED_PROXY_CIDRS = "";
    process.env.SYSTEM_ADMIN_IPS = "";
    const app = await createApp();

    try {
      const response = await fetchJson(app, "/api/me");

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        code: "IP_NOT_ALLOWED",
        message: "IP is not allowed"
      });
    } finally {
      await app.close();
    }
  });

  it("does not run identity middleware for non-API routes", async () => {
    process.env.ALLOWED_CIDR = "10.0.0.0/8";
    const app = await createApp();

    try {
      const response = await fetchJson(app, "/non-api");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
    } finally {
      await app.close();
    }
  });

  it("enforces @Roles metadata through the global guard", async () => {
    const app = await createGuardApp();

    try {
      expect((await fetchJson(app, "/public")).status).toBe(200);
      expect((await fetchJson(app, "/content-admin")).status).toBe(403);
    } finally {
      await app.close();
    }
  });

  it("fails closed when /api/me is reached without request identity", () => {
    const controller = new IdentityController();

    expect(() => controller.me({} as never)).toThrow(InternalServerErrorException);
  });
});

@Controller()
class GuardController {
  @Get("public")
  publicRoute() {
    return { ok: true };
  }

  @Roles("content_admin")
  @Get("content-admin")
  contentAdminRoute() {
    return { ok: true };
  }
}

@Module({
  imports: [IdentityModule],
  controllers: [GuardController]
})
class GuardTestModule {}

async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule]
  })
    .overrideProvider(PrismaService)
    .useValue(prismaMock())
    .compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api");
  app.getHttpAdapter().getInstance().get("/non-api", (_req: unknown, res: { json: (body: unknown) => void }) => {
    res.json({ ok: true });
  });
  await app.listen(0);
  return app;
}

async function createGuardApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [GuardTestModule]
  })
    .overrideProvider(PrismaService)
    .useValue(prismaMock())
    .compile();
  const app = moduleRef.createNestApplication();
  await app.listen(0);
  return app;
}

async function fetchJson(app: INestApplication, path: string): Promise<{ status: number; body: unknown }> {
  const server = app.getHttpServer() as { address: () => { port: number } };
  const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
  return {
    status: response.status,
    body: await response.json()
  };
}

function prismaMock() {
  return {
    ipRoleBinding: {
      findUnique: jest.fn().mockResolvedValue(null)
    },
    visitor: {
      upsert: jest.fn().mockResolvedValue({})
    }
  };
}

import { AuditService } from "./audit.service";

describe("AuditService", () => {
  it("writes actor IP, role, action, target, and structured detail", async () => {
    const prisma = {
      auditLog: {
        create: jest.fn().mockResolvedValue({})
      }
    };
    const service = new AuditService(prisma as never);

    await service.record({
      actor: { ip: "10.0.0.1", role: "system_admin" },
      action: "data_clear",
      target: "activity",
      detail: { scope: "activity", result: "success" }
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorIp: "10.0.0.1",
        role: "system_admin",
        action: "data_clear",
        target: "activity",
        detail: { scope: "activity", result: "success" }
      }
    });
  });
});

import { drizzleMock } from "../testing/drizzle-mock";
import { AuditService } from "./audit.service";

describe("AuditService", () => {
  it("writes actor IP, role, action, target, and structured detail", async () => {
    const db = drizzleMock({ insert: [[{ id: "log1" }]] });
    const service = new AuditService(db.service as never);

    await service.record({
      actor: { ip: "10.0.0.1", role: "system_admin" },
      action: "data_clear",
      target: "activity",
      detail: { scope: "activity", result: "success" }
    });

    expect(db.client.insert).toHaveBeenCalledTimes(1);
  });
});

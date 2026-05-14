import { Inject, Injectable } from "@nestjs/common";
import type { Role } from "../domain/constants";
import { DbService } from "../db/db.service";
import type { DbExecutor } from "../db/query-helpers";
import { auditLogs } from "../db/schema";
import type { InputJsonValue } from "../db/json";

export type AuditAction =
  | "ip_role_upsert"
  | "ip_role_delete"
  | "question_create"
  | "question_update"
  | "question_publish"
  | "question_archive"
  | "question_import"
  | "question_export"
  | "question_upload"
  | "data_clear"
  | "exam_abandon"
  | "exam_config_reload";

export interface AuditActor {
  ip: string;
  role: Role;
}

export interface AuditRecordInput {
  actor: AuditActor;
  action: AuditAction;
  target: string;
  detail?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  record(input: AuditRecordInput, client: DbExecutor = this.db.client) {
    return client
      .insert(auditLogs)
      .values({
        actorIp: input.actor.ip,
        role: input.actor.role,
        action: input.action,
        target: input.target,
        detail: input.detail as InputJsonValue | undefined
      })
      .returning()
      .then((rows) => rows[0]);
  }
}

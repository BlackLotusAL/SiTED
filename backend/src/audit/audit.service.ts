import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Role } from "../domain/constants";
import { PrismaService } from "../prisma/prisma.service";

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

type AuditClient = Pick<PrismaService, "auditLog">;

@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  record(input: AuditRecordInput, client: AuditClient = this.prisma) {
    return client.auditLog.create({
      data: {
        actorIp: input.actor.ip,
        role: input.actor.role,
        action: input.action as never,
        target: input.target,
        detail: input.detail as Prisma.InputJsonValue | undefined
      }
    });
  }
}

import { BadRequestException, Injectable } from "@nestjs/common";
import { rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { Role } from "../domain/constants";
import { parseCsv, normalizeIpv4 } from "../identity/ip-resolver";
import { permissionsForRole, type Permission } from "../identity/permissions";
import { PrismaService } from "../prisma/prisma.service";
import { resolveUploadRoot } from "../uploads/uploads.service";
import { AuditService, type AuditActor } from "../audit/audit.service";

export const DATA_CLEAR_CONFIRMATION_PHRASE = "CONFIRM_CLEAR_SITED_DATA";

type BindingRole = Extract<Role, "learner" | "content_admin">;
type ClearScope = "activity" | "questions" | "all";

const TABLE_HEADERS = ["IP", "fixed role", "permission scope", "description", "updated time"] as const;
const ROLE_LABELS: Record<Role, string> = {
  learner: "Learner",
  content_admin: "Content admin",
  system_admin: "System admin"
};
const PERMISSION_LABELS: Record<Permission, string> = {
  "question:browse": "Browse questions",
  "practice:use": "Use practice",
  "recite:use": "Use recite mode",
  "mistake:review": "Review mistakes",
  "bookmark:use": "Use bookmarks",
  "exam:use": "Use exams",
  "question:create": "Create questions",
  "question:edit": "Edit questions",
  "question:archive": "Archive questions",
  "question:import": "Import questions",
  "question:export": "Export questions",
  "stats:view_basic": "View basic stats",
  "ip_role:write": "Manage IP role bindings",
  "data:clear": "Clear data",
  "audit:view": "View audit logs",
  "config:reload": "Reload config"
};

@Injectable()
export class AdminSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService = new AuditService(prisma)
  ) {}

  async listRoleBindings() {
    const [bindings, systemAdminIps] = await Promise.all([
      this.prisma.ipRoleBinding.findMany({ orderBy: [{ updatedAt: "desc" }, { ip: "asc" }] }),
      Promise.resolve(systemAdminIpList())
    ]);

    const systemItems = systemAdminIps.map((ip) =>
      roleBindingItem({
        ip,
        role: "system_admin",
        description: "From SYSTEM_ADMIN_IPS",
        updatedAt: null
      })
    );
    const bindingItems = bindings.map((binding) =>
      roleBindingItem({
        ip: binding.ip,
        role: binding.role,
        description: binding.note ?? "",
        updatedAt: binding.updatedAt
      })
    );

    return { headers: [...TABLE_HEADERS], items: [...systemItems, ...bindingItems] };
  }

  async upsertRoleBinding(input: unknown, actor: AuditActor) {
    const normalized = normalizeRoleBindingInput(input);
    const binding = await this.prisma.ipRoleBinding.upsert({
      where: { ip: normalized.ip },
      create: {
        ip: normalized.ip,
        role: normalized.role,
        note: normalized.description,
        updatedByIp: actor.ip
      },
      update: {
        role: normalized.role,
        note: normalized.description,
        updatedByIp: actor.ip
      }
    });

    await this.audit.record({
      actor,
      action: "ip_role_upsert",
      target: normalized.ip,
      detail: { role: normalized.role, description: normalized.description, result: "success" }
    });

    return roleBindingItem({
      ip: binding.ip,
      role: binding.role,
      description: binding.note ?? "",
      updatedAt: binding.updatedAt
    });
  }

  async deleteRoleBinding(ipInput: string, actor: AuditActor) {
    const ip = normalizeIp(ipInput);
    await this.prisma.ipRoleBinding.deleteMany({ where: { ip } });
    await this.audit.record({
      actor,
      action: "ip_role_delete",
      target: ip,
      detail: { result: "success" }
    });
    return { deleted: true };
  }

  async listAuditLogs(query: { page?: string | number; pageSize?: string | number } = {}) {
    const page = clampInt(query.page, 1, 100000, 1);
    const pageSize = clampInt(query.pageSize, 1, 100, 50);
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.auditLog.count()
    ]);

    return { items, total, page, pageSize };
  }

  async clearData(input: unknown, actor: AuditActor) {
    const normalized = normalizeClearInput(input);
    if (normalized.confirmationPhrase !== DATA_CLEAR_CONFIRMATION_PHRASE) {
      await this.audit.record({
        actor,
        action: "data_clear",
        target: normalized.scope,
        detail: { scope: normalized.scope, result: "rejected", reason: "confirmation_phrase_mismatch" }
      });
      throw new BadRequestException({
        code: "DATA_CLEAR_CONFIRMATION_MISMATCH",
        message: `confirmationPhrase must equal ${DATA_CLEAR_CONFIRMATION_PHRASE}`
      });
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await deleteActivity(tx);
        if (normalized.scope === "questions" || normalized.scope === "all") {
          await tx.question.deleteMany();
        }
        if (normalized.scope === "all") {
          await tx.ipRoleBinding.deleteMany();
        }
        await this.audit.record(
          {
            actor,
            action: "data_clear",
            target: normalized.scope,
            detail: { scope: normalized.scope, result: "success" }
          },
          tx
        );
      });

      if (normalized.scope === "questions" || normalized.scope === "all") {
        await removeQuestionUploads();
      }

      return { scope: normalized.scope, result: "success" };
    } catch (error) {
      await this.audit.record({
        actor,
        action: "data_clear",
        target: normalized.scope,
        detail: { scope: normalized.scope, result: "failed", reason: errorMessage(error) }
      });
      throw error;
    }
  }
}

function roleBindingItem(input: { ip: string; role: Role; description: string; updatedAt: Date | null }) {
  return {
    ip: input.ip,
    role: input.role,
    roleLabel: ROLE_LABELS[input.role],
    permissionScope: ROLE_LABELS[input.role],
    permissions: permissionsForRole(input.role).map((permission) => PERMISSION_LABELS[permission]),
    description: input.description,
    updatedAt: input.updatedAt
  };
}

function normalizeRoleBindingInput(input: unknown): { ip: string; role: BindingRole; description: string } {
  if (!isRecord(input)) {
    throw invalidSettingsInput("body must be an object");
  }
  const ip = normalizeIp(input.ip);
  if (input.role !== "learner" && input.role !== "content_admin") {
    throw invalidSettingsInput("role must be learner or content_admin; system_admin only comes from SYSTEM_ADMIN_IPS");
  }
  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (description.length > 200) {
    throw invalidSettingsInput("description must be at most 200 characters");
  }
  return { ip, role: input.role, description };
}

function normalizeClearInput(input: unknown): { scope: ClearScope; confirmationPhrase: string } {
  if (!isRecord(input)) {
    throw invalidSettingsInput("body must be an object");
  }
  if (input.scope !== "activity" && input.scope !== "questions" && input.scope !== "all") {
    throw invalidSettingsInput("scope must be activity, questions, or all");
  }
  return {
    scope: input.scope,
    confirmationPhrase: typeof input.confirmationPhrase === "string" ? input.confirmationPhrase : ""
  };
}

async function deleteActivity(tx: {
  bookmark: { deleteMany: () => Promise<unknown> };
  mistake: { deleteMany: () => Promise<unknown> };
  practiceAttempt: { deleteMany: () => Promise<unknown> };
  examAttempt: { deleteMany: () => Promise<unknown> };
}): Promise<void> {
  await tx.bookmark.deleteMany();
  await tx.mistake.deleteMany();
  await tx.practiceAttempt.deleteMany();
  await tx.examAttempt.deleteMany();
}

async function removeQuestionUploads(): Promise<void> {
  const uploadRoot = resolve(resolveUploadRoot());
  const questionRoot = resolve(uploadRoot, "questions");
  if (!isPathInside(questionRoot, uploadRoot)) {
    throw new Error("Question upload path is outside upload root");
  }
  await rm(questionRoot, { recursive: true, force: true });
}

function isPathInside(candidate: string, root: string): boolean {
  const normalizedRoot = root.endsWith(sep) ? root : `${root}${sep}`;
  return candidate.toLowerCase().startsWith(normalizedRoot.toLowerCase());
}

function systemAdminIpList(): string[] {
  return parseCsv(process.env.SYSTEM_ADMIN_IPS)
    .map(normalizeIpv4)
    .filter((ip): ip is string => ip !== null);
}

function normalizeIp(value: unknown): string {
  if (typeof value !== "string") {
    throw invalidSettingsInput("ip must be a valid IPv4 address");
  }
  const ip = normalizeIpv4(value);
  if (ip === null) {
    throw invalidSettingsInput("ip must be a valid IPv4 address");
  }
  return ip;
}

function invalidSettingsInput(message: string): BadRequestException {
  return new BadRequestException({ code: "INVALID_ADMIN_SETTINGS_REQUEST", message });
}

function clampInt(value: string | number | undefined, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

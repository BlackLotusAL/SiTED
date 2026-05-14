import { BadRequestException, Inject, Injectable, Optional } from "@nestjs/common";
import { count, desc, eq } from "drizzle-orm";
import { rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { DbService } from "../db/db.service";
import type { DbExecutor } from "../db/query-helpers";
import { auditLogs, bookmarks, examAttempts, ipRoleBindings, mistakes, practiceAttempts, questions } from "../db/schema";
import type { Role } from "../domain/constants";
import { parseCsv, normalizeIpv4 } from "../identity/ip-resolver";
import { permissionsForRole, type Permission } from "../identity/permissions";
import { resolveUploadRoot } from "../uploads/uploads.service";
import { AuditService, type AuditActor } from "../audit/audit.service";

export const DATA_CLEAR_CONFIRMATION_PHRASE = "CONFIRM_CLEAR_SITED_DATA";
export const UI_DATA_CLEAR_CONFIRMATION_PHRASE = "确认清空";

type BindingRole = Extract<Role, "learner" | "content_admin">;
type ClearScope = "activity" | "questions" | "all";
type RoleBindingSource = "system" | "binding";
export type QuestionUploadRemover = () => Promise<void>;
export const QUESTION_UPLOAD_REMOVER = Symbol("QUESTION_UPLOAD_REMOVER");
const DATA_CLEAR_CONFIRMATION_PHRASES = new Set([DATA_CLEAR_CONFIRMATION_PHRASE, UI_DATA_CLEAR_CONFIRMATION_PHRASE]);

const TABLE_HEADERS = ["IP", "fixed role", "permission scope", "description", "updated time"] as const;
const ROLE_LABELS: Record<Role, string> = {
  learner: "学习者",
  content_admin: "题库管理员",
  system_admin: "系统管理员"
};
const PERMISSION_LABELS: Record<Permission, string> = {
  "question:browse": "浏览题库",
  "practice:use": "练习",
  "recite:use": "背诵",
  "mistake:review": "错题复习",
  "bookmark:use": "收藏",
  "exam:use": "模拟考",
  "question:create": "题目新增",
  "question:edit": "题目编辑",
  "question:archive": "题目归档",
  "question:import": "题目导入",
  "question:export": "题目导出",
  "stats:view_basic": "运营看板只读",
  "ip_role:write": "IP 角色绑定",
  "data:clear": "数据清空",
  "audit:view": "审计日志查看",
  "config:reload": "配置重载"
};

@Injectable()
export class AdminSettingsService {
  private readonly audit: AuditService;

  constructor(
    @Inject(DbService)
    private readonly db: DbService,
    @Optional() @Inject(AuditService) audit?: AuditService,
    @Optional() @Inject(QUESTION_UPLOAD_REMOVER) private readonly removeUploads: QuestionUploadRemover = removeQuestionUploads
  ) {
    this.audit = audit ?? new AuditService(db);
  }

  async listRoleBindings() {
    const [bindings, systemAdminIps] = await Promise.all([
      this.db.client.select().from(ipRoleBindings).orderBy(desc(ipRoleBindings.updatedAt), ipRoleBindings.ip),
      Promise.resolve(systemAdminIpList())
    ]);

    const systemAdminIpSet = new Set(systemAdminIps);
    const systemItems = systemAdminIps.map((ip) =>
      roleBindingItem({
        ip,
        role: "system_admin",
        description: "From SYSTEM_ADMIN_IPS",
        source: "system",
        updatedAt: null
      })
    );
    const bindingItems = bindings
      .filter((binding) => !systemAdminIpSet.has(binding.ip))
      .map((binding) =>
        roleBindingItem({
          ip: binding.ip,
          role: binding.role,
          description: binding.note ?? "",
          source: "binding",
          updatedAt: binding.updatedAt
        })
      );

    return { headers: [...TABLE_HEADERS], items: [...systemItems, ...bindingItems] };
  }

  async upsertRoleBinding(input: unknown, actor: AuditActor) {
    const normalized = normalizeRoleBindingInput(input);
    rejectEnvSystemAdminIp(normalized.ip);
    const binding = await this.db.client.transaction(async (tx) => {
      const [saved] = await tx
        .insert(ipRoleBindings)
        .values({
          ip: normalized.ip,
          role: normalized.role,
          note: normalized.description,
          updatedByIp: actor.ip,
          updatedAt: new Date()
        })
        .onConflictDoUpdate({
          target: ipRoleBindings.ip,
          set: {
            role: normalized.role,
            note: normalized.description,
            updatedByIp: actor.ip,
            updatedAt: new Date()
          }
        })
        .returning();

      await this.audit.record(
        {
          actor,
          action: "ip_role_upsert",
          target: normalized.ip,
          detail: { role: normalized.role, description: normalized.description, result: "success" }
        },
        tx
      );

      return requireRow(saved, "Role binding write did not return a row");
    });

    return roleBindingItem({
      ip: binding.ip,
      role: binding.role,
      description: binding.note ?? "",
      source: "binding",
      updatedAt: binding.updatedAt
    });
  }

  async deleteRoleBinding(ipInput: string, actor: AuditActor) {
    const ip = normalizeIp(ipInput);
    rejectEnvSystemAdminIp(ip);
    await this.db.client.transaction(async (tx) => {
      await tx.delete(ipRoleBindings).where(eq(ipRoleBindings.ip, ip));
      await this.audit.record(
        {
          actor,
          action: "ip_role_delete",
          target: ip,
          detail: { result: "success" }
        },
        tx
      );
    });
    return { deleted: true };
  }

  async listAuditLogs(query: { page?: string | number; pageSize?: string | number } = {}) {
    const page = clampInt(query.page, 1, 100000, 1);
    const pageSize = clampInt(query.pageSize, 1, 100, 50);
    const [items, total] = await Promise.all([
      this.db.client.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).offset((page - 1) * pageSize).limit(pageSize),
      countAuditLogs(this.db.client)
    ]);

    return { items, total, page, pageSize };
  }

  async clearData(input: unknown, actor: AuditActor) {
    const normalized = normalizeClearInput(input);
    if (!DATA_CLEAR_CONFIRMATION_PHRASES.has(normalized.confirmationPhrase)) {
      await this.audit.record({
        actor,
        action: "data_clear",
        target: normalized.scope,
        detail: { scope: normalized.scope, result: "rejected", reason: "confirmation_phrase_mismatch" }
      });
      throw new BadRequestException({
        code: "DATA_CLEAR_CONFIRMATION_MISMATCH",
        message: `confirmationPhrase must equal ${UI_DATA_CLEAR_CONFIRMATION_PHRASE}`
      });
    }

    let fileDetail: Record<string, unknown> = {};
    let result = "success";
    if (normalized.scope === "questions" || normalized.scope === "all") {
      try {
        await this.removeUploads();
        fileDetail = { fileResult: "success" };
      } catch (error) {
        result = "partial_success";
        fileDetail = { fileResult: "failed", fileError: errorMessage(error) };
      }
    }

    const dbDetail = {
      dbResult: "success",
      ...(normalized.scope === "questions"
        ? { deletedQuestionBoundRecords: ["bookmarks", "mistakes", "practiceAttempts"] }
        : {})
    };
    const detail = { scope: normalized.scope, result, ...dbDetail, ...fileDetail };

    try {
      await this.db.client.transaction(async (tx) => {
        if (normalized.scope === "activity" || normalized.scope === "all") {
          await deleteActivity(tx);
        }
        if (normalized.scope === "questions") {
          await deleteQuestionBoundRecords(tx);
          await tx.delete(questions);
        }
        if (normalized.scope === "all") {
          await tx.delete(questions);
          await tx.delete(ipRoleBindings);
        }
        await this.audit.record(
          {
            actor,
            action: "data_clear",
            target: normalized.scope,
            detail
          },
          tx
        );
      });
    } catch (error) {
      await this.audit.record({
        actor,
        action: "data_clear",
        target: normalized.scope,
        detail: { scope: normalized.scope, result: "failed", dbResult: "failed", reason: errorMessage(error) }
      });
      throw error;
    }

    return detail;
  }
}

function roleBindingItem(input: {
  ip: string;
  role: Role;
  description: string;
  source: RoleBindingSource;
  updatedAt: Date | null;
}) {
  const permissionKeys = permissionsForRole(input.role);
  const permissions = permissionKeys.map((permission) => PERMISSION_LABELS[permission]);

  return {
    ip: input.ip,
    role: input.role,
    fixedRole: ROLE_LABELS[input.role],
    permissionKeys,
    permissionScope: permissions,
    permissions,
    description: input.description,
    source: input.source,
    canDelete: input.source === "binding",
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

async function deleteActivity(tx: DbExecutor): Promise<void> {
  await tx.delete(bookmarks);
  await tx.delete(mistakes);
  await tx.delete(practiceAttempts);
  await tx.delete(examAttempts);
}

async function deleteQuestionBoundRecords(tx: DbExecutor): Promise<void> {
  await tx.delete(bookmarks);
  await tx.delete(mistakes);
  await tx.delete(practiceAttempts);
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
  return [
    ...new Set(
      parseCsv(process.env.SYSTEM_ADMIN_IPS)
        .map(normalizeIpv4)
        .filter((ip): ip is string => ip !== null)
    )
  ];
}

function rejectEnvSystemAdminIp(ip: string): void {
  if (systemAdminIpList().includes(ip)) {
    throw invalidSettingsInput("SYSTEM_ADMIN_IPS entries cannot be managed through IP role bindings");
  }
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

async function countAuditLogs(db: DbExecutor): Promise<number> {
  const rows = await db.select({ value: count() }).from(auditLogs);
  return rows[0]?.value ?? 0;
}

function requireRow<T>(row: T | undefined, message: string): T {
  if (row === undefined) {
    throw new Error(message);
  }
  return row;
}

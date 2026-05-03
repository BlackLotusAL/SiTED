import type { Role } from "../domain/constants";

const LEARNER_PERMISSIONS = [
  "question:browse",
  "practice:use",
  "recite:use",
  "mistake:review",
  "bookmark:use",
  "exam:use"
] as const;

const CONTENT_ADMIN_PERMISSIONS = [
  "question:create",
  "question:edit",
  "question:archive",
  "question:import",
  "question:export",
  "stats:view_basic"
] as const;

const SYSTEM_ADMIN_PERMISSIONS = [
  "ip_role:write",
  "data:clear",
  "audit:view",
  "config:reload"
] as const;

export type Permission =
  | (typeof LEARNER_PERMISSIONS)[number]
  | (typeof CONTENT_ADMIN_PERMISSIONS)[number]
  | (typeof SYSTEM_ADMIN_PERMISSIONS)[number];

export function permissionsForRole(role: Role): Permission[] {
  if (role === "learner") {
    return [...LEARNER_PERMISSIONS];
  }

  if (role === "content_admin") {
    return [...LEARNER_PERMISSIONS, ...CONTENT_ADMIN_PERMISSIONS];
  }

  return [...LEARNER_PERMISSIONS, ...CONTENT_ADMIN_PERMISSIONS, ...SYSTEM_ADMIN_PERMISSIONS];
}

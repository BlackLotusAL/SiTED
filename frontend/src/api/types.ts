import type { Role } from "../domain/labels";

export type Permission =
  | "question:browse"
  | "practice:use"
  | "recite:use"
  | "mistake:review"
  | "bookmark:use"
  | "exam:use"
  | "question:create"
  | "question:edit"
  | "question:archive"
  | "question:import"
  | "question:export"
  | "stats:view_basic"
  | "ip_role:write"
  | "data:clear"
  | "audit:view"
  | "config:reload";

export interface Identity {
  ip: string;
  role: Role;
  roleLabel: string;
  permissions: Permission[];
}

export interface ApiErrorBody {
  code: string;
  message: string;
}

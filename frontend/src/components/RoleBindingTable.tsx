import { Trash2 } from "lucide-react";
import type { Permission } from "../api/types";
import type { Role } from "../domain/labels";

export type RoleBindingSource = "system" | "binding";

export interface RoleBindingRow {
  ip: string;
  role: Role;
  fixedRole: string;
  permissionKeys?: Permission[];
  permissionScope: string[];
  permissions: string[];
  description: string;
  source: RoleBindingSource;
  canDelete: boolean;
  updatedAt: string | null;
}

interface RoleBindingTableProps {
  deletingIp?: string | null;
  onDelete: (row: RoleBindingRow) => void;
  rows: RoleBindingRow[];
}

const PERMISSION_GROUPS: Array<{ label: string; keys: Permission[] }> = [
  { label: "题库浏览", keys: ["question:browse"] },
  { label: "题库练习", keys: ["practice:use", "recite:use", "mistake:review", "bookmark:use"] },
  { label: "模拟考试", keys: ["exam:use"] },
  { label: "题库维护", keys: ["question:create", "question:edit", "question:archive"] },
  { label: "导入导出", keys: ["question:import", "question:export"] },
  { label: "运营看板", keys: ["stats:view_basic"] },
  { label: "系统配置", keys: ["ip_role:write", "audit:view", "config:reload"] },
  { label: "数据清空", keys: ["data:clear"] }
];

export function RoleBindingTable({ deletingIp = null, onDelete, rows }: RoleBindingTableProps) {
  return (
    <table aria-label="IP 固定角色绑定" className="role-binding-table">
      <thead>
        <tr>
          <th scope="col">IP 地址</th>
          <th scope="col">固定角色</th>
          <th scope="col">权限范围</th>
          <th scope="col">说明</th>
          <th scope="col">更新时间</th>
          <th scope="col">操作</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td className="table-empty" colSpan={6}>
              暂无固定角色绑定
            </td>
          </tr>
        ) : (
          rows.map((row) => {
            const permissionGroups = displayPermissionGroups(row);

            return (
              <tr key={row.ip}>
                <th scope="row">
                  <strong>{row.ip}</strong>
                </th>
                <td>{row.fixedRole}</td>
                <td>
                  <div className="permission-list">
                    {permissionGroups.map((permission) => (
                      <span key={permission}>{permission}</span>
                    ))}
                  </div>
                </td>
                <td>{row.description}</td>
                <td>{formatUpdatedAt(row.updatedAt)}</td>
                <td>
                  {row.canDelete ? (
                    <button
                      aria-label={`删除 ${row.ip}`}
                      className="text-button danger-text-button"
                      disabled={deletingIp === row.ip}
                      onClick={() => onDelete(row)}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" size={16} />
                      {deletingIp === row.ip ? "删除中" : "删除"}
                    </button>
                  ) : (
                    <span className="muted-cell">系统配置</span>
                  )}
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}

export function summarizePermissionGroups(permissionKeys: Permission[]): string[] {
  const availablePermissions = new Set(permissionKeys);

  return PERMISSION_GROUPS.filter((group) => group.keys.some((permission) => availablePermissions.has(permission))).map(
    (group) => group.label
  );
}

function displayPermissionGroups(row: RoleBindingRow): string[] {
  const permissionGroups = summarizePermissionGroups(row.permissionKeys ?? []);
  return permissionGroups.length > 0 ? permissionGroups : row.permissions;
}

function formatUpdatedAt(value: string | null): string {
  if (value === null || value === "") {
    return "-";
  }

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const year = parsed.getFullYear();
  const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
  const day = `${parsed.getDate()}`.padStart(2, "0");
  const hours = `${parsed.getHours()}`.padStart(2, "0");
  const minutes = `${parsed.getMinutes()}`.padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

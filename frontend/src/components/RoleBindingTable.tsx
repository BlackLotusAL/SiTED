import type { Role } from "../domain/labels";

export interface RoleBindingRow {
  ip: string;
  role: Role;
  roleLabel: string;
  permissions: string[];
  description: string;
  updatedAt: string;
}

interface RoleBindingTableProps {
  rows: RoleBindingRow[];
}

export function RoleBindingTable({ rows }: RoleBindingTableProps) {
  return (
    <table aria-label="IP 固定角色绑定" className="role-binding-table">
      <thead>
        <tr>
          <th scope="col">IP 地址</th>
          <th scope="col">固定角色</th>
          <th scope="col">权限范围</th>
          <th scope="col">说明</th>
          <th scope="col">更新时间</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.ip}>
            <td>
              <strong>{row.ip}</strong>
            </td>
            <td>{row.roleLabel}</td>
            <td>
              <div className="permission-list">
                {row.permissions.map((permission) => (
                  <span key={permission}>{permission}</span>
                ))}
              </div>
            </td>
            <td>{row.description}</td>
            <td>{row.updatedAt}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

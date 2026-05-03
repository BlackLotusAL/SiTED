import { Plus, Trash2 } from "lucide-react";
import { RoleBindingTable, type RoleBindingRow } from "../components/RoleBindingTable";

const roleBindings: RoleBindingRow[] = [
  {
    ip: "10.42.18.36",
    role: "system_admin",
    roleLabel: "系统管理员",
    permissions: ["系统配置", "IP 角色绑定", "题库维护", "数据清空", "审计日志查看"],
    description: "平台运维负责人与默认系统管理员",
    updatedAt: "2026-05-03 18:20"
  },
  {
    ip: "10.42.20.17",
    role: "content_admin",
    roleLabel: "题库管理员",
    permissions: ["题目新增", "题目发布", "图片维护", "导入导出", "运营看板只读"],
    description: "题库内容维护",
    updatedAt: "2026-05-03 16:08"
  }
];

export function AdminSettingsPage() {
  return (
    <div className="settings-layout">
      <section className="panel">
        <div className="panel-heading compact">
          <h2>IP 固定角色管理</h2>
          <button className="primary-button" type="button">
            <Plus aria-hidden="true" size={17} />
            新增绑定
          </button>
        </div>
        <RoleBindingTable rows={roleBindings} />
      </section>

      <section className="panel danger-zone" aria-label="数据清空">
        <h2>数据清空</h2>
        <p>清空操作需要输入确认短语，执行结果会写入审计日志。选择题库或全部范围时，会同步删除题库图片目录。</p>
        <div className="danger-actions">
          <label>
            确认短语
            <input placeholder="输入确认短语后继续" />
          </label>
          <button className="danger-button" type="button">
            <Trash2 aria-hidden="true" size={17} />
            进入清空流程
          </button>
        </div>
      </section>
    </div>
  );
}

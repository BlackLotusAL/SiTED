import { AlertCircle, Plus, Save, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { apiClient } from "../api/client";
import type { Permission } from "../api/types";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { RoleBindingTable, summarizePermissionGroups, type RoleBindingRow } from "../components/RoleBindingTable";
import type { Role } from "../domain/labels";
import { useStaleResource } from "../hooks/useStaleResource";

type EditableBindingRole = Extract<Role, "learner" | "content_admin">;
type ClearScope = "activity" | "questions" | "all";

interface RoleBindingListResponse {
  headers: string[];
  items: RoleBindingRow[];
}

interface BindingDraft {
  ip: string;
  role: EditableBindingRole;
  description: string;
}

interface ClearDataResponse {
  scope: ClearScope;
  result: string;
  dbResult: string;
  fileResult?: string;
}

const CLEAR_CONFIRMATION_PHRASE = "确认清空";
const TOAST_AUTO_DISMISS_MS = 4000;

const INITIAL_BINDING_DRAFT: BindingDraft = {
  ip: "",
  role: "content_admin",
  description: ""
};

const ROLE_OPTIONS: Array<{ value: EditableBindingRole; label: string }> = [
  { value: "content_admin", label: "题库管理员" },
  { value: "learner", label: "学习者" }
];

const ROLE_PERMISSION_KEYS: Record<EditableBindingRole, Permission[]> = {
  content_admin: [
    "question:browse",
    "practice:use",
    "recite:use",
    "mistake:review",
    "bookmark:use",
    "exam:use",
    "question:create",
    "question:edit",
    "question:archive",
    "question:import",
    "question:export",
    "stats:view_basic"
  ],
  learner: ["question:browse", "practice:use", "recite:use", "mistake:review", "bookmark:use", "exam:use"]
};

const CLEAR_SCOPE_OPTIONS: Array<{ value: ClearScope; label: string; description: string }> = [
  {
    value: "activity",
    label: "仅清空练习与考试记录",
    description: "保留题库、访客身份、固定角色绑定与审计日志。"
  },
  {
    value: "questions",
    label: "清空题库与题目关联记录",
    description: "删除题库、错题、收藏、练习记录，并同步删除题库图片目录。"
  },
  {
    value: "all",
    label: "清空全部业务数据",
    description: "删除题库、练习考试记录和数据库中的 IP 固定角色绑定，保留审计日志。"
  }
];

export function AdminSettingsPage() {
  const [bindingDraft, setBindingDraft] = useState<BindingDraft>(INITIAL_BINDING_DRAFT);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [isSavingBinding, setIsSavingBinding] = useState(false);
  const [deletingIp, setDeletingIp] = useState<string | null>(null);
  const [pendingDeleteBinding, setPendingDeleteBinding] = useState<RoleBindingRow | null>(null);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [confirmationPhrase, setConfirmationPhrase] = useState("");
  const [isClearFlowOpen, setIsClearFlowOpen] = useState(false);
  const [clearScope, setClearScope] = useState<ClearScope>("activity");
  const [isClearing, setIsClearing] = useState(false);
  const [clearMessage, setClearMessage] = useState<string | null>(null);
  const [clearError, setClearError] = useState<string | null>(null);

  const canStartClear = confirmationPhrase === CLEAR_CONFIRMATION_PHRASE;
  const activeErrorMessage = settingsError ?? clearError;
  const roleBindingsResource = useStaleResource<RoleBindingListResponse>({
    key: "/admin/settings/ip-role-bindings",
    load: async () => (await apiClient.get<RoleBindingListResponse>("/admin/settings/ip-role-bindings")) ?? { headers: [], items: [] }
  });
  const roleBindings = roleBindingsResource.data?.items ?? [];
  const permissionPreview = useMemo(
    () => summarizePermissionGroups(ROLE_PERMISSION_KEYS[bindingDraft.role]),
    [bindingDraft.role]
  );

  useEffect(() => {
    if (activeErrorMessage === null) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSettingsError(null);
      setClearError(null);
    }, TOAST_AUTO_DISMISS_MS);

    return () => window.clearTimeout(timeoutId);
  }, [activeErrorMessage]);

  useEffect(() => {
    if (roleBindingsResource.error && roleBindingsResource.data === undefined) {
      setSettingsError(errorMessage(roleBindingsResource.error));
    }
  }, [roleBindingsResource.data, roleBindingsResource.error]);

  async function handleAddBinding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingBinding(true);
    setSettingsMessage(null);
    setSettingsError(null);

    try {
      await apiClient.post("/admin/settings/ip-role-bindings", {
        ip: bindingDraft.ip.trim(),
        role: bindingDraft.role,
        description: bindingDraft.description.trim()
      });
      setBindingDraft(INITIAL_BINDING_DRAFT);
      setIsAddFormOpen(false);
      setSettingsMessage("固定角色绑定已保存。");
      await roleBindingsResource.refresh();
    } catch (error) {
      setSettingsError(errorMessage(error));
    } finally {
      setIsSavingBinding(false);
    }
  }

  function handleDeleteBinding(row: RoleBindingRow) {
    setPendingDeleteBinding(row);
    setSettingsMessage(null);
    setSettingsError(null);
  }

  async function confirmDeleteBinding() {
    if (pendingDeleteBinding === null || deletingIp !== null) {
      return;
    }

    const row = pendingDeleteBinding;
    setDeletingIp(row.ip);
    setSettingsMessage(null);
    setSettingsError(null);

    try {
      await apiClient.delete(`/admin/settings/ip-role-bindings/${encodeURIComponent(row.ip)}`);
      setPendingDeleteBinding(null);
      setSettingsMessage(`${row.ip} 的固定角色绑定已删除。`);
      await roleBindingsResource.refresh();
    } catch (error) {
      setSettingsError(errorMessage(error));
    } finally {
      setDeletingIp(null);
    }
  }

  function cancelDeleteBinding() {
    if (deletingIp !== null) {
      return;
    }

    setPendingDeleteBinding(null);
  }

  function handleStartClearFlow() {
    if (!canStartClear) {
      return;
    }

    setIsClearFlowOpen(true);
    setClearError(null);
    setClearMessage(null);
  }

  async function handleClearData(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsClearing(true);
    setClearError(null);
    setClearMessage(null);

    try {
      const response = await apiClient.post<ClearDataResponse>("/admin/settings/data-clear", {
        scope: clearScope,
        confirmationPhrase
      });
      setClearMessage(clearSuccessMessage(response));
      await roleBindingsResource.refresh();
    } catch (error) {
      setClearError(errorMessage(error));
    } finally {
      setIsClearing(false);
    }
  }

  return (
    <div className="settings-layout">
      {activeErrorMessage ? <StatusToast message={activeErrorMessage} /> : null}
      <section className="panel">
        <div className="panel-heading compact">
          <h2>IP 固定角色管理</h2>
          {isAddFormOpen ? null : (
            <button className="primary-button" onClick={() => setIsAddFormOpen(true)} type="button">
              <Plus aria-hidden="true" size={17} />
              新增绑定
            </button>
          )}
        </div>

        {isAddFormOpen ? (
          <form className="role-binding-form" onSubmit={handleAddBinding}>
            <div className="settings-form-grid">
              <label>
                IP 地址
                <input
                  onChange={(event) => setBindingDraft((draft) => ({ ...draft, ip: event.target.value }))}
                  placeholder="例如 10.0.0.9"
                  required
                  value={bindingDraft.ip}
                />
              </label>
              <label>
                固定角色
                <select
                  onChange={(event) =>
                    setBindingDraft((draft) => ({ ...draft, role: event.target.value as EditableBindingRole }))
                  }
                  value={bindingDraft.role}
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                说明
                <input
                  maxLength={200}
                  onChange={(event) => setBindingDraft((draft) => ({ ...draft, description: event.target.value }))}
                  placeholder="用途或负责人"
                  value={bindingDraft.description}
                />
              </label>
            </div>
            <div className="permission-preview" aria-label="权限范围预览">
              <span>权限范围</span>
              <div className="permission-list">
                {permissionPreview.map((permission) => (
                  <span key={permission}>{permission}</span>
                ))}
              </div>
            </div>
            <div className="settings-form-actions">
              <button className="secondary-button" onClick={() => setIsAddFormOpen(false)} type="button">
                取消
              </button>
              <button className="primary-button" disabled={isSavingBinding || bindingDraft.ip.trim() === ""} type="submit">
                <Save aria-hidden="true" size={17} />
                {isSavingBinding ? "保存中" : "保存绑定"}
              </button>
            </div>
          </form>
        ) : null}

        {settingsMessage ? <p className="status-message success">{settingsMessage}</p> : null}
        {roleBindingsResource.isInitialLoading ? (
          <LoadingSkeleton variant="role-bindings" />
        ) : (
          <RoleBindingTable deletingIp={deletingIp} onDelete={handleDeleteBinding} rows={roleBindings} />
        )}
      </section>

      <section className="panel danger-zone" aria-label="数据清空">
        <h2>数据清空</h2>
        <p>
          清空操作需要输入确认短语“{CLEAR_CONFIRMATION_PHRASE}”，执行结果会写入审计日志。选择题库或全部范围时，会同步删除题库图片目录。
        </p>
        <div className="danger-actions">
          <input
            aria-label="输入确认短语"
            onChange={(event) => {
              setConfirmationPhrase(event.target.value);
              setIsClearFlowOpen(false);
              setClearMessage(null);
              setClearError(null);
            }}
            placeholder="输入确认清空后继续"
            value={confirmationPhrase}
          />
          <button className="danger-button" disabled={!canStartClear} onClick={handleStartClearFlow} type="button">
            <Trash2 aria-hidden="true" size={17} />
            进入清空流程
          </button>
        </div>

        {isClearFlowOpen ? (
          <form className="clear-flow" onSubmit={handleClearData}>
            <fieldset aria-label="清空范围" className="clear-scope-group">
              <legend>清空范围</legend>
              {CLEAR_SCOPE_OPTIONS.map((option) => (
                <label className="radio-option" key={option.value}>
                  <input
                    aria-label={option.label}
                    checked={clearScope === option.value}
                    name="clearScope"
                    onChange={() => setClearScope(option.value)}
                    type="radio"
                    value={option.value}
                  />
                  <span>{option.label}</span>
                  <small>{option.description}</small>
                </label>
              ))}
            </fieldset>
            <p className="danger-feedback">
              下一步会直接执行清空操作并写入审计日志；默认范围只清空练习与考试记录。
            </p>
            <button className="danger-button" disabled={isClearing} type="submit">
              <Trash2 aria-hidden="true" size={17} />
              {isClearing ? "清空中" : "确认清空数据"}
            </button>
          </form>
        ) : null}

        {clearMessage ? (
          <p className="status-message success" role="status">
            {clearMessage}
          </p>
        ) : null}
      </section>

      {pendingDeleteBinding ? (
        <motion.div
          className="dialog-backdrop"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.16 }}
        >
          <motion.section
            aria-describedby="delete-binding-description"
            aria-labelledby="delete-binding-title"
            aria-modal="true"
            className="confirm-dialog"
            role="dialog"
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
          >
            <div className="confirm-dialog-icon">
              <Trash2 aria-hidden="true" size={22} />
            </div>
            <div className="confirm-dialog-copy">
              <h3 id="delete-binding-title">确认删除绑定</h3>
              <p id="delete-binding-description">
                将删除 IP <strong>{pendingDeleteBinding.ip}</strong> 的固定角色绑定，删除后该 IP 会恢复为默认身份识别规则。
              </p>
            </div>
            <div className="confirm-dialog-actions">
              <button className="secondary-button" disabled={deletingIp !== null} onClick={cancelDeleteBinding} type="button">
                取消
              </button>
              <button
                className="danger-button"
                disabled={deletingIp === pendingDeleteBinding.ip}
                onClick={() => void confirmDeleteBinding()}
                type="button"
              >
                <Trash2 aria-hidden="true" size={17} />
                {deletingIp === pendingDeleteBinding.ip ? "删除中" : "确认删除"}
              </button>
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </div>
  );
}

function StatusToast({ message }: { message: string }) {
  return (
    <div className="toast-region">
      <motion.div
        className="status-toast error"
        role="alert"
        initial={{ opacity: 0, y: -10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
      >
        <AlertCircle aria-hidden="true" size={17} />
        <span>{message}</span>
      </motion.div>
    </div>
  );
}

function clearSuccessMessage(response: ClearDataResponse | undefined): string {
  if (response?.result === "partial_success") {
    return "数据库清空已完成，题库图片目录清理失败，请查看审计日志。";
  }

  return "数据清空已完成，结果已写入审计日志。";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "操作失败，请稍后重试。";
}

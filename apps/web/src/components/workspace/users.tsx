import { useEffect, useMemo, useState } from 'react';
import { Copy, KeyRound, Plus, RefreshCw, ShieldCheck, UserPlus, Users } from 'lucide-react';
import type { UserProfile } from '@buggy/shared-types';
import { api } from '../../api.js';
import { systemPermissions, userStatuses } from '../../app/constants.js';
import { userStatusLabel } from '../../app/workspace-utils.js';
import { labelOf } from '../../labels.js';
import { Button } from '../ui/button.js';
import { Field, FieldLabel } from '../ui/form.js';
import { Input } from '../ui/input.js';
import { ConfirmDialog, DataPage, DataTable, Drawer, EmptyState, HookForm, MetricCard, Pagination, SearchBox, StatusBadge } from './common.js';

type PendingChange = { user: UserProfile; field: 'systemPermission' | 'status'; value: string };
type TemporaryPassword = { user: UserProfile; value: string };

export function UserManagementSection(props: {
  currentUser: UserProfile;
  users: UserProfile[];
  onRefresh: () => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const currentPermission = props.currentUser.systemPermission || props.currentUser.role;
  const canManage = currentPermission === 'admin' || currentPermission === 'maintainer';
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [resetTarget, setResetTarget] = useState<UserProfile | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<TemporaryPassword | null>(null);
  const [working, setWorking] = useState(false);
  const filtered = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) return props.users;
    return props.users.filter((user) =>
      `${user.username} ${user.email} ${labelOf(user.systemPermission || user.role)} ${userStatusLabel(user.status)}`.toLowerCase().includes(normalized)
    );
  }, [props.users, keyword]);
  const pageSize = 10;
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const activeCount = props.users.filter((user) => user.status === 'active').length;
  const adminCount = props.users.filter((user) => (user.systemPermission || user.role) === 'admin').length;

  const refresh = async () => {
    setWorking(true);
    try {
      await props.onRefresh();
      props.onNotice('用户列表已刷新');
    } catch (error) {
      props.onNotice(readableError(error));
    } finally {
      setWorking(false);
    }
  };

  const applyChange = async () => {
    if (!pending) return;
    setWorking(true);
    try {
      await api.updateUser(pending.user.id, pending.field === 'systemPermission' ? { systemPermission: pending.value as UserProfile['systemPermission'] } : { status: pending.value as UserProfile['status'] });
      await props.onRefresh();
      props.onNotice(pending.field === 'systemPermission' ? '系统权限已更新' : '账号状态已更新');
      setPending(null);
    } catch (error) {
      props.onNotice(readableError(error));
    } finally {
      setWorking(false);
    }
  };

  const resetPassword = async () => {
    if (!resetTarget) return;
    setWorking(true);
    try {
      const result = await api.resetUserPassword(resetTarget.id);
      await props.onRefresh();
      setTemporaryPassword({ user: result.user, value: result.temporaryPassword });
      props.onNotice('临时密码已生成');
      setResetTarget(null);
    } catch (error) {
      props.onNotice(readableError(error));
    } finally {
      setWorking(false);
    }
  };

  if (!canManage) {
    return (
      <DataPage title="用户管理" icon={Users}>
        <EmptyState text="需要系统管理权限" detail="系统账号、系统权限和密码重置仅管理员或维护人员可维护。" />
      </DataPage>
    );
  }

  return (
    <DataPage
      title="用户管理"
      icon={Users}
      metrics={(
        <section className="grid">
          <MetricCard label="系统账号" value={props.users.length} detail={`${activeCount} 个可登录`} tone="info" />
          <MetricCard label="管理员" value={adminCount} detail="拥有全部权限" tone="good" />
          <MetricCard label="禁用账号" value={props.users.length - activeCount} detail="无法登录系统" tone={props.users.length - activeCount ? 'risk' : 'neutral'} />
        </section>
      )}
    >
      <div className="cards">
        <article className="item-card span-two user-admin-panel">
          <div className="user-admin-heading">
            <div>
              <strong>系统账号</strong>
              <p>管理员可以调整系统权限；维护人员可以创建和维护普通用户。</p>
            </div>
            <div className="report-actions">
              <Button type="button" onClick={refresh} disabled={working}><RefreshCw size={15} /> 刷新</Button>
              <Button type="button" variant="primary" onClick={() => setCreating(true)} disabled={working}><UserPlus size={15} /> 新建用户</Button>
            </div>
          </div>
          <div className="account-admin-toolbar">
            <SearchBox value={keyword} onChange={(value) => {
              setKeyword(value);
              setPage(1);
            }} placeholder="搜索用户、邮箱、角色" />
            <span className="toolbar-summary">{filtered.length} / {props.users.length} 个账号</span>
          </div>
          <p className="permission-note">系统权限和账号状态会立即影响登录与项目访问。重置密码会生成一次性临时密码，请及时交给用户。</p>
          <DataTable
            headers={['用户', '邮箱', '系统权限', '状态', '操作']}
            rows={rows.map((user) => [
              <div className="cell-main"><strong>{user.username}</strong><span>{user.id === props.currentUser.id ? '当前账号' : '系统用户'}</span></div>,
              user.email,
              <select value={user.systemPermission || user.role} disabled={working || (currentPermission === 'maintainer' && (user.systemPermission || user.role) !== 'user')} onChange={(event) => setPending({ user, field: 'systemPermission', value: event.target.value })}>
                {systemPermissions.map((permission) => <option key={permission} value={permission}>{labelOf(permission)}</option>)}
              </select>,
              <select value={user.status} disabled={working || user.id === props.currentUser.id} onChange={(event) => setPending({ user, field: 'status', value: event.target.value })}>
                {userStatuses.map((status) => <option key={status} value={status}>{userStatusLabel(status)}</option>)}
              </select>,
              <div className="row-actions">
                {(user.systemPermission || user.role) === 'admin' && <StatusBadge value="admin" />}
                <Button type="button" size="sm" disabled={working || user.id === props.currentUser.id} onClick={() => setResetTarget(user)}>
                  <KeyRound size={14} /> 重置密码
                </Button>
              </div>
            ])}
          />
          <Pagination page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} />
        </article>
      </div>
      <CreateUserDrawer
        open={creating}
        working={working}
        currentPermission={currentPermission}
        onClose={() => setCreating(false)}
        onCreate={async (form) => {
          setWorking(true);
          try {
            await api.createUser({
              username: text(form, 'username'),
              email: text(form, 'email'),
              password: text(form, 'password'),
              systemPermission: text(form, 'systemPermission') as UserProfile['systemPermission'],
              status: text(form, 'status') as UserProfile['status']
            });
            await props.onRefresh();
            props.onNotice('用户已创建');
            setCreating(false);
          } catch (error) {
            props.onNotice(readableError(error));
          } finally {
            setWorking(false);
          }
        }}
      />
      <ConfirmDialog
        open={Boolean(pending)}
        title={pending ? `确认修改 ${pending.user.username}？` : '确认修改账号？'}
        description={pending ? `${pending.field === 'systemPermission' ? '系统权限' : '账号状态'}将变更为 ${pending.field === 'systemPermission' ? labelOf(pending.value) : userStatusLabel(pending.value)}。` : undefined}
        confirmText="确认修改"
        onCancel={() => setPending(null)}
        onConfirm={() => void applyChange()}
      />
      <ConfirmDialog
        open={Boolean(resetTarget)}
        title={resetTarget ? `重置 ${resetTarget.username} 的密码？` : '重置密码？'}
        description="系统会立即生成新的临时密码，旧密码将无法继续登录。"
        confirmText="生成临时密码"
        onCancel={() => setResetTarget(null)}
        onConfirm={() => void resetPassword()}
      />
      <TemporaryPasswordDialog
        row={temporaryPassword}
        onClose={() => setTemporaryPassword(null)}
        onNotice={props.onNotice}
      />
    </DataPage>
  );
}

function CreateUserDrawer(props: {
  open: boolean;
  working: boolean;
  currentPermission: UserProfile['systemPermission'];
  onClose: () => void;
  onCreate: (form: FormData) => Promise<void>;
}) {
  const availablePermissions = props.currentPermission === 'admin' ? systemPermissions : ['user'] as const;
  return (
    <Drawer title="新建系统用户" subtitle="创建后用户可使用初始密码登录" open={props.open} onClose={props.onClose}>
      <HookForm className="drawer-form" defaultValues={{ systemPermission: 'user', status: 'active' }} onSubmit={(form) => props.onCreate(form)}>
        {(register) => (
          <>
            <Field><FieldLabel required>用户名</FieldLabel><Input {...register('username')} minLength={2} required /></Field>
            <Field><FieldLabel required>邮箱</FieldLabel><Input type="email" {...register('email')} required /></Field>
            <Field><FieldLabel required>初始密码</FieldLabel><Input type="password" {...register('password')} minLength={6} required /></Field>
            <Field>
              <FieldLabel required>系统权限</FieldLabel>
              <select {...register('systemPermission')} defaultValue="user">
                {availablePermissions.map((permission) => <option key={permission} value={permission}>{labelOf(permission)}</option>)}
              </select>
            </Field>
            <Field>
              <FieldLabel>账号状态</FieldLabel>
              <select {...register('status')} defaultValue="active">
                {userStatuses.map((status) => <option key={status} value={status}>{userStatusLabel(status)}</option>)}
              </select>
            </Field>
            <div className="form-actions">
              <Button type="button" onClick={props.onClose}>取消</Button>
              <Button type="submit" variant="primary" disabled={props.working}><Plus size={15} /> 创建用户</Button>
            </div>
          </>
        )}
      </HookForm>
    </Drawer>
  );
}

function TemporaryPasswordDialog(props: { row: TemporaryPassword | null; onClose: () => void; onNotice: (message: string) => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setCopied(false);
  }, [props.row?.value]);
  if (!props.row) return null;
  return (
    <div className="confirm-layer" role="presentation">
      <section className="confirm-dialog temporary-password-dialog" role="dialog" aria-modal="true" aria-label="临时密码已生成">
        <h3>临时密码已生成</h3>
        <p>{props.row.user.username} 的旧密码已失效，请将下面的临时密码交给用户。</p>
        <div className="temporary-password-box">
          <ShieldCheck size={18} />
          <strong>{props.row.value}</strong>
        </div>
        <div className="form-actions">
          <Button type="button" onClick={props.onClose}>关闭</Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              void navigator.clipboard.writeText(props.row?.value || '').then(() => {
                setCopied(true);
                props.onNotice('临时密码已复制');
              }).catch(() => props.onNotice('复制失败，请手动选择密码'));
            }}
          >
            <Copy size={15} /> {copied ? '已复制' : '复制密码'}
          </Button>
        </div>
      </section>
    </div>
  );
}

function text(form: FormData, key: string) {
  return String(form.get(key) || '').trim();
}

function readableError(error: unknown) {
  return error instanceof Error ? error.message : String(error || '操作失败');
}

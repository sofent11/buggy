import { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, Bug as BugIcon, CalendarRange, Check, ClipboardCheck, FileSpreadsheet, Flag, FolderKanban, Pencil, Plus, Save, Send, Settings, Trash2, Upload, Users } from 'lucide-react';
import type { Bug, Dictionary, Iteration, Project, ProjectMember, ReportSummary, Requirement, TestCase, TestPlan, TestRunItem, UserProfile } from '@buggy/shared-types';
import type { UseFormRegister } from 'react-hook-form';
import { api, downloadUrl } from '../../api.js';
import { Button } from '../ui/button.js';
import { Field, FieldLabel, FormActions } from '../ui/form.js';
import { Input } from '../ui/input.js';
import { Textarea } from '../ui/textarea.js';
import { labelOf } from '../../labels.js';
import { bugStatuses, caseStatuses, iterationStatuses, planStatuses, priorities, requirementStatuses, runStatuses, severities, systemRoles, userStatuses } from '../../app/constants.js';
import type { StringFormValues } from '../../app/types.js';
import { bugPayload, dateInput, dateRange, executionProgress, formatDictionaryValues, importMessage, iterationName, matchKeyword, parseDictionaryValues, rate, requirementPayload, requirementTitle, testCasePayload, text, userName, userStatusLabel } from '../../app/workspace-utils.js';
import { CardHeader, DangerButton, Drawer, EmptyState, ExportLink, HookForm, registerField, SearchBox, Section, Select, Table, TemplateLink, Toolbar, Metric } from './common.js';

export function ReportSection(props: { projectId: string; report: ReportSummary | null }) {
  const report = props.report;
  return (
    <Section title="统计报告" icon={BarChart3}>
      <div className="report-actions">
        <a className="primary link-button" href={downloadUrl(`/reports/html?projectId=${props.projectId}`)} target="_blank" rel="noreferrer">
          打开 HTML 报告
        </a>
        <ExportLink projectId={props.projectId} type="requirements" label="导出需求" />
        <ExportLink projectId={props.projectId} type="test-cases" label="导出用例" />
        <ExportLink projectId={props.projectId} type="bugs" label="导出 Bug" />
      </div>
      {report ? (
        <>
          <div className="grid report-grid">
            <Metric label="需求完成率" value={rate(report.requirements.done, report.requirements.total)} detail={`${report.requirements.done}/${report.requirements.total}`} />
            <Metric label="用例准备率" value={rate(report.cases.ready, report.cases.total)} detail={`${report.cases.ready}/${report.cases.total}`} />
            <Metric label="执行通过率" value={`${report.execution.passRate}%`} detail={`${report.execution.passed}/${report.execution.total}`} />
            <Metric label="活跃 Bug" value={report.bugs.active} detail={`${report.bugs.total} 总数`} />
          </div>
          <Table
            headers={['域', '核心指标', '明细']}
            rows={[
              ['需求', `${report.requirements.total} 个`, `完成 ${report.requirements.done}，测试中 ${report.requirements.testing}，阻塞 ${report.requirements.blocked}`],
              ['执行', `${report.execution.passRate}% 通过率`, `通过 ${report.execution.passed}，失败 ${report.execution.failed}，阻塞 ${report.execution.blocked}，未测 ${report.execution.untested}`],
              ['Bug', `${report.bugs.active} 个活跃`, `新建 ${report.bugs.open}，处理中 ${report.bugs.inProgress}，已解决 ${report.bugs.resolved}，重开 ${report.bugs.reopened}`]
            ]}
          />
        </>
      ) : (
        <EmptyState text="暂无报告数据" />
      )}
    </Section>
  );
}

export function SettingsSection(props: {
  projectId: string;
  currentUser: UserProfile;
  dictionaries: Dictionary[];
  users: UserProfile[];
  onNotice: (message: string) => void;
  mutate: (action: () => Promise<unknown>, message: string) => Promise<void>;
  mutateWithResult: <T>(action: () => Promise<T>, resolveMessage: (result: T) => string) => Promise<void>;
}) {
  return (
    <Section title="系统配置" icon={Settings}>
      <div className="cards two">
        <article className="item-card">
          <strong>Excel 模板</strong>
          <p>下载模板后可按表头批量导入需求、用例和 Bug。</p>
          <div className="report-actions">
            <TemplateLink type="requirements" label="需求模板" />
            <TemplateLink type="test-cases" label="用例模板" />
            <TemplateLink type="bugs" label="Bug 模板" />
          </div>
        </article>
        <article className="item-card">
          <strong>Excel 导入</strong>
          <p>上传 `.xlsx` 文件，系统会解析首个工作表并按表头导入。</p>
          <form className="stack" onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const file = form.get('file');
            if (!(file instanceof File) || !file.name) {
              props.onNotice('请选择 Excel 文件');
              return;
            }
            props.mutateWithResult(
              () => api.importXlsx(props.projectId, text(form, 'type'), file),
              (result) => importMessage(result)
            );
          }}>
            <select name="type">
              <option value="requirements">需求</option>
              <option value="test-cases">用例</option>
              <option value="bugs">Bug</option>
              <option value="run-results">执行结果</option>
            </select>
            <Input name="file" type="file" accept=".xlsx" />
            <Button variant="primary"><Upload size={15} /> 上传 Excel</Button>
          </form>
        </article>
        <UserAdmin currentUser={props.currentUser} users={props.users} mutate={props.mutate} />
        <DictionaryEditor dictionaries={props.dictionaries} projectId={props.projectId} mutate={props.mutate} />
      </div>
    </Section>
  );
}

export function UserAdmin(props: {
  currentUser: UserProfile;
  users: UserProfile[];
  mutate: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const canManage = props.currentUser.role === 'admin';
  return (
    <article className="item-card span-two">
      <strong>账号权限</strong>
      {!canManage && <p>当前账号可查看用户列表，只有管理员可以调整系统角色和账号状态。</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>用户</th>
              <th>邮箱</th>
              <th>系统角色</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {props.users.map((user) => (
              <tr key={user.id}>
                <td>{user.username}</td>
                <td>{user.email}</td>
                <td>
                  {canManage ? (
                    <select
                      aria-label={`${user.username} 系统角色`}
                      defaultValue={user.role}
                      onChange={(event) => props.mutate(() => api.updateUser(user.id, { role: event.target.value as never }), '用户角色已更新')}
                    >
                      {systemRoles.map((role) => <option key={role} value={role}>{labelOf(role)}</option>)}
                    </select>
                  ) : (
                    labelOf(user.role)
                  )}
                </td>
                <td>
                  {canManage ? (
                    <select
                      aria-label={`${user.username} 账号状态`}
                      defaultValue={user.status}
                      onChange={(event) => props.mutate(() => api.updateUser(user.id, { status: event.target.value as never }), '账号状态已更新')}
                    >
                      {userStatuses.map((status) => <option key={status} value={status}>{userStatusLabel(status)}</option>)}
                    </select>
                  ) : (
                    userStatusLabel(user.status)
                  )}
                </td>
                <td>{user.role === 'admin' ? '管理员' : '可维护'}</td>
              </tr>
            ))}
            {props.users.length === 0 && (
              <tr>
                <td colSpan={5}>暂无用户</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export function DictionaryEditor(props: {
  dictionaries: Dictionary[];
  projectId: string;
  mutate: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [type, setType] = useState('priority');
  const dictionary = props.dictionaries.find((item) => item.type === type);
  return (
    <article className="item-card span-two">
      <strong>字典配置</strong>
      <form className="stack" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const values = parseDictionaryValues(text(form, 'values'));
        props.mutate(() => api.upsertDictionary({ type, projectId: props.projectId, values }), '字典已保存');
      }}>
        <select value={type} onChange={(event) => setType(event.target.value)}>
          <option value="requirementStatus">需求状态</option>
          <option value="testRunStatus">执行状态</option>
          <option value="bugStatus">Bug 状态</option>
          <option value="priority">优先级</option>
          <option value="severity">严重级别</option>
        </select>
        <Textarea key={dictionary?.id || type} name="values" aria-label="字典值" defaultValue={formatDictionaryValues(dictionary?.values || [])} />
        <Button variant="primary" className="fit"><Save size={15} /> 保存字典</Button>
      </form>
    </article>
  );
}

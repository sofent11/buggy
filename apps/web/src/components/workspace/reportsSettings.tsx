import { useMemo, useState } from 'react';
import { BarChart3, Save, Settings, Upload } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Dictionary, ImportPreview, ReportSummary, UserProfile } from '@buggy/shared-types';
import { api, downloadUrl, type ImportResult } from '../../api.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Textarea } from '../ui/textarea.js';
import { labelOf } from '../../labels.js';
import { systemRoles, userStatuses } from '../../app/constants.js';
import { formatDictionaryValues, importMessage, parseDictionaryValues, rate, text, userStatusLabel } from '../../app/workspace-utils.js';
import { ConfirmDialog, DataPage, DataTable, EmptyState, ExportLink, MetricCard, Pagination, SearchBox, StatusBadge, TemplateLink } from './common.js';
import type { Tab } from '../../app/types.js';

const chartColors = ['#2563eb', '#16a34a', '#f97316', '#dc2626', '#7c3aed', '#64748b'];

export function ReportSection(props: { projectId: string; report: ReportSummary | null; onDrilldown?: (tab: Tab, filters: Record<string, string | number | boolean | string[] | undefined>) => void }) {
  const report = props.report;
  return (
    <DataPage title="统计报告" icon={BarChart3}>
      <div className="report-actions">
        <a className="primary link-button" href={downloadUrl(`/reports/html?projectId=${props.projectId}`)} target="_blank" rel="noreferrer">打开 HTML 报告</a>
        <a className="link-button" href={downloadUrl(`/reports/pdf?projectId=${props.projectId}`)}>导出 PDF 报告</a>
        <ExportLink projectId={props.projectId} type="requirements" label="导出需求" />
        <ExportLink projectId={props.projectId} type="test-cases" label="导出用例" />
        <ExportLink projectId={props.projectId} type="bugs" label="导出 Bug" />
        <ExportLink projectId={props.projectId} type="run-results" label="导出执行结果" />
      </div>
      {report ? (
        <>
          <section className="insight-strip">
            <button type="button" className="metric-action" onClick={() => props.onDrilldown?.('requirements', { status: 'done' })}>
              <MetricCard label="需求完成率" value={rate(report.requirements.done, report.requirements.total)} detail={`${report.requirements.done}/${report.requirements.total}`} tone="good" />
            </button>
            <MetricCard label="用例准备率" value={rate(report.cases.ready, report.cases.total)} detail={`${report.cases.ready}/${report.cases.total}`} />
            <button type="button" className="metric-action" onClick={() => props.onDrilldown?.('plans', { status: 'active' })}>
              <MetricCard label="执行通过率" value={`${report.execution.passRate}%`} detail={`${report.execution.passed}/${report.execution.total}`} tone="info" />
            </button>
            <button type="button" className="metric-action" onClick={() => props.onDrilldown?.('bugs', { status: 'open' })}>
              <MetricCard label="活跃 Bug" value={report.bugs.active} detail={`${report.bugs.overdue || 0} 个逾期`} tone={report.bugs.active ? 'risk' : 'good'} />
            </button>
          </section>
          <div className="chart-grid">
            <article className="chart-panel">
              <h3>执行趋势</h3>
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={report.charts?.executionTrend || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="passRate" name="通过率" stroke="#2563eb" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </article>
            <article className="chart-panel">
              <h3>缺陷状态分布</h3>
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie data={report.charts?.bugStatus || []} dataKey="value" nameKey="label" innerRadius={54} outerRadius={88} paddingAngle={2}>
                    {(report.charts?.bugStatus || []).map((entry, index) => <Cell key={entry.key} fill={chartColors[index % chartColors.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </article>
            <article className="chart-panel">
              <h3>优先级分布</h3>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={report.charts?.priority || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" name="数量" radius={[6, 6, 0, 0]} fill="#2563eb" />
                </BarChart>
              </ResponsiveContainer>
            </article>
          </div>
          <DataTable
            headers={['需求', '状态', '用例覆盖', '关联 Bug', '风险截止']}
            emptyText="暂无需求覆盖数据"
            rows={(report.charts?.requirementCoverage || []).map((item) => [
              <button type="button" className="linkish" onClick={() => props.onDrilldown?.('requirements', { keyword: item.title })}>{item.title}</button>,
              <StatusBadge value={item.status} dictionaryType="requirementStatus" />,
              item.caseCount,
              item.bugCount,
              item.dueDate ? item.dueDate.slice(0, 10) : item.riskNote || '-'
            ])}
          />
          <DataTable
            headers={['风险类型', '对象', '原因', '截止时间']}
            emptyText="暂无风险"
            rows={(report.charts?.riskList || []).map((item) => [
              item.type,
              <button type="button" className="linkish" onClick={() => props.onDrilldown?.(item.type === 'bug' ? 'bugs' : item.type === 'execution' ? 'plans' : 'requirements', { keyword: item.title })}>{item.title}</button>,
              item.reason,
              item.dueDate ? item.dueDate.slice(0, 10) : '-'
            ])}
          />
          <DataTable
            headers={['域', '核心指标', '明细']}
            rows={[
              ['需求', `${report.requirements.total} 个`, `完成 ${report.requirements.done}，测试中 ${report.requirements.testing}，阻塞 ${report.requirements.blocked}`],
              ['执行', `${report.execution.passRate}% 通过率`, `通过 ${report.execution.passed}，失败 ${report.execution.failed}，阻塞 ${report.execution.blocked}，未测 ${report.execution.untested}`],
              ['Bug', `${report.bugs.active} 个活跃`, `新建 ${report.bugs.open}，处理中 ${report.bugs.inProgress}，已解决 ${report.bugs.resolved}，重开 ${report.bugs.reopened}`]
            ]}
          />
        </>
      ) : <EmptyState text="暂无报告数据" />}
    </DataPage>
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
  const [lastImport, setLastImport] = useState<ImportResult | null>(null);
  const [importType, setImportType] = useState('requirements');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  return (
    <DataPage title="系统配置" icon={Settings}>
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
          <form className="stack" onSubmit={async (event) => {
            event.preventDefault();
            if (!importFile) {
              props.onNotice('请选择 Excel 文件');
              return;
            }
            await props.mutateWithResult(() => api.importXlsx(props.projectId, importType, importFile), (result) => {
              setLastImport(result);
              setPreview(null);
              return importMessage(result);
            });
          }}>
            <select name="type" value={importType} onChange={(event) => setImportType(event.target.value)}>
              <option value="requirements">需求</option>
              <option value="test-cases">用例</option>
              <option value="bugs">Bug</option>
              <option value="run-results">执行结果</option>
            </select>
            <Input name="file" type="file" accept=".xlsx" onChange={(event) => setImportFile(event.target.files?.[0] || null)} />
            <div className="report-actions">
              <Button type="button" onClick={async () => {
                if (!importFile) {
                  props.onNotice('请选择 Excel 文件');
                  return;
                }
                const result = await api.previewImportXlsx(props.projectId, importType, importFile);
                setPreview(result);
                props.onNotice(`预检完成：${result.validRows}/${result.totalRows} 行可导入`);
              }}><Upload size={15} /> 预检 Excel</Button>
              <Button variant="primary"><Upload size={15} /> 确认导入</Button>
            </div>
          </form>
          {preview && (
            <div className="import-preview">
              <strong>字段映射预览</strong>
              <span>{preview.validRows}/{preview.totalRows} 行可导入，{preview.errors.length} 个错误，{preview.duplicateRows.length} 个重复提示</span>
              <DataTable headers={['字段', '模板列', '匹配表头']} rows={preview.mappings.map((item) => [item.field, item.label, item.sourceHeader || '未匹配'])} />
              {(preview.errors.length > 0 || preview.duplicateRows.length > 0) && (
                <DataTable
                  headers={['行号', '问题']}
                  rows={[
                    ...preview.errors.slice(0, 6).map((error) => [error.row, `${error.field ? `${error.field}: ` : ''}${error.message}`]),
                    ...preview.duplicateRows.slice(0, 4).map((item) => [item.row, item.message])
                  ]}
                />
              )}
            </div>
          )}
          {lastImport && (
            <div className="import-preview">
              <strong>最近导入校验</strong>
              <span>成功 {lastImport.imported} 行，失败 {lastImport.errors.length} 行</span>
              {lastImport.errors.length > 0 && (
                <DataTable headers={['行号', '问题']} rows={lastImport.errors.slice(0, 6).map((error) => [error.row, error.message])} />
              )}
            </div>
          )}
        </article>
        <UserAdmin currentUser={props.currentUser} users={props.users} mutate={props.mutate} />
        <DictionaryEditor dictionaries={props.dictionaries} projectId={props.projectId} mutate={props.mutate} />
      </div>
    </DataPage>
  );
}

export function UserAdmin(props: { currentUser: UserProfile; users: UserProfile[]; mutate: (action: () => Promise<unknown>, message: string) => Promise<void> }) {
  const canManage = props.currentUser.role === 'admin';
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<{ user: UserProfile; field: 'role' | 'status'; value: string } | null>(null);
  const filtered = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) return props.users;
    return props.users.filter((user) => `${user.username} ${user.email} ${labelOf(user.role)} ${userStatusLabel(user.status)}`.toLowerCase().includes(normalized));
  }, [props.users, keyword]);
  const pageSize = 8;
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
  return (
    <article className="item-card span-two">
      <strong>账号权限</strong>
      <div className="account-admin-toolbar">
        <SearchBox value={keyword} onChange={(value) => {
          setKeyword(value);
          setPage(1);
        }} placeholder="搜索用户、邮箱、角色" />
        <span className="toolbar-summary">{filtered.length} / {props.users.length} 个账号</span>
      </div>
      <p className="permission-note">角色和账号状态变更会立即影响登录与项目访问，请确认后再提交。</p>
      <DataTable
        headers={['用户', '邮箱', '系统角色', '状态', '操作']}
        rows={rows.map((user) => [
          user.username,
          user.email,
          canManage ? (
            <select value={user.role} onChange={(event) => setPending({ user, field: 'role', value: event.target.value })}>
              {systemRoles.map((role) => <option key={role} value={role}>{labelOf(role)}</option>)}
            </select>
          ) : labelOf(user.role),
          canManage ? (
            <select value={user.status} onChange={(event) => setPending({ user, field: 'status', value: event.target.value })}>
              {userStatuses.map((status) => <option key={status} value={status}>{userStatusLabel(status)}</option>)}
            </select>
          ) : userStatusLabel(user.status),
          user.role === 'admin' ? <StatusBadge value="admin" /> : '可维护'
        ])}
      />
      <Pagination page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} />
      <ConfirmDialog
        open={Boolean(pending)}
        title={pending ? `确认修改 ${pending.user.username}？` : '确认修改账号？'}
        description={pending ? `${pending.field === 'role' ? '系统角色' : '账号状态'}将变更为 ${pending.field === 'role' ? labelOf(pending.value) : userStatusLabel(pending.value)}。` : undefined}
        confirmText="确认修改"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (!pending) return;
          void props.mutate(
            () => api.updateUser(pending.user.id, pending.field === 'role' ? { role: pending.value as never } : { status: pending.value as never }),
            pending.field === 'role' ? '用户角色已更新' : '账号状态已更新'
          );
          setPending(null);
        }}
      />
    </article>
  );
}

export function DictionaryEditor(props: { dictionaries: Dictionary[]; projectId: string; mutate: (action: () => Promise<unknown>, message: string) => Promise<void> }) {
  const [type, setType] = useState('priority');
  const dictionary = props.dictionaries.find((item) => item.type === type);
  return (
    <article className="item-card span-two">
      <strong>字典配置</strong>
      <form className="stack" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        props.mutate(() => api.upsertDictionary({ type, projectId: props.projectId, values: parseDictionaryValues(text(form, 'values')) }), '字典已保存');
      }}>
        <select value={type} onChange={(event) => setType(event.target.value)}>
          <option value="iterationStatus">迭代状态</option>
          <option value="requirementStatus">需求状态</option>
          <option value="testCaseStatus">用例状态</option>
          <option value="testPlanStatus">测试计划状态</option>
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

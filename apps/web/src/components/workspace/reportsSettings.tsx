import { useEffect, useMemo, useState } from 'react';
import { Download, FileText, Save, Settings, Upload } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Dictionary, ImportPreview, ReportSummary, UserProfile } from '@buggy/shared-types';
import { api, downloadUrl, type ImportResult } from '../../api.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Textarea } from '../ui/textarea.js';
import { labelOf } from '../../labels.js';
import { systemRoles, userStatuses } from '../../app/constants.js';
import { formatDictionaryValues, importMessage, parseDictionaryValues, rate, text, userStatusLabel } from '../../app/workspace-utils.js';
import { ConfirmDialog, DataPage, DataTable, Drawer, EmptyState, MetricCard, Pagination, SearchBox, StatusBadge, TemplateLink } from './common.js';

const chartColors = ['#2563eb', '#16a34a', '#f97316', '#dc2626', '#7c3aed', '#64748b'];

export function ScopedReportDrawer(props: {
  open: boolean;
  title: string;
  subtitle?: string;
  projectId: string;
  iterationId?: string;
  requirementId?: string;
  onClose: () => void;
}) {
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!props.open) return;
    setLoading(true);
    setError('');
    api.reportSummary({ projectId: props.projectId, iterationId: props.iterationId, requirementId: props.requirementId })
      .then(setReport)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [props.open, props.projectId, props.iterationId, props.requirementId]);

  return (
    <Drawer title={props.title} subtitle={props.subtitle} open={props.open} onClose={props.onClose} size="wide">
      {loading && <EmptyState text="正在生成报告" detail="正在汇总需求、用例、执行和 Bug 数据。" />}
      {error && <EmptyState text="报告生成失败" detail={error} />}
      {!loading && !error && report && <ScopedReportContent report={report} query={reportQuery(props)} />}
      {!loading && !error && !report && <EmptyState text="暂无报告数据" />}
    </Drawer>
  );
}

function ScopedReportContent(props: { report: ReportSummary; query: string }) {
  const report = props.report;
  const isRequirement = report.scope.type === 'requirement';
  const activeRisk = report.execution.failed + report.execution.blocked + report.bugs.active + report.requirements.blocked;
  const acceptance = isRequirement
    ? activeRisk === 0 && report.execution.total > 0
      ? { title: '建议通过验收', detail: '当前需求暂无失败/阻塞执行项和活跃 Bug。', tone: 'good' }
      : { title: '建议暂缓验收', detail: '请先处理失败/阻塞执行项、活跃 Bug 或阻塞风险。', tone: 'risk' }
    : null;
  return (
    <div className="scoped-report">
      <div className="report-actions">
        <a className="primary link-button" href={downloadUrl(`/reports/html?${props.query}`)} target="_blank" rel="noreferrer"><FileText size={15} /> 打开 HTML</a>
        <a className="link-button" href={downloadUrl(`/reports/pdf?${props.query}`)}><Download size={15} /> 导出 PDF</a>
      </div>
      {acceptance && (
        <div className={`acceptance-callout tone-${acceptance.tone}`}>
          <strong>{acceptance.title}</strong>
          <span>{acceptance.detail}</span>
        </div>
      )}
          <section className="insight-strip">
            <MetricCard label="需求完成率" value={rate(report.requirements.done, report.requirements.total)} detail={`${report.requirements.done}/${report.requirements.total}`} tone="good" />
            <MetricCard label="用例准备率" value={rate(report.cases.ready, report.cases.total)} detail={`${report.cases.ready}/${report.cases.total}`} />
            <MetricCard label="执行通过率" value={`${report.execution.passRate}%`} detail={`${report.execution.passed}/${report.execution.total}`} tone="info" />
            <MetricCard label="活跃 Bug" value={report.bugs.active} detail={`${report.bugs.overdue || 0} 个逾期`} tone={report.bugs.active ? 'risk' : 'good'} />
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
              item.title,
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
              item.title,
              item.reason,
              item.dueDate ? item.dueDate.slice(0, 10) : '-'
            ])}
          />
          <DataTable
            headers={['覆盖用例', '优先级', '状态']}
            emptyText="暂无覆盖用例"
            rows={(report.details?.cases || []).map((item) => [
              item.title,
              <StatusBadge value={item.priority} dictionaryType="priority" />,
              <StatusBadge value={item.status} dictionaryType="testCaseStatus" />
            ])}
          />
          <DataTable
            headers={['执行计划', '执行项', '状态', '实际结果', '执行时间']}
            emptyText="暂无执行明细"
            rows={(report.details?.executionItems || []).map((item) => [
              `${item.round} · ${item.planName}`,
              item.caseTitle,
              <StatusBadge value={item.status} dictionaryType="testRunStatus" />,
              item.actualResult || '-',
              item.executedAt ? new Date(item.executedAt).toLocaleString('zh-CN') : '-'
            ])}
          />
          <DataTable
            headers={['关联 Bug', '严重级别', '优先级', '状态', '截止时间']}
            emptyText="暂无关联 Bug"
            rows={(report.details?.bugs || []).map((item) => [
              item.title,
              <StatusBadge value={item.severity} dictionaryType="severity" />,
              <StatusBadge value={item.priority} dictionaryType="priority" />,
              <StatusBadge value={item.status} dictionaryType="bugStatus" />,
              item.dueAt ? item.dueAt.slice(0, 10) : '-'
            ])}
          />
    </div>
  );
}

function reportQuery(params: { projectId: string; iterationId?: string; requirementId?: string }) {
  const search = new URLSearchParams();
  search.set('projectId', params.projectId);
  if (params.iterationId) search.set('iterationId', params.iterationId);
  if (params.requirementId) search.set('requirementId', params.requirementId);
  return search.toString();
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

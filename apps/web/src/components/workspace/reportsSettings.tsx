import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, Download, FileText, Plus, Save, Settings, Trash2, Upload, XCircle } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DEFAULT_DICTIONARIES, type Dictionary, type DictionaryValue, type ImportPreview, type ReportSummary, type UserProfile } from '@buggy/shared-types';
import { api, downloadUrl, type ImportResult } from '../../api.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { labelOf } from '../../labels.js';
import { systemRoles, userStatuses } from '../../app/constants.js';
import { importMessage, rate, userStatusLabel } from '../../app/workspace-utils.js';
import { ConfirmDialog, DataPage, DataTable, Drawer, EmptyState, MetricCard, Pagination, SearchBox, StatusBadge, TemplateLink, TextConfirmDialog } from './common.js';

const chartColors = ['#2563eb', '#16a34a', '#f97316', '#dc2626', '#7c3aed', '#64748b'];
const fallbackColor = '#64748b';
const dictionaryTypeOptions = [
  { value: 'iterationStatus', label: '迭代状态' },
  { value: 'requirementStatus', label: '需求状态' },
  { value: 'testCaseStatus', label: '用例状态' },
  { value: 'testPlanStatus', label: '测试计划状态' },
  { value: 'testRunStatus', label: '执行状态' },
  { value: 'bugStatus', label: 'Bug 状态' },
  { value: 'priority', label: '优先级' },
  { value: 'severity', label: '严重级别' }
];

type DictionaryDraft = DictionaryValue & { draftId: string };

let dictionaryDraftId = 0;

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
  const loadReport = useCallback(() => {
    setLoading(true);
    setError('');
    return api.reportSummary({ projectId: props.projectId, iterationId: props.iterationId, requirementId: props.requirementId })
      .then(setReport)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [props.projectId, props.iterationId, props.requirementId]);
  useEffect(() => {
    if (!props.open) return;
    void loadReport();
  }, [props.open, loadReport]);

  return (
    <Drawer title={props.title} subtitle={props.subtitle} open={props.open} onClose={props.onClose} size="wide">
      {loading && <EmptyState text="正在生成报告" detail="正在汇总需求、用例、执行和 Bug 数据。" />}
      {error && <EmptyState text="报告生成失败" detail={error} />}
      {!loading && !error && report && <ScopedReportContent report={report} query={reportQuery(props)} requirementId={props.requirementId} onRefresh={loadReport} />}
      {!loading && !error && !report && <EmptyState text="暂无报告数据" />}
    </Drawer>
  );
}

function ScopedReportContent(props: { report: ReportSummary; query: string; requirementId?: string; onRefresh: () => Promise<void> }) {
  const report = props.report;
  const [signoffAction, setSignoffAction] = useState<'signed' | 'rejected' | null>(null);
  const isRequirement = report.scope.type === 'requirement';
  const gate = report.qualityGate;
  const acceptance = isRequirement
    ? gate?.status === 'pass'
      ? { title: '建议通过验收', detail: gate.summary, tone: 'good' }
      : { title: '建议暂缓验收', detail: gate?.issues?.join('；') || '请先处理失败/阻塞执行项、活跃 Bug 或阻塞风险。', tone: 'risk' }
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
      {isRequirement && props.requirementId && (
        <section className={`report-signoff-card tone-${report.reportSignoff?.status || 'pending'}`}>
          <div>
            <span>报告签核</span>
            <strong>{reportSignoffLabel(report.reportSignoff?.status)}</strong>
            <small>{report.reportSignoff?.signerName ? `${report.reportSignoff.signerName} · ${report.reportSignoff.signedAt ? new Date(report.reportSignoff.signedAt).toLocaleString('zh-CN') : ''}` : '等待负责人确认验收报告'}</small>
            {report.reportSignoff?.note && <p>{report.reportSignoff.note}</p>}
          </div>
          <div className="report-actions">
            <Button type="button" variant="primary" onClick={() => setSignoffAction('signed')}><CheckCircle2 size={15} /> 签核通过</Button>
            <Button type="button" variant="destructive" onClick={() => setSignoffAction('rejected')}><XCircle size={15} /> 驳回</Button>
          </div>
        </section>
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
            headers={['审批动作', '状态变化', '操作人', '说明', '时间']}
            emptyText="暂无验收审批历史"
            rows={(report.details?.requirementHistory || []).map((item) => [
              workflowLabel(item.action),
              item.fromStatus || item.toStatus ? `${item.fromStatus ? labelOf(item.fromStatus) : '-'} -> ${item.toStatus ? labelOf(item.toStatus) : '-'}` : '-',
              item.operatorName || '系统',
              item.note || '-',
              new Date(item.createdAt).toLocaleString('zh-CN')
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
      {props.requirementId && (
        <TextConfirmDialog
          open={Boolean(signoffAction)}
          title={signoffAction === 'signed' ? '签核通过报告？' : '驳回报告？'}
          description={report.scope.name}
          label={signoffAction === 'signed' ? '签核意见' : '驳回原因'}
          placeholder={signoffAction === 'signed' ? '说明验收依据、发布范围或保留风险' : '说明需要补充的证据、未关闭风险或修正项'}
          confirmText={signoffAction === 'signed' ? '签核通过' : '驳回'}
          destructive={signoffAction === 'rejected'}
          onCancel={() => setSignoffAction(null)}
          onConfirm={async (note) => {
            if (!signoffAction || !props.requirementId) return;
            await api.updateRequirement(props.requirementId, { reportSignoffStatus: signoffAction, reportSignoffNote: note });
            setSignoffAction(null);
            await props.onRefresh();
          }}
        />
      )}
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

function workflowLabel(action: string) {
  if (action === 'acceptance_changed') return '验收状态变更';
  if (action === 'status_changed') return '需求状态变更';
  if (action === 'created') return '创建';
  return action;
}

function reportSignoffLabel(status?: string) {
  if (status === 'signed') return '已签核';
  if (status === 'rejected') return '已驳回';
  if (status === 'pending') return '待签核';
  return '未签核';
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
  const dictionary = useMemo(() => preferredDictionary(props.dictionaries, type, props.projectId), [props.dictionaries, props.projectId, type]);
  const [rows, setRows] = useState<DictionaryDraft[]>(() => createDictionaryDrafts(dictionaryValues(dictionary, type)));
  const validRows = useMemo(() => toDictionaryValues(rows), [rows]);
  const duplicateKeys = useMemo(() => duplicatedKeys(rows), [rows]);
  const hasIncompleteRow = rows.some((row) => !row.key.trim() || !row.label.trim());
  const hasInvalidColor = rows.some((row) => row.color && !validHexColor(row.color));
  const editorError = duplicateKeys.length > 0
    ? `标识重复：${duplicateKeys.join('、')}`
    : hasIncompleteRow
      ? '请补全标识和显示名称'
      : hasInvalidColor
        ? '颜色需使用 #RRGGBB'
        : validRows.length === 0
          ? '至少保留一个字典项'
          : '';

  useEffect(() => {
    setRows(createDictionaryDrafts(dictionaryValues(dictionary, type)));
  }, [dictionary, type]);

  function updateRow<T extends keyof DictionaryValue>(draftId: string, field: T, value: DictionaryValue[T]) {
    setRows((current) => current.map((row) => (row.draftId === draftId ? { ...row, [field]: value } : row)));
  }

  function addRow() {
    const maxSort = rows.reduce((max, row) => Math.max(max, Number.isFinite(row.sort) ? row.sort : 0), 0);
    setRows((current) => [
      ...current,
      {
        draftId: createDictionaryDraftId(),
        key: '',
        label: '',
        color: fallbackColor,
        sort: maxSort + 10,
        enabled: true
      }
    ]);
  }

  function moveRow(index: number, offset: -1 | 1) {
    setRows((current) => reindexDraftSort(moveItem(current, index, index + offset)));
  }

  return (
    <article className="item-card span-two">
      <strong>字典配置</strong>
      <form className="stack" onSubmit={(event) => {
        event.preventDefault();
        if (editorError) return;
        props.mutate(() => api.upsertDictionary({ type, projectId: props.projectId, values: validRows }), '字典已保存');
      }}>
        <div className="dictionary-toolbar">
          <label>
            <span>字典类型</span>
            <select value={type} onChange={(event) => setType(event.target.value)}>
              {dictionaryTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <div className="dictionary-summary">
            <span className="dictionary-count">{rows.filter((row) => row.enabled).length} 启用 / {rows.length} 项</span>
            <Button type="button" onClick={addRow}><Plus size={15} /> 新增项</Button>
          </div>
        </div>
        {editorError && <p className="dictionary-error">{editorError}</p>}
        <div className="dictionary-grid">
          <div className="dictionary-header">
            <span>标识</span>
            <span>显示名称</span>
            <span>颜色</span>
            <span>排序</span>
            <span>状态</span>
            <span>预览</span>
            <span>操作</span>
          </div>
          {rows.map((row, index) => (
            <div className={`dictionary-row ${duplicateKeys.includes(row.key.trim()) || !validHexColor(row.color) ? 'has-error' : ''}`} key={row.draftId}>
              <div className="dictionary-field" data-label="标识">
                <Input value={row.key} onChange={(event) => updateRow(row.draftId, 'key', event.target.value)} aria-label="字典项标识" required />
              </div>
              <div className="dictionary-field" data-label="显示名称">
                <Input value={row.label} onChange={(event) => updateRow(row.draftId, 'label', event.target.value)} aria-label="字典项显示名称" required />
              </div>
              <div className="dictionary-field dictionary-color" data-label="颜色">
                <input
                  type="color"
                  value={colorPickerValue(row.color)}
                  onChange={(event) => updateRow(row.draftId, 'color', event.target.value)}
                  aria-label="字典项颜色"
                />
                <Input value={row.color || ''} onChange={(event) => updateRow(row.draftId, 'color', event.target.value)} aria-label="颜色值" pattern="^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$" />
              </div>
              <div className="dictionary-field" data-label="排序">
                <Input
                  type="number"
                  value={Number.isFinite(row.sort) ? row.sort : ''}
                  onChange={(event) => updateRow(row.draftId, 'sort', event.target.valueAsNumber)}
                  aria-label="字典项排序"
                  required
                />
              </div>
              <div className="dictionary-field dictionary-state" data-label="状态">
                <label className="dictionary-switch">
                  <input type="checkbox" checked={row.enabled} onChange={(event) => updateRow(row.draftId, 'enabled', event.target.checked)} />
                  <span>{row.enabled ? '启用' : '停用'}</span>
                </label>
              </div>
              <div className="dictionary-field dictionary-preview" data-label="预览">
                <span className="status-badge" style={dictionaryPreviewStyle(row)}>{row.label || row.key || '未命名'}</span>
              </div>
              <div className="dictionary-actions">
                <Button type="button" size="icon" variant="ghost" title="上移" aria-label="上移" disabled={index === 0} onClick={() => moveRow(index, -1)}>
                  <ArrowUp size={15} />
                </Button>
                <Button type="button" size="icon" variant="ghost" title="下移" aria-label="下移" disabled={index === rows.length - 1} onClick={() => moveRow(index, 1)}>
                  <ArrowDown size={15} />
                </Button>
                <Button type="button" size="icon" variant="ghost" title="删除" aria-label="删除" onClick={() => setRows((current) => current.filter((item) => item.draftId !== row.draftId))}>
                  <Trash2 size={15} />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Button variant="primary" className="fit" disabled={Boolean(editorError)}><Save size={15} /> 保存字典</Button>
      </form>
    </article>
  );
}

function preferredDictionary(dictionaries: Dictionary[], type: string, projectId: string) {
  const scoped = dictionaries.filter((item) => item.type === type);
  return scoped.find((item) => item.projectId === projectId) || scoped.find((item) => item.projectId) || scoped[0];
}

function dictionaryValues(dictionary: Dictionary | undefined, type: string) {
  return dictionary?.values || DEFAULT_DICTIONARIES[type] || [];
}

function createDictionaryDrafts(values: DictionaryValue[]): DictionaryDraft[] {
  return [...values]
    .sort((left, right) => left.sort - right.sort)
    .map((item, index) => ({
      draftId: createDictionaryDraftId(),
      key: item.key,
      label: item.label,
      color: item.color || fallbackColor,
      sort: Number.isFinite(item.sort) ? item.sort : (index + 1) * 10,
      enabled: item.enabled !== false
    }));
}

function createDictionaryDraftId() {
  dictionaryDraftId += 1;
  return `dictionary-draft-${dictionaryDraftId}`;
}

function toDictionaryValues(rows: DictionaryDraft[]): DictionaryValue[] {
  return rows
    .map((row, index) => ({
      key: row.key.trim(),
      label: row.label.trim(),
      color: normalizeColor(row.color),
      sort: Number.isFinite(row.sort) ? row.sort : (index + 1) * 10,
      enabled: row.enabled
    }))
    .filter((row) => row.key && row.label);
}

function normalizeColor(color?: string) {
  const value = color?.trim();
  return value && validHexColor(value) ? value : undefined;
}

function validHexColor(color?: string) {
  const value = color?.trim();
  return !value || /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

function colorPickerValue(color?: string) {
  const value = color?.trim();
  if (!value) return fallbackColor;
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (/^#[0-9a-fA-F]{3}$/.test(value)) return expandHexColor(value);
  return fallbackColor;
}

function expandHexColor(color: string) {
  return `#${color.slice(1).split('').map((char) => `${char}${char}`).join('')}`;
}

function dictionaryPreviewStyle(row: DictionaryDraft) {
  const color = colorPickerValue(row.color);
  const rgb = hexToRgb(color);
  if (!rgb) return undefined;
  return {
    color,
    borderColor: `rgba(${rgb}, 0.32)`,
    background: `rgba(${rgb}, 0.08)`
  };
}

function hexToRgb(color: string) {
  const hex = colorPickerValue(color).slice(1);
  const value = Number.parseInt(hex, 16);
  if (!Number.isFinite(value)) return '';
  return `${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`;
}

function duplicatedKeys(rows: DictionaryDraft[]) {
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  rows.forEach((row) => {
    const key = row.key.trim();
    if (!key) return;
    if (seen.has(key)) duplicated.add(key);
    seen.add(key);
  });
  return [...duplicated];
}

function moveItem<T>(items: T[], from: number, to: number) {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function reindexDraftSort(rows: DictionaryDraft[]) {
  return rows.map((row, index) => ({ ...row, sort: (index + 1) * 10 }));
}

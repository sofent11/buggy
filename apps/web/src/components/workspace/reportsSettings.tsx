import { useState } from 'react';
import { BarChart3, Save, Settings, Upload } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Dictionary, ReportSummary, UserProfile } from '@buggy/shared-types';
import { api, downloadUrl } from '../../api.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Textarea } from '../ui/textarea.js';
import { labelOf } from '../../labels.js';
import { systemRoles, userStatuses } from '../../app/constants.js';
import { formatDictionaryValues, importMessage, parseDictionaryValues, rate, text, userStatusLabel } from '../../app/workspace-utils.js';
import { DataPage, DataTable, EmptyState, ExportLink, MetricCard, StatusBadge, TemplateLink } from './common.js';

const chartColors = ['#2563eb', '#16a34a', '#f97316', '#dc2626', '#7c3aed', '#64748b'];

export function ReportSection(props: { projectId: string; report: ReportSummary | null }) {
  const report = props.report;
  return (
    <DataPage title="统计报告" icon={BarChart3}>
      <div className="report-actions">
        <a className="primary link-button" href={downloadUrl(`/reports/html?projectId=${props.projectId}`)} target="_blank" rel="noreferrer">打开 HTML 报告</a>
        <ExportLink projectId={props.projectId} type="requirements" label="导出需求" />
        <ExportLink projectId={props.projectId} type="test-cases" label="导出用例" />
        <ExportLink projectId={props.projectId} type="bugs" label="导出 Bug" />
      </div>
      {report ? (
        <>
          <section className="insight-strip">
            <MetricCard label="需求完成率" value={rate(report.requirements.done, report.requirements.total)} detail={`${report.requirements.done}/${report.requirements.total}`} tone="good" />
            <MetricCard label="用例准备率" value={rate(report.cases.ready, report.cases.total)} detail={`${report.cases.ready}/${report.cases.total}`} />
            <MetricCard label="执行通过率" value={`${report.execution.passRate}%`} detail={`${report.execution.passed}/${report.execution.total}`} tone="info" />
            <MetricCard label="活跃 Bug" value={report.bugs.active} detail={`${report.bugs.total} 总数`} tone={report.bugs.active ? 'risk' : 'good'} />
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
            const form = new FormData(event.currentTarget);
            const file = form.get('file');
            if (!(file instanceof File) || !file.name) {
              props.onNotice('请选择 Excel 文件');
              return;
            }
            props.mutateWithResult(() => api.importXlsx(props.projectId, text(form, 'type'), file), (result) => importMessage(result));
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
    </DataPage>
  );
}

export function UserAdmin(props: { currentUser: UserProfile; users: UserProfile[]; mutate: (action: () => Promise<unknown>, message: string) => Promise<void> }) {
  const canManage = props.currentUser.role === 'admin';
  return (
    <article className="item-card span-two">
      <strong>账号权限</strong>
      <DataTable
        headers={['用户', '邮箱', '系统角色', '状态', '操作']}
        rows={props.users.map((user) => [
          user.username,
          user.email,
          canManage ? (
            <select value={user.role} onChange={(event) => props.mutate(() => api.updateUser(user.id, { role: event.target.value as never }), '用户角色已更新')}>
              {systemRoles.map((role) => <option key={role} value={role}>{labelOf(role)}</option>)}
            </select>
          ) : labelOf(user.role),
          canManage ? (
            <select value={user.status} onChange={(event) => props.mutate(() => api.updateUser(user.id, { status: event.target.value as never }), '账号状态已更新')}>
              {userStatuses.map((status) => <option key={status} value={status}>{userStatusLabel(status)}</option>)}
            </select>
          ) : userStatusLabel(user.status),
          user.role === 'admin' ? <StatusBadge value="admin" /> : '可维护'
        ])}
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


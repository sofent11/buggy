import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ClipboardCheck, Pencil, Plus, Save } from 'lucide-react';
import type { Bug, PageResult, Requirement, TestCase, TestPlan } from '@buggy/shared-types';
import type { UseFormRegister } from 'react-hook-form';
import { api } from '../../api.js';
import { Button } from '../ui/button.js';
import { Field, FieldLabel, FormActions } from '../ui/form.js';
import { Input } from '../ui/input.js';
import { Textarea } from '../ui/textarea.js';
import { caseStatuses, priorities } from '../../app/constants.js';
import type { StringFormValues } from '../../app/types.js';
import { matchKeyword, requirementTitle, shortDate, testCasePayload } from '../../app/workspace-utils.js';
import { ColumnChooser, DataPage, DataTable, DangerButton, Drawer, EmptyState, HookForm, MetricCard, Pagination, registerField, SearchBox, Select, StatusBadge, StepEditor, Toolbar } from './common.js';

const caseColumns = [
  { key: 'case', label: '用例', locked: true, sortKey: 'title' },
  { key: 'requirement', label: '需求' },
  { key: 'steps', label: '步骤' },
  { key: 'coverage', label: '执行覆盖' },
  { key: 'bugs', label: '关联 Bug' },
  { key: 'priority', label: '优先级', sortKey: 'priority' },
  { key: 'status', label: '状态', sortKey: 'status' },
  { key: 'updatedAt', label: '更新时间', sortKey: 'updatedAt' },
  { key: 'actions', label: '操作', locked: true }
];

const defaultCaseColumns = caseColumns.map((column) => column.key);

export function CaseSection(props: {
  projectId: string;
  requirements: Requirement[];
  plans?: TestPlan[];
  bugs?: Bug[];
  rows: TestCase[];
  globalKeyword?: string;
  canWrite?: boolean;
  canManage?: boolean;
  mutate: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [keyword, setKeyword] = useState('');
  const [requirementId, setRequirementId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [visibleColumns, setVisibleColumns] = useState(defaultCaseColumns);
  const [pageResult, setPageResult] = useState<PageResult<TestCase>>({ total: props.rows.length, page: 1, pageSize, items: props.rows.slice(0, pageSize) });
  const [loadingPage, setLoadingPage] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TestCase | null>(null);
  const effectiveKeyword = keyword || props.globalKeyword || '';
  const rows = pageResult.items;
  const ready = props.rows.filter((row) => row.status === 'ready').length;
  const runItemsByCase = useMemo(() => {
    const map = new Map<string, { total: number; failed: number; passed: number; bugCount: number }>();
    for (const plan of props.plans || []) {
      for (const item of plan.runItems) {
        const current = map.get(item.caseId) || { total: 0, failed: 0, passed: 0, bugCount: 0 };
        current.total += 1;
        if (item.status === 'failed') current.failed += 1;
        if (item.status === 'passed') current.passed += 1;
        current.bugCount += item.bugIds.length;
        map.set(item.caseId, current);
      }
    }
    return map;
  }, [props.plans]);

  useEffect(() => {
    setPage(1);
  }, [effectiveKeyword, requirementId, status, pageSize]);

  useEffect(() => {
    let active = true;
    setLoadingPage(true);
    api
      .testCasePage(props.projectId, { page, pageSize, keyword: effectiveKeyword, requirementId, status, sortBy, sortOrder })
      .then((result) => {
        if (active) setPageResult(result);
      })
      .catch(() => {
        if (!active) return;
        const fallback = props.rows.filter((row) => (!requirementId || row.requirementId === requirementId) && (!status || row.status === status) && matchKeyword([row.title, row.expectedResult || '', row.priority, row.steps.map((step) => step.action).join(' ')], effectiveKeyword));
        setPageResult({ total: fallback.length, page, pageSize, items: fallback.slice((page - 1) * pageSize, page * pageSize) });
      })
      .finally(() => {
        if (active) setLoadingPage(false);
      });
    return () => {
      active = false;
    };
  }, [props.projectId, props.rows, page, pageSize, effectiveKeyword, requirementId, status, sortBy, sortOrder]);

  useEffect(() => {
    const filters = { keyword, requirementId, status, pageSize, sortBy, sortOrder, columns: visibleColumns };
    window.dispatchEvent(new CustomEvent('buggy:filters-change', { detail: { tab: 'cases', filters } }));
  }, [keyword, requirementId, status, pageSize, sortBy, sortOrder, visibleColumns]);

  useEffect(() => {
    const apply = (event: Event) => {
      const detail = (event as CustomEvent<{ tab: string; filters: Record<string, unknown> }>).detail;
      if (detail?.tab !== 'cases') return;
      const filters = detail.filters || {};
      setKeyword(typeof filters.keyword === 'string' ? filters.keyword : '');
      setRequirementId(typeof filters.requirementId === 'string' ? filters.requirementId : '');
      setStatus(typeof filters.status === 'string' ? filters.status : '');
      setPageSize(typeof filters.pageSize === 'number' ? filters.pageSize : 20);
      setSortBy(typeof filters.sortBy === 'string' ? filters.sortBy : 'updatedAt');
      setSortOrder(filters.sortOrder === 'asc' ? 'asc' : 'desc');
      if (Array.isArray(filters.columns)) setVisibleColumns(filters.columns.filter((item): item is string => typeof item === 'string'));
    };
    window.addEventListener('buggy:apply-view', apply);
    return () => window.removeEventListener('buggy:apply-view', apply);
  }, []);

  const sorted = (key: string) => {
    if (sortBy === key) setSortOrder((current) => current === 'asc' ? 'desc' : 'asc');
    else {
      setSortBy(key);
      setSortOrder('asc');
    }
  };
  const visibleDefinitions = caseColumns.filter((column) => visibleColumns.includes(column.key));

  return (
    <DataPage
      title="用例库"
      icon={ClipboardCheck}
      metrics={
        <section className="insight-strip">
          <MetricCard label="用例总数" value={props.rows.length} detail={`${ready} 可执行`} tone="info" />
          <MetricCard label="多步骤用例" value={props.rows.filter((row) => row.steps.length > 1).length} detail="步骤数大于 1" />
          <MetricCard label="废弃用例" value={props.rows.filter((row) => row.status === 'deprecated').length} detail="不进入执行" tone="risk" />
          <MetricCard label="需求分组" value={props.requirements.length} detail="左侧可筛选范围" />
        </section>
      }
    >
      <div className="split-layout case-layout">
        <aside className="requirement-tree">
          <button className={!requirementId ? 'active' : ''} type="button" onClick={() => setRequirementId('')}>全部需求 <span>{props.rows.length}</span></button>
          {props.requirements.map((requirement) => (
            <button key={requirement.id} className={requirementId === requirement.id ? 'active' : ''} type="button" onClick={() => setRequirementId(requirement.id)}>
              {requirement.title}<span>{props.rows.filter((row) => row.requirementId === requirement.id).length}</span>
            </button>
          ))}
        </aside>
        <div className="main-table">
          <Toolbar>
            <SearchBox value={keyword} onChange={setKeyword} placeholder="搜索用例、步骤、预期" />
            <Select value={status} onChange={setStatus} values={caseStatuses} emptyLabel="全部状态" />
            <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} aria-label="每页条数">
              <option value={10}>10 / 页</option>
              <option value={20}>20 / 页</option>
              <option value={50}>50 / 页</option>
            </select>
            <ColumnChooser columns={caseColumns} visible={visibleColumns} onChange={setVisibleColumns} />
            <span className="toolbar-summary">{loadingPage ? '加载中...' : `${pageResult.total} 条用例`}</span>
            {props.canWrite && <button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建用例</button>}
          </Toolbar>
          <DataTable
            headers={visibleDefinitions.map((column) => column.label)}
            sortKeys={visibleDefinitions.map((column) => column.sortKey || '')}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={sorted}
            emptyText="暂无用例"
            rows={rows.map((row) => {
              const runSummary = runItemsByCase.get(row.id);
              const caseBugs = (props.bugs || []).filter((bug) => bug.testCaseId === row.id);
              const cells: Record<string, ReactNode> = {
                case: <div className="cell-main"><strong>{row.title}</strong><span>{row.expectedResult || row.preconditions || '未填写预期结果'}</span></div>,
                requirement: row.requirementId ? requirementTitle(props.requirements, row.requirementId) : '-',
                steps: row.steps.length,
                coverage: runSummary ? `${runSummary.passed}/${runSummary.total} 通过 · ${runSummary.failed} 失败` : '未纳入计划',
                bugs: caseBugs.length ? `${caseBugs.filter((bug) => !['verified', 'closed'].includes(bug.status)).length} 活跃 / ${caseBugs.length} 总数` : '-',
                priority: <StatusBadge value={row.priority} dictionaryType="priority" />,
                status: props.canWrite ? <Select value={row.status} onChange={(value) => props.mutate(() => api.updateTestCase(row.id, { status: value as never }), '用例状态已更新')} values={caseStatuses} dictionaryType="testCaseStatus" /> : <StatusBadge value={row.status} dictionaryType="testCaseStatus" />,
                updatedAt: shortDate(row.updatedAt),
                actions: <div className="row-actions">
                  <Button type="button" size="sm" onClick={() => setEditing(row)}><Pencil size={14} /> 详情</Button>
                  {props.canManage && <DangerButton title={`删除用例「${row.title}」？`} onConfirm={() => props.mutate(() => api.deleteTestCase(row.id), '用例已删除')} />}
                </div>
              };
              return visibleDefinitions.map((column) => cells[column.key]);
            })}
          />
          <Pagination page={pageResult.page} pageSize={pageResult.pageSize} total={pageResult.total} onPage={setPage} />
        </div>
      </div>
      {rows.length === 0 && (
        <EmptyState
          text="暂无用例"
          detail="先沉淀可执行用例，后续测试计划才能选择执行范围。"
          action={props.canWrite ? <button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建用例</button> : undefined}
        />
      )}
      <TestCaseDrawer title="新建用例" open={creating} requirements={props.requirements} canWrite={props.canWrite} onClose={() => setCreating(false)} onSubmit={async (form) => {
        await props.mutate(() => api.createTestCase(testCasePayload(form, props.projectId)), '用例已创建');
        setCreating(false);
      }} />
      <TestCaseDrawer title="编辑用例" row={editing || undefined} open={Boolean(editing)} requirements={props.requirements} plans={props.plans} bugs={props.bugs} canWrite={props.canWrite} onClose={() => setEditing(null)} onSubmit={async (form) => {
        if (!editing) return;
        await props.mutate(() => api.updateTestCase(editing.id, testCasePayload(form, props.projectId)), '用例已保存');
        setEditing(null);
      }} />
    </DataPage>
  );
}

export function TestCaseFields(props: { row?: TestCase; requirements: Requirement[]; defaultRequirementId?: string; register?: UseFormRegister<StringFormValues> }) {
  return (
    <div className="field-grid">
      <Field className="span-two"><FieldLabel>用例标题</FieldLabel><Input {...registerField(props.register, 'title')} defaultValue={props.row?.title} required /></Field>
      <Field><FieldLabel>绑定需求</FieldLabel><select {...registerField(props.register, 'requirementId')} defaultValue={props.row?.requirementId || props.defaultRequirementId || ''}><option value="">不绑定需求</option>{props.requirements.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
      <Field><FieldLabel>优先级</FieldLabel><Select name="priority" register={props.register} values={priorities} dictionaryType="priority" defaultValue={props.row?.priority || 'P2'} /></Field>
      <Field><FieldLabel>状态</FieldLabel><Select name="status" register={props.register} values={caseStatuses} dictionaryType="testCaseStatus" defaultValue={props.row?.status || 'ready'} /></Field>
      <Field className="span-two"><FieldLabel>前置条件</FieldLabel><Input {...registerField(props.register, 'preconditions')} defaultValue={props.row?.preconditions} /></Field>
      <div className="span-four"><StepEditor initialSteps={props.row?.steps} /></div>
      <Field className="span-four"><FieldLabel>最终预期结果</FieldLabel><Textarea {...registerField(props.register, 'expectedResult')} defaultValue={props.row?.expectedResult} /></Field>
    </div>
  );
}

export function TestCaseDrawer(props: { title: string; row?: TestCase; open: boolean; requirements: Requirement[]; plans?: TestPlan[]; bugs?: Bug[]; defaultRequirementId?: string; canWrite?: boolean; onClose: () => void; onSubmit: (form: FormData) => Promise<void> }) {
  return (
    <Drawer title={props.title} subtitle={props.row?.title || '维护测试步骤、预期结果和优先级'} open={props.open} onClose={props.onClose}>
      <HookForm onSubmit={async (form) => props.onSubmit(form)}>
        {(register) => (
          <>
            <TestCaseFields row={props.row} requirements={props.requirements} defaultRequirementId={props.defaultRequirementId} register={register} />
            {props.row && <CaseEvidence row={props.row} plans={props.plans || []} bugs={props.bugs || []} />}
            <FormActions><Button type="button" onClick={props.onClose}>取消</Button>{props.canWrite !== false && <Button variant="primary"><Save size={15} /> 保存用例</Button>}</FormActions>
          </>
        )}
      </HookForm>
    </Drawer>
  );
}

function CaseEvidence(props: { row: TestCase; plans: TestPlan[]; bugs: Bug[] }) {
  const executions = props.plans.flatMap((plan) =>
    plan.runItems
      .filter((item) => item.caseId === props.row.id)
      .map((item) => ({ plan, item }))
  );
  const caseBugs = props.bugs.filter((bug) => bug.testCaseId === props.row.id);
  return (
    <div className="case-evidence span-four">
      <section>
        <div className="sub-title">最近执行</div>
        <DataTable
          headers={['计划', '状态', '实际结果', '执行时间']}
          emptyText="暂无执行记录"
          rows={executions.slice(0, 5).map(({ plan, item }) => [
            plan.name,
            <StatusBadge value={item.status} dictionaryType="testRunStatus" />,
            item.actualResult || '-',
            item.executedAt ? new Date(item.executedAt).toLocaleString('zh-CN') : '-'
          ])}
        />
      </section>
      <section>
        <div className="sub-title">关联 Bug</div>
        <DataTable
          headers={['Bug', '严重级别', '状态']}
          emptyText="暂无关联 Bug"
          rows={caseBugs.slice(0, 5).map((bug) => [
            bug.title,
            <StatusBadge value={bug.severity} dictionaryType="severity" />,
            <StatusBadge value={bug.status} dictionaryType="bugStatus" />
          ])}
        />
      </section>
    </div>
  );
}

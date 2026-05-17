import { useMemo, useState } from 'react';
import {
  Activity,
  BookOpen,
  Bug,
  CalendarRange,
  ClipboardCheck,
  FileSpreadsheet,
  Flag,
  FolderKanban,
  HelpCircle,
  KeyRound,
  Search,
  Settings,
  ShieldCheck,
  Users
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Project, UserProfile } from '@buggy/shared-types';
import type { WorkspaceData } from '../../app/types.js';
import { labelOf } from '../../labels.js';
import { Drawer } from './common.js';

type HelpSection = {
  id: string;
  title: string;
  icon: LucideIcon;
  summary: string;
  steps: string[];
  tips: string[];
  keywords: string[];
};

const helpSections: HelpSection[] = [
  {
    id: 'quick-start',
    title: '快速开始',
    icon: BookOpen,
    summary: '从创建项目到得到第一份验收报告的最短路径。',
    steps: [
      '在项目页新建项目，填写项目名称、代号和描述。',
      '打开项目行的成员入口，添加测试、开发、只读成员或设置负责人。',
      '在迭代页规划周期和目标，再创建需求并设置负责人、优先级和状态。',
      '在用例库为需求补充测试用例和步骤。',
      '在执行页创建测试计划，选择本轮要执行的用例。',
      '记录执行结果，需要时从失败执行项直接创建 Bug。',
      '在迭代或需求列表打开报告，查看阶段质量或验收证据。'
    ],
    tips: ['先选择当前项目再进入迭代、需求、用例、执行和 Bug 模块。', '顶部全局搜索会过滤当前工作区内的需求、用例、计划和 Bug。'],
    keywords: ['开始', '流程', '入门', '创建项目', '报告']
  },
  {
    id: 'projects',
    title: '项目与成员',
    icon: FolderKanban,
    summary: '项目页负责项目档案、当前项目切换、成员入口和高风险项目操作。',
    steps: [
      '“编辑档案”只维护项目名称、代号和描述。',
      '“成员”独立维护项目成员，避免成员权限和项目档案混在一个表单里。',
      '负责人会以项目角色 owner 展示为“负责人”，不可直接移除。',
      '非负责人可以调整为测试、开发或只读，也可以从项目中移除。',
      '删除项目在更多操作中确认执行，会删除项目下迭代、需求、用例、执行计划、Bug 和报告数据。'
    ],
    tips: ['成员邮箱必须对应系统中已有账号。', '管理员可以访问所有项目；普通用户只能访问自己负责或参与的项目。'],
    keywords: ['项目', '成员', '负责人', '权限', '删除项目', '切换项目']
  },
  {
    id: 'iterations',
    title: '迭代管理',
    icon: CalendarRange,
    summary: '按周期组织需求、执行计划和风险统计。',
    steps: [
      '新建迭代时填写名称、目标、开始日期、结束日期和状态。',
      '需求可以绑定到迭代，迭代页会汇总关联需求、用例、执行和活跃 Bug。',
      '用状态筛选规划中、进行中、已完成和已归档迭代。',
      '从迭代行打开报告，可导出该阶段的质量报告。'
    ],
    tips: ['迭代目标建议写成本轮验证范围或交付目标。', '迭代报告按关联需求、执行项和缺陷实时统计。'],
    keywords: ['迭代', '周期', '规划', '归档', '目标', '报告']
  },
  {
    id: 'requirements',
    title: '需求管理',
    icon: Flag,
    summary: '沉淀需求条目、负责人、优先级、状态和 Lark 日报同步。',
    steps: [
      '新建需求时可绑定迭代、负责人、优先级和状态。',
      '需求列表支持按状态、负责人和关键字筛选。',
      '需求可绑定 Lark Webhook，并通过列表中的 Lark 操作发送日报。',
      '需求页会显示每条需求关联的用例数量和 Bug 数量。',
      '从需求行打开验收报告，可查看覆盖用例、执行结果、风险和验收建议。'
    ],
    tips: ['“阻塞”需求会出现在总览风险中。', '优先级 P0/P1 建议用于影响主流程或发布准入的需求。'],
    keywords: ['需求', '负责人', '优先级', '状态', 'Lark', '日报', '验收报告']
  },
  {
    id: 'cases',
    title: '用例库',
    icon: ClipboardCheck,
    summary: '维护测试用例、步骤、前置条件、预期结果和需求覆盖。',
    steps: [
      '从左侧需求树筛选需求范围，也可以查看全部用例。',
      '新建或编辑用例时填写标题、绑定需求、优先级、状态、前置条件和步骤。',
      '步骤编辑器支持多步骤，每一步包含操作和预期。',
      '状态为已废弃的用例不会作为推荐执行资产。'
    ],
    tips: ['可执行用例建议保持 ready 状态。', '步骤越明确，执行结果和缺陷复现越容易追溯。'],
    keywords: ['用例', '步骤', '前置条件', '预期结果', '需求覆盖']
  },
  {
    id: 'plans',
    title: '测试执行',
    icon: Activity,
    summary: '组织测试轮次、选择执行用例、记录执行结果并创建 Bug。',
    steps: [
      '创建测试计划时选择计划名称、轮次、迭代、需求范围和本轮用例。',
      '执行项可以快速标记通过、失败或阻塞。',
      '使用“记录”补充实际结果。',
      '失败或阻塞时可从执行项直接创建 Bug，系统会保留执行来源。'
    ],
    tips: ['每一轮回归建议使用独立测试计划，便于比较通过率。', '实际结果写清环境、数据和观察现象，会让 Bug 定位更快。'],
    keywords: ['执行', '测试计划', '轮次', '结果', '通过率', '建 Bug']
  },
  {
    id: 'bugs',
    title: 'Bug 管理',
    icon: Bug,
    summary: '跟踪缺陷来源、负责人、严重级别、优先级和生命周期状态。',
    steps: [
      'Bug 可以绑定需求、用例和测试计划，也可以独立创建。',
      '列表支持按状态、严重级别、负责人和关键字筛选。',
      '编辑 Bug 时记录复现步骤、实际结果、期望结果和责任人。',
      '已验证和已关闭的 Bug 不再计入活跃 Bug。'
    ],
    tips: ['S0/S1 严重缺陷会在 Bug 页指标中重点提示。', '重新打开用于标记修复后复现或验证失败的缺陷。'],
    keywords: ['Bug', '缺陷', '严重级别', '优先级', '复现', '关闭']
  },
  {
    id: 'settings',
    title: '系统配置与导入',
    icon: Settings,
    summary: '配置 Excel 模板、批量导入、账号权限和项目字典。',
    steps: [
      '下载需求、用例或 Bug 模板后，可按模板表头批量导入。',
      'Excel 导入支持需求、用例、Bug 和执行结果。',
      '管理员可以维护用户系统角色和账号状态。',
      '字典配置可维护需求状态、执行状态、Bug 状态、优先级和严重级别。'
    ],
    tips: ['导入失败时会提示前几条错误行，先修正表头和必填字段。', '项目字典只影响当前项目范围。'],
    keywords: ['配置', 'Excel', '导入', '模板', '账号权限', '字典']
  },
  {
    id: 'roles',
    title: '角色与权限',
    icon: ShieldCheck,
    summary: '系统角色决定平台能力，项目角色决定单个项目内的管理权限。',
    steps: [
      '第一个注册用户会自动成为系统管理员。',
      '管理员可访问所有项目，并可维护账号角色和状态。',
      '项目负责人可以维护项目档案、成员和项目内数据。',
      '测试、开发和只读成员可以访问自己参与的项目；具体写入能力由后端权限校验约束。'
    ],
    tips: ['系统角色和项目角色是两套概念。', '如果无法编辑项目数据，先检查是否是管理员或项目负责人。'],
    keywords: ['角色', '权限', '管理员', '负责人', '只读', '访问']
  }
];

export function HelpCenter(props: {
  open: boolean;
  onClose: () => void;
  user: UserProfile;
  currentProject?: Project;
  projectCount: number;
  data: WorkspaceData;
}) {
  const [keyword, setKeyword] = useState('');
  const [activeId, setActiveId] = useState(helpSections[0].id);
  const normalizedKeyword = keyword.trim().toLowerCase();
  const filteredSections = useMemo(
    () =>
      helpSections.filter((section) => {
        if (!normalizedKeyword) return true;
        const haystack = [
          section.title,
          section.summary,
          ...section.steps,
          ...section.tips,
          ...section.keywords
        ].join(' ').toLowerCase();
        return haystack.includes(normalizedKeyword);
      }),
    [normalizedKeyword]
  );
  const activeSection =
    filteredSections.find((section) => section.id === activeId) ||
    filteredSections[0] ||
    helpSections[0];
  const assetTotal = props.data.requirements.length + props.data.cases.length + props.data.plans.length + props.data.bugs.length;

  return (
    <Drawer title="帮助中心" subtitle="按当前功能整理的操作指南、权限说明和排查入口" open={props.open} onClose={props.onClose} size="full">
      <div className="help-center">
        <section className="help-hero" aria-label="帮助中心概览">
          <div>
            <span>Buggy Guide</span>
            <strong>从项目建档到报告导出，一次看清。</strong>
            <small>当前身份：{props.user.username} · {labelOf(props.user.role)}</small>
          </div>
          <div className="help-context-grid">
            <article>
              <span>当前项目</span>
              <strong>{props.currentProject?.name || '未选择'}</strong>
              <small>{props.currentProject?.code || `${props.projectCount} 个可访问项目`}</small>
            </article>
            <article>
              <span>项目成员</span>
              <strong>{props.currentProject?.members.length || '-'}</strong>
              <small>{props.currentProject?.members.find((member) => member.role === 'owner')?.username || '暂无负责人'}</small>
            </article>
            <article>
              <span>质量资产</span>
              <strong>{assetTotal}</strong>
              <small>需求 / 用例 / 计划 / Bug</small>
            </article>
          </div>
        </section>

        <label className="help-search">
          <Search size={17} />
          <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索项目、成员、执行、导入、权限..." />
        </label>

        <section className="help-layout">
          <nav className="help-nav" aria-label="帮助主题">
            {filteredSections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={activeSection.id === section.id ? 'active' : ''}
                onClick={() => setActiveId(section.id)}
              >
                <section.icon size={16} />
                <span>{section.title}</span>
              </button>
            ))}
            {filteredSections.length === 0 && (
              <div className="help-empty">
                <HelpCircle size={18} />
                <span>没有匹配的帮助内容</span>
              </div>
            )}
          </nav>

          <article className="help-article">
            <header>
              <activeSection.icon size={22} />
              <div>
                <h3>{activeSection.title}</h3>
                <p>{activeSection.summary}</p>
              </div>
            </header>
            <div className="help-section-block">
              <h4>操作步骤</h4>
              <ol>
                {activeSection.steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
            </div>
            <div className="help-section-block">
              <h4>注意事项</h4>
              <div className="help-note-grid">
                {activeSection.tips.map((tip) => (
                  <span key={tip}>
                    <KeyRound size={14} />
                    {tip}
                  </span>
                ))}
              </div>
            </div>
          </article>
        </section>

        <section className="help-shortcuts" aria-label="常用排查">
          <article>
            <Users size={17} />
            <strong>成员加不上？</strong>
            <span>先确认该邮箱已注册为系统账号，再在项目成员抽屉添加。</span>
          </article>
          <article>
            <FileSpreadsheet size={17} />
            <strong>Excel 导入失败？</strong>
            <span>下载模板，按表头填写必填字段，并根据错误行提示修正。</span>
          </article>
          <article>
            <Activity size={17} />
            <strong>验收报告没有数据？</strong>
            <span>确认该需求已有覆盖用例，且测试计划中包含这些用例。</span>
          </article>
        </section>
      </div>
    </Drawer>
  );
}

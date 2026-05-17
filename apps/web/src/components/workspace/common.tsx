import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useForm, type UseFormRegister } from 'react-hook-form';
import { ChevronDown, ChevronUp, Download, FolderKanban, Plus, Search, Trash2, X } from 'lucide-react';
import type { TestCaseStep } from '@buggy/shared-types';
import { Badge } from '../ui/badge.js';
import { Button } from '../ui/button.js';
import { Card, CardContent, CardHeader as UiCardHeader, CardTitle } from '../ui/card.js';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetX } from '../ui/sheet.js';
import { Input } from '../ui/input.js';
import { Textarea } from '../ui/textarea.js';
import { downloadUrl } from '../../api.js';
import { badgeTone, formDataFromValues } from '../../app/workspace-utils.js';
import type { StringFormValues, Tab } from '../../app/types.js';
import { dictionaryLabel, dictionaryStyle, useDictionaryOptions, useDictionaryValue } from './dictionary.js';

export function NavButton(props: { tab: Tab; current: Tab; label: string; icon: typeof FolderKanban; index?: number; onClick: (tab: Tab) => void }) {
  return (
    <button className={props.current === props.tab ? 'active' : ''} onClick={() => props.onClick(props.tab)}>
      <span className="nav-index">{props.index}</span>
      <props.icon size={17} />
      <span>{props.label}</span>
    </button>
  );
}

export function Drawer(props: { title: string; subtitle?: string; open: boolean; onClose: () => void; children: ReactNode; size?: 'compact' | 'wide' | 'full' }) {
  return (
    <Sheet open={props.open} onOpenChange={(open) => (!open ? props.onClose() : undefined)}>
      <SheetContent className={props.size ? `ui-sheet-${props.size}` : undefined}>
        <SheetHeader>
          <div>
            <SheetTitle>{props.title}</SheetTitle>
            {props.subtitle && <SheetDescription>{props.subtitle}</SheetDescription>}
          </div>
          <SheetX />
        </SheetHeader>
        <SheetBody>{props.children}</SheetBody>
      </SheetContent>
    </Sheet>
  );
}

export function DrawerForm(props: { title: string; subtitle?: string; open: boolean; onClose: () => void; children: ReactNode }) {
  return <Drawer title={props.title} subtitle={props.subtitle} open={props.open} onClose={props.onClose}>{props.children}</Drawer>;
}

export function HookForm(props: {
  defaultValues?: StringFormValues;
  className?: string;
  onSubmit: (form: FormData, values: StringFormValues) => Promise<void>;
  children: (register: UseFormRegister<StringFormValues>) => ReactNode;
}) {
  const form = useForm<StringFormValues>({ defaultValues: props.defaultValues || {} });
  useEffect(() => {
    form.reset(props.defaultValues || {});
  }, [form, props.defaultValues]);
  return (
    <form
      className={props.className || 'drawer-form'}
      onSubmit={form.handleSubmit(async (values, event) => {
        const domForm = event?.currentTarget instanceof HTMLFormElement ? new FormData(event.currentTarget) : formDataFromValues(values);
        Object.entries(values).forEach(([key, value]) => domForm.set(key, value ?? ''));
        await props.onSubmit(domForm, values);
      })}
    >
      {props.children(form.register)}
    </form>
  );
}

export function registerField(register: UseFormRegister<StringFormValues> | undefined, name: string) {
  return register ? register(name) : { name };
}

export function CardHeader(props: { title: string; meta?: Array<string | undefined>; badge?: string }) {
  const meta = (props.meta || []).filter(Boolean);
  return (
    <UiCardHeader className="card-head">
      <div>
        <strong>{props.title}</strong>
        {meta.length > 0 && <span>{meta.join(' · ')}</span>}
      </div>
      {props.badge && <StatusBadge value={props.badge} />}
    </UiCardHeader>
  );
}

export function Section(props: { title: string; icon: typeof FolderKanban; children: ReactNode }) {
  return (
    <Card className="panel">
      <UiCardHeader className="section-head">
        <props.icon size={22} />
        <CardTitle>{props.title}</CardTitle>
      </UiCardHeader>
      <CardContent className="section-content">{props.children}</CardContent>
    </Card>
  );
}

export function DataPage(props: { title: string; icon: typeof FolderKanban; metrics?: ReactNode; children: ReactNode }) {
  return (
    <Section title={props.title} icon={props.icon}>
      {props.metrics}
      {props.children}
    </Section>
  );
}

export function Toolbar(props: { children: ReactNode }) {
  return <DataToolbar>{props.children}</DataToolbar>;
}

export function DataToolbar(props: { children: ReactNode }) {
  return <div className="toolbar data-toolbar">{props.children}</div>;
}

export function SearchBox(props: { value: string; onChange: (value: string) => void; placeholder: string }) {
  const placeholder = props.placeholder.startsWith('当前列表搜索') ? props.placeholder : `当前列表搜索：${props.placeholder.replace(/^搜索/, '')}`;
  return (
    <label className="search-box" aria-label="当前列表搜索">
      <Search size={16} />
      <input value={props.value} onChange={(event) => props.onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

export function Select<T extends readonly string[]>(props: {
  name?: string;
  register?: UseFormRegister<StringFormValues>;
  values: T;
  dictionaryType?: string;
  defaultValue?: T[number] | string;
  value?: string;
  onChange?: (value: string) => void;
  emptyLabel?: string;
}) {
  const registered = props.name && props.register ? props.register(props.name) : undefined;
  const options = useDictionaryOptions(props.dictionaryType, props.values);
  return (
    <select
      {...(registered || {})}
      name={props.name}
      defaultValue={props.value === undefined ? props.defaultValue : undefined}
      value={props.value}
      onChange={(event) => {
        registered?.onChange?.(event);
        props.onChange?.(event.target.value);
      }}
    >
      {props.emptyLabel && <option value="">{props.emptyLabel}</option>}
      {options.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
    </select>
  );
}

export function StatusBadge(props: { value: string; dictionaryType?: string }) {
  const value = useDictionaryValue(props.value, props.dictionaryType);
  return (
    <Badge className={`status-badge ${badgeTone(value?.label || props.value)}`} style={dictionaryStyle(value)}>
      {dictionaryLabel(value, props.value)}
    </Badge>
  );
}

export function MetricCard(props: { label: string; value: string | number; detail?: string; tone?: 'good' | 'info' | 'risk' | 'neutral' }) {
  return (
    <article className={`insight-card ${props.tone ? `tone-${props.tone}` : ''}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      {props.detail && <small>{props.detail}</small>}
    </article>
  );
}

export function DataTable(props: {
  headers: string[];
  rows: Array<Array<ReactNode>>;
  emptyText?: string;
  onSort?: (key: string) => void;
  sortKeys?: string[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) {
  return (
    <div className="table-wrap data-table-wrap">
      <table>
        <thead>
          <tr>
            {props.headers.map((header, index) => (
              <th key={header}>
                {props.onSort && props.sortKeys?.[index] ? (
                  <button type="button" className="th-button" onClick={() => props.onSort?.(props.sortKeys?.[index] || '')}>
                    {header}
                    {props.sortBy === props.sortKeys[index] && (props.sortOrder === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}
                  </button>
                ) : (
                  header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.length === 0 ? (
            <tr><td colSpan={props.headers.length}>{props.emptyText || '暂无数据'}</td></tr>
          ) : (
            props.rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, cellIndex) => <td key={cellIndex} data-label={props.headers[cellIndex] || ''}>{cell}</td>)}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function RowMoreMenu(props: { label: string; trigger: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;

    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const gap = 6;
    const edge = 8;
    const menuWidth = menuRect.width || 144;
    const menuHeight = menuRect.height || 0;
    const maxLeft = Math.max(edge, window.innerWidth - menuWidth - edge);
    const left = Math.min(Math.max(edge, triggerRect.right - menuWidth), maxLeft);
    const below = triggerRect.bottom + gap;
    const above = triggerRect.top - menuHeight - gap;
    const top = below + menuHeight <= window.innerHeight - edge || above < edge
      ? Math.min(below, window.innerHeight - menuHeight - edge)
      : above;

    setPosition({ top: Math.max(edge, top), left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  return (
    <span className="row-more-menu">
      <button
        ref={triggerRef}
        type="button"
        className="row-more-trigger"
        aria-label={props.label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {props.trigger}
      </button>
      {open && createPortal(
        <div ref={menuRef} className="row-more-popover" role="menu" style={{ top: position.top, left: position.left }} onClick={(event) => {
          if ((event.target as HTMLElement).closest('button')) setOpen(false);
        }}>
          {props.children}
        </div>,
        document.body
      )}
    </span>
  );
}

export function Table(props: { headers: string[]; rows: Array<Array<string | number>> }) {
  return <DataTable headers={props.headers} rows={props.rows} />;
}

export function Pagination(props: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const pageCount = Math.max(1, Math.ceil(props.total / props.pageSize));
  const pages = Array.from({ length: Math.min(pageCount, 5) }, (_, index) => Math.min(pageCount, Math.max(1, props.page - 2) + index));
  const uniquePages = [...new Set(pages)];
  return (
    <div className="pagination">
      <span>共 {props.total} 条</span>
      <Button type="button" size="sm" disabled={props.page <= 1} onClick={() => props.onPage(props.page - 1)}>上一页</Button>
      {uniquePages.map((page) => (
        <button key={page} type="button" className={page === props.page ? 'page active' : 'page'} onClick={() => props.onPage(page)}>{page}</button>
      ))}
      <Button type="button" size="sm" disabled={props.page >= pageCount} onClick={() => props.onPage(props.page + 1)}>下一页</Button>
    </div>
  );
}

export function FilterChips(props: { filters: Array<{ label: string; value?: string; onClear?: () => void }> }) {
  const active = props.filters.filter((filter) => filter.value);
  if (active.length === 0) return null;
  return (
    <div className="filter-chips">
      {active.map((filter) => (
        <button key={filter.label} type="button" onClick={filter.onClear}>
          {filter.label}: {filter.value} <X size={13} />
        </button>
      ))}
    </div>
  );
}

export function ColumnChooser(props: {
  columns: Array<{ key: string; label: string; locked?: boolean }>;
  visible: string[];
  onChange: (next: string[]) => void;
}) {
  const visible = new Set(props.visible);
  return (
    <details className="column-chooser">
      <summary>列配置</summary>
      <div>
        {props.columns.map((column) => (
          <label key={column.key} className="check-row compact-check-row">
            <input
              type="checkbox"
              checked={visible.has(column.key)}
              disabled={column.locked}
              onChange={(event) => {
                if (event.target.checked) props.onChange([...props.visible, column.key]);
                else props.onChange(props.visible.filter((key) => key !== column.key || props.columns.find((item) => item.key === key)?.locked));
              }}
            />
            <span>{column.label}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

export function ConfirmDialog(props: { open: boolean; title: string; description?: string; confirmText?: string; onCancel: () => void; onConfirm: () => void }) {
  if (!props.open) return null;
  return (
    <div className="confirm-layer" role="presentation">
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-label={props.title}>
        <h3>{props.title}</h3>
        {props.description && <p>{props.description}</p>}
        <div className="form-actions">
          <Button type="button" onClick={props.onCancel}>取消</Button>
          <Button type="button" variant="destructive" onClick={props.onConfirm}>{props.confirmText || '确认'}</Button>
        </div>
      </section>
    </div>
  );
}

export function TextConfirmDialog(props: {
  open: boolean;
  title: string;
  description?: string;
  label?: string;
  placeholder?: string;
  confirmText?: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!props.open) setNote('');
  }, [props.open]);
  if (!props.open) return null;
  const disabled = note.trim().length < 2;
  return (
    <div className="confirm-layer" role="presentation">
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-label={props.title}>
        <h3>{props.title}</h3>
        {props.description && <p>{props.description}</p>}
        <label className="dialog-field">
          <span>{props.label || '操作说明'}</span>
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={props.placeholder || '请输入原因或备注'} />
        </label>
        <div className="form-actions">
          <Button type="button" onClick={props.onCancel}>取消</Button>
          <Button type="button" variant={props.destructive ? 'destructive' : 'primary'} disabled={disabled} onClick={() => props.onConfirm(note.trim())}>
            {props.confirmText || '确认'}
          </Button>
        </div>
      </section>
    </div>
  );
}

export function DangerButton(props: { onConfirm?: () => void; title?: string; description?: string; children?: ReactNode; onClick?: () => void }) {
  const [open, setOpen] = useState(false);
  const confirm = props.onConfirm || props.onClick;
  return (
    <>
      <button type="button" className="danger" onClick={() => setOpen(true)}>
        <Trash2 size={15} /> {props.children || '删除'}
      </button>
      <ConfirmDialog
        open={open}
        title={props.title || '确认删除？'}
        description={props.description || '该操作会立即生效。'}
        confirmText="删除"
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          confirm?.();
        }}
      />
    </>
  );
}

export function EmptyState(props: { text: string; action?: ReactNode; detail?: string }) {
  return (
    <Card className="empty">
      <strong>{props.text}</strong>
      {props.detail && <span>{props.detail}</span>}
      {props.action && <div>{props.action}</div>}
    </Card>
  );
}

export function ExportLink(props: { projectId: string; type: string; label: string }) {
  return (
    <a className="link-button" href={downloadUrl(`/import-export/export?type=${props.type}&projectId=${props.projectId}`)}>
      <Download size={15} /> {props.label}
    </a>
  );
}

export function TemplateLink(props: { type: string; label: string }) {
  return (
    <a className="link-button" href={downloadUrl(`/import-export/template?type=${props.type}`)}>
      <Download size={15} /> {props.label}
    </a>
  );
}

export function Metric(props: { label: string; value: string | number; detail: string }) {
  return (
    <Card className="metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      <small>{props.detail}</small>
    </Card>
  );
}

export function StepEditor(props: { name?: string; initialSteps?: TestCaseStep[] }) {
  const [steps, setSteps] = useState<TestCaseStep[]>(() => normalizeInitialSteps(props.initialSteps));
  useEffect(() => setSteps(normalizeInitialSteps(props.initialSteps)), [props.initialSteps]);
  const ordered = useMemo(() => steps.map((step, index) => ({ ...step, sort: index + 1 })), [steps]);
  return (
    <div className="step-editor">
      <input type="hidden" name={props.name || 'stepsJson'} value={JSON.stringify(ordered)} readOnly />
      <div className="sub-title">测试步骤</div>
      {ordered.map((step, index) => (
        <div className="step-row" key={step.id || index}>
          <span>{index + 1}</span>
          <Input
            value={step.action}
            onChange={(event) => setSteps((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, action: event.target.value } : item)))}
            placeholder="操作步骤"
          />
          <Input
            value={step.expected}
            onChange={(event) => setSteps((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, expected: event.target.value } : item)))}
            placeholder="步骤预期"
          />
          <Button type="button" size="icon" variant="ghost" aria-label={`删除第 ${index + 1} 步`} title={`删除第 ${index + 1} 步`} onClick={() => setSteps((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
            <Trash2 size={14} />
          </Button>
          <Button type="button" size="icon" variant="ghost" aria-label={`上移第 ${index + 1} 步`} title={`上移第 ${index + 1} 步`} disabled={index === 0} onClick={() => setSteps((current) => moveStep(current, index, index - 1))}>
            <ChevronUp size={14} />
          </Button>
          <Button type="button" size="icon" variant="ghost" aria-label={`下移第 ${index + 1} 步`} title={`下移第 ${index + 1} 步`} disabled={index === ordered.length - 1} onClick={() => setSteps((current) => moveStep(current, index, index + 1))}>
            <ChevronDown size={14} />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        className="fit"
        onClick={() => setSteps((current) => [...current, { id: crypto.randomUUID(), action: '', expected: '', sort: current.length + 1 }])}
      >
        <Plus size={15} /> 添加步骤
      </Button>
    </div>
  );
}

function moveStep(steps: TestCaseStep[], from: number, to: number) {
  const next = [...steps];
  const [item] = next.splice(from, 1);
  if (!item) return steps;
  next.splice(to, 0, item);
  return next;
}

function normalizeInitialSteps(steps?: TestCaseStep[]) {
  const initial = steps && steps.length > 0 ? steps : [{ id: crypto.randomUUID(), action: '', expected: '', sort: 1 }];
  return initial.map((step, index) => ({ id: step.id || crypto.randomUUID(), action: step.action || '', expected: step.expected || '', sort: step.sort || index + 1 }));
}

export function TextPreview(props: { value?: string; fallback?: string }) {
  return <span className="text-preview">{props.value || props.fallback || '-'}</span>;
}

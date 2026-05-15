import type { ReactNode } from 'react';
import { useForm, type UseFormRegister } from 'react-hook-form';
import { Download, FolderKanban, Search, Trash2 } from 'lucide-react';
import { Badge } from '../ui/badge.js';
import { Button } from '../ui/button.js';
import { Card, CardContent, CardHeader as UiCardHeader, CardTitle } from '../ui/card.js';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetX } from '../ui/sheet.js';
import { labelOf } from '../../labels.js';
import { downloadUrl } from '../../api.js';
import { badgeTone, formDataFromValues } from '../../app/workspace-utils.js';
import type { StringFormValues, Tab } from '../../app/types.js';

export function NavButton(props: { tab: Tab; current: Tab; label: string; icon: typeof FolderKanban; onClick: (tab: Tab) => void }) {
  return (
    <button className={props.current === props.tab ? 'active' : ''} onClick={() => props.onClick(props.tab)}>
      <props.icon size={18} /> {props.label}
    </button>
  );
}

export function Drawer(props: { title: string; subtitle?: string; open: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Sheet open={props.open} onOpenChange={(open) => (!open ? props.onClose() : undefined)}>
      <SheetContent>
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

export function HookForm(props: {
  defaultValues?: StringFormValues;
  className?: string;
  onSubmit: (form: FormData, values: StringFormValues) => Promise<void>;
  children: (register: UseFormRegister<StringFormValues>) => ReactNode;
}) {
  const form = useForm<StringFormValues>({ defaultValues: props.defaultValues || {} });
  return (
    <form
      className={props.className || 'drawer-form'}
      onSubmit={form.handleSubmit(async (values) => props.onSubmit(formDataFromValues(values), values))}
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
      {props.badge && <Badge className={`status-badge ${badgeTone(props.badge)}`}>{props.badge}</Badge>}
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

export function Toolbar(props: { children: ReactNode }) {
  return <div className="toolbar">{props.children}</div>;
}

export function SearchBox(props: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="search-box">
      <Search size={16} />
      <input value={props.value} onChange={(event) => props.onChange(event.target.value)} placeholder={props.placeholder} />
    </label>
  );
}

export function Select<T extends readonly string[]>(props: {
  name?: string;
  register?: UseFormRegister<StringFormValues>;
  values: T;
  defaultValue?: T[number] | string;
  value?: string;
  onChange?: (value: string) => void;
  emptyLabel?: string;
}) {
  const registered = props.name && props.register ? props.register(props.name) : undefined;
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
      {props.values.map((value) => <option key={value} value={value}>{labelOf(value)}</option>)}
    </select>
  );
}

export function Table(props: { headers: string[]; rows: Array<Array<string | number>> }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{props.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
        <tbody>
          {props.rows.length === 0 ? (
            <tr><td colSpan={props.headers.length}>暂无数据</td></tr>
          ) : (
            props.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)
          )}
        </tbody>
      </table>
    </div>
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

export function DangerButton(props: { onClick: () => void }) {
  return (
    <button type="button" className="danger" onClick={props.onClick}>
      <Trash2 size={15} /> 删除
    </button>
  );
}

export function EmptyState(props: { text: string }) {
  return <Card className="empty">{props.text}</Card>;
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

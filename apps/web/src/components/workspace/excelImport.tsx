import { useEffect, useState } from 'react';
import { Upload } from 'lucide-react';
import type { ImportPreview } from '@buggy/shared-types';
import { api, type ImportResult } from '../../api.js';
import { importMessage } from '../../app/workspace-utils.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { DataTable, Drawer, TemplateLink } from './common.js';

export type ExcelImportType = 'requirements' | 'test-cases' | 'bugs';

export function ExcelImportDrawer(props: {
  open: boolean;
  title: string;
  subtitle: string;
  projectId: string;
  type: ExcelImportType;
  templateLabel: string;
  onClose: () => void;
  onNotice: (message: string) => void;
  mutateWithResult: <T>(action: () => Promise<T>, resolveMessage: (result: T) => string) => Promise<void>;
}) {
  const [importFile, setImportFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [lastImport, setLastImport] = useState<ImportResult | null>(null);

  useEffect(() => {
    if (!props.open) {
      setImportFile(null);
      setPreview(null);
      setLastImport(null);
    }
  }, [props.open]);

  return (
    <Drawer title={props.title} subtitle={props.subtitle} open={props.open} onClose={props.onClose} size="wide">
      <form className="stack" onSubmit={async (event) => {
        event.preventDefault();
        if (!importFile) {
          props.onNotice('请选择 Excel 文件');
          return;
        }
        await props.mutateWithResult(() => api.importXlsx(props.projectId, props.type, importFile), (result) => {
          setLastImport(result);
          setPreview(null);
          return importMessage(result);
        });
      }}>
        <div className="report-actions">
          <TemplateLink type={props.type} label={props.templateLabel} />
        </div>
        <Input name="file" type="file" accept=".xlsx" onChange={(event) => setImportFile(event.target.files?.[0] || null)} />
        <div className="report-actions">
          <Button type="button" onClick={async () => {
            if (!importFile) {
              props.onNotice('请选择 Excel 文件');
              return;
            }
            const result = await api.previewImportXlsx(props.projectId, props.type, importFile);
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
    </Drawer>
  );
}

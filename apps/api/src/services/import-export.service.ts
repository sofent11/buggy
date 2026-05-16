import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { Bug, ImportPreview, Requirement, TestCase, TestRunStatus } from '@buggy/shared-types';
import type { ImportRowsDto } from '../dto/import-export.dto.js';
import { BugService } from './bug.service.js';
import { RequirementService } from './requirement.service.js';
import { TestCaseService } from './test-case.service.js';
import type { SessionUser } from './auth.service.js';
import { TestPlanService } from './test-plan.service.js';

const testRunStatuses = ['untested', 'passed', 'failed', 'blocked', 'skipped'] as const;

@Injectable()
export class ImportExportService {
  constructor(
    private readonly requirements: RequirementService,
    private readonly cases: TestCaseService,
    private readonly bugs: BugService,
    private readonly plans: TestPlanService
  ) {}

  async template(type: ImportRowsDto['type']): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('template');
    const headers = this.headers(type);
    sheet.addRow(headers);
    sheet.getRow(1).font = { bold: true };
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async export(type: ImportRowsDto['type'], projectId: string): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(type);
    const headers = this.headers(type);
    sheet.addRow(headers);
    let rows: Array<Requirement | TestCase | Bug | Record<string, string>> = [];
    if (type === 'requirements') rows = (await this.requirements.list({ projectId, pageSize: 500 })).items;
    if (type === 'test-cases') rows = (await this.cases.list({ projectId, pageSize: 500 })).items;
    if (type === 'bugs') rows = (await this.bugs.list({ projectId, pageSize: 500 })).items;
    if (type === 'run-results') rows = (await this.plans.list({ projectId, pageSize: 500 })).items.flatMap((plan) =>
      plan.runItems.map((item) => ({
        planName: plan.name,
        testPlanId: plan.id,
        runItemId: item.id,
        caseTitle: item.caseTitle,
        requirementId: item.requirementId || '',
        status: item.status,
        actualResult: item.actualResult || '',
        bugIds: item.bugIds.join(','),
        stepResults: JSON.stringify(item.stepResults || [])
      }))
    ) as never;
    for (const row of rows) sheet.addRow(this.toExportRow(type, row));
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async importRows(dto: ImportRowsDto, user: SessionUser): Promise<{ imported: number; errors: Array<{ row: number; message: string }> }> {
    const errors: Array<{ row: number; message: string }> = [];
    let imported = 0;
    for (const [index, row] of dto.rows.entries()) {
      try {
        if (dto.type === 'requirements') {
          await this.requirements.create({
            projectId: dto.projectId,
            title: String(row.title || row['标题'] || ''),
            description: String(row.description || row['描述'] || ''),
            riskOwnerId: typeof row.riskOwnerId === 'string' ? row.riskOwnerId : undefined,
            dueDate: String(row.dueDate || row['截止时间'] || ''),
            riskNote: String(row.riskNote || row['风险说明'] || ''),
            priority: (row.priority || row['优先级'] || 'P2') as never,
            status: (row.status || row['状态'] || 'ready') as never
          });
        } else if (dto.type === 'test-cases') {
          await this.cases.create({
            projectId: dto.projectId,
            requirementId: typeof row.requirementId === 'string' ? row.requirementId : undefined,
            title: String(row.title || row['标题'] || ''),
            preconditions: String(row.preconditions || row['前置条件'] || ''),
            steps: [{ action: String(row.step || row['步骤'] || ''), expected: String(row.expected || row['预期'] || '') }],
            expectedResult: String(row.expectedResult || row['预期结果'] || ''),
            priority: (row.priority || row['优先级'] || 'P2') as never,
            status: (row.status || row['状态'] || 'ready') as never,
            module: String(row.module || row['模块'] || ''),
            suiteId: String(row.suiteId || row['用例集'] || ''),
            version: String(row.version || row['版本'] || 'v1'),
            reviewStatus: (row.reviewStatus || row['评审状态'] || 'draft') as never,
            automationStatus: (row.automationStatus || row['自动化状态'] || 'manual') as never
          });
        } else if (dto.type === 'bugs') {
          await this.bugs.create(
            {
              projectId: dto.projectId,
              title: String(row.title || row['标题'] || ''),
              reproduceSteps: String(row.reproduceSteps || row['复现步骤'] || ''),
              actualResult: String(row.actualResult || row['实际结果'] || ''),
              expectedResult: String(row.expectedResult || row['期望结果'] || ''),
              severity: (row.severity || row['严重级别'] || 'S2') as never,
              priority: (row.priority || row['优先级'] || 'P2') as never,
              status: (row.status || row['状态'] || 'open') as never,
              assigneeId: typeof row.assigneeId === 'string' ? row.assigneeId : typeof row['负责人ID'] === 'string' ? row['负责人ID'] : undefined,
              requirementId: typeof row.requirementId === 'string' ? row.requirementId : typeof row['需求ID'] === 'string' ? row['需求ID'] : undefined,
              testCaseId: typeof row.testCaseId === 'string' ? row.testCaseId : typeof row['用例ID'] === 'string' ? row['用例ID'] : undefined,
              testPlanId: typeof row.testPlanId === 'string' ? row.testPlanId : typeof row['计划ID'] === 'string' ? row['计划ID'] : undefined,
              dueAt: String(row.dueAt || row['截止时间'] || ''),
              environment: String(row.environment || row['发现环境'] || ''),
              foundVersion: String(row.foundVersion || row['发现版本'] || ''),
              fixVersion: String(row.fixVersion || row['修复版本'] || ''),
              rootCause: String(row.rootCause || row['根因分析'] || ''),
              triageStatus: (row.triageStatus || row['分诊状态'] || 'new') as never
            },
            user
          );
        } else if (dto.type === 'run-results') {
          const testPlanId = String(row.testPlanId || row['计划ID'] || '').trim();
          const runItemId = String(row.runItemId || row['执行项ID'] || '').trim();
          if (!testPlanId || !runItemId) throw new Error('计划ID和执行项ID不能为空');
          const plan = await this.plans.get(testPlanId);
          if (plan.projectId !== dto.projectId) throw new Error('执行项不属于当前项目');
          const status = String(row.status || row['执行状态'] || 'untested') as TestRunStatus;
          if (!testRunStatuses.includes(status)) throw new Error(`执行状态无效：${status}`);
          await this.plans.updateRunItem(
            testPlanId,
            runItemId,
            {
              status,
              actualResult: String(row.actualResult || row['实际结果'] || '')
            },
            user
          );
        }
        imported += 1;
      } catch (error) {
        errors.push({ row: index + 1, message: (error as Error).message });
      }
    }
    return { imported, errors };
  }

  async importWorkbook(
    projectId: string,
    type: ImportRowsDto['type'],
    buffer: Buffer,
    user: SessionUser
  ): Promise<{ imported: number; errors: Array<{ row: number; message: string }> }> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return { imported: 0, errors: [{ row: 0, message: 'Excel 文件没有工作表' }] };
    const headerRow = sheet.getRow(1);
    const headers = headerRow.values as Array<string | undefined>;
    const rows: Array<Record<string, unknown>> = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const item: Record<string, unknown> = {};
      row.eachCell((cell, columnNumber) => {
        const header = headers[columnNumber];
        if (!header) return;
        item[String(header)] = cell.text || cell.value;
      });
      if (Object.keys(item).length > 0) rows.push(item);
    });
    return this.importRows({ projectId, type, rows }, user);
  }

  async previewWorkbook(projectId: string, type: ImportRowsDto['type'], buffer: Buffer): Promise<ImportPreview> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return { headers: [], mappings: [], totalRows: 0, validRows: 0, duplicateRows: [], errors: [{ row: 0, message: 'Excel 文件没有工作表' }] };
    }
    const headerRow = sheet.getRow(1);
    const headers = (headerRow.values as Array<string | undefined>).filter(Boolean).map(String);
    const mappings = this.expectedFields(type).map((field) => ({
      ...field,
      sourceHeader: headers.find((header) => header === field.label || header === field.field)
    }));
    const rows: Array<{ row: number; data: Record<string, string> }> = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const data: Record<string, string> = {};
      row.eachCell((cell, columnNumber) => {
        const header = (headerRow.values as Array<string | undefined>)[columnNumber];
        if (header) data[String(header)] = cell.text || String(cell.value || '');
      });
      if (Object.keys(data).length > 0) rows.push({ row: rowNumber, data });
    });
    const errors: ImportPreview['errors'] = [];
    const seen = new Map<string, number>();
    const duplicateRows: ImportPreview['duplicateRows'] = [];
    const validStatuses = type === 'run-results' ? testRunStatuses : undefined;
    for (const row of rows) {
      for (const field of mappings.filter((item) => item.required)) {
        const value = field.sourceHeader ? row.data[field.sourceHeader] : '';
        if (!value) errors.push({ row: row.row, field: field.field, message: `${field.label}不能为空` });
      }
      const statusHeader = mappings.find((item) => item.field === 'status')?.sourceHeader;
      const status = statusHeader ? row.data[statusHeader] : '';
      if (validStatuses && status && !validStatuses.includes(status as TestRunStatus)) {
        errors.push({ row: row.row, field: 'status', message: `执行状态无效：${status}` });
      }
      const keyHeader = mappings.find((item) => item.field === 'title' || item.field === 'runItemId')?.sourceHeader;
      const key = keyHeader ? row.data[keyHeader]?.trim() : '';
      if (key) {
        if (seen.has(key)) duplicateRows.push({ row: row.row, key, message: `与第 ${seen.get(key)} 行重复` });
        else seen.set(key, row.row);
      }
    }
    return {
      headers,
      mappings,
      totalRows: rows.length,
      validRows: Math.max(0, rows.length - new Set(errors.map((error) => error.row)).size),
      duplicateRows,
      errors
    };
  }

  private headers(type: ImportRowsDto['type']): string[] {
    if (type === 'requirements') return ['标题', '描述', '优先级', '状态', 'riskOwnerId', '截止时间', '风险说明'];
    if (type === 'test-cases') return ['标题', '模块', '用例集', '版本', '评审状态', '自动化状态', '前置条件', '步骤', '预期', '预期结果', '优先级', '状态', 'requirementId'];
    if (type === 'bugs') return ['标题', '复现步骤', '实际结果', '期望结果', '严重级别', '优先级', '状态', '分诊状态', '负责人ID', '需求ID', '用例ID', '计划ID', '截止时间', '发现环境', '发现版本', '修复版本', '根因分析'];
    return ['计划名称', '计划ID', '执行项ID', '用例标题', '需求ID', '执行状态', '实际结果', '关联Bug', '步骤结果'];
  }

  private toExportRow(type: ImportRowsDto['type'], row: Requirement | TestCase | Bug | Record<string, string>): string[] {
    if (type === 'requirements') {
      const item = row as Requirement;
      return [item.title, item.description || '', item.priority, item.status, item.riskOwnerId || '', item.dueDate || '', item.riskNote || ''];
    }
    if (type === 'test-cases') {
      const item = row as TestCase;
      const firstStep = item.steps[0];
      return [
        item.title,
        item.module || '',
        item.suiteId || '',
        item.version || 'v1',
        item.reviewStatus || 'draft',
        item.automationStatus || 'manual',
        item.preconditions || '',
        firstStep?.action || '',
        firstStep?.expected || '',
        item.expectedResult || '',
        item.priority,
        item.status,
        item.requirementId || ''
      ];
    }
    if (type === 'run-results') {
      const item = row as Record<string, string>;
      return [item.planName || '', item.testPlanId || '', item.runItemId || '', item.caseTitle || '', item.requirementId || '', item.status || '', item.actualResult || '', item.bugIds || '', item.stepResults || ''];
    }
    const item = row as Bug;
    return [item.title, item.reproduceSteps || '', item.actualResult || '', item.expectedResult || '', item.severity, item.priority, item.status, item.triageStatus || 'new', item.assigneeId || '', item.requirementId || '', item.testCaseId || '', item.testPlanId || '', item.dueAt || '', item.environment || '', item.foundVersion || '', item.fixVersion || '', item.rootCause || ''];
  }

  private expectedFields(type: ImportRowsDto['type']): Array<{ field: string; label: string; required?: boolean }> {
    if (type === 'requirements') return [
      { field: 'title', label: '标题', required: true },
      { field: 'description', label: '描述' },
      { field: 'priority', label: '优先级' },
      { field: 'status', label: '状态' },
      { field: 'riskOwnerId', label: 'riskOwnerId' },
      { field: 'dueDate', label: '截止时间' },
      { field: 'riskNote', label: '风险说明' }
    ];
    if (type === 'test-cases') return [
      { field: 'title', label: '标题', required: true },
      { field: 'module', label: '模块' },
      { field: 'suiteId', label: '用例集' },
      { field: 'version', label: '版本' },
      { field: 'reviewStatus', label: '评审状态' },
      { field: 'automationStatus', label: '自动化状态' },
      { field: 'preconditions', label: '前置条件' },
      { field: 'step', label: '步骤' },
      { field: 'expected', label: '预期' },
      { field: 'expectedResult', label: '预期结果' },
      { field: 'priority', label: '优先级' },
      { field: 'status', label: '状态' },
      { field: 'requirementId', label: 'requirementId' }
    ];
    if (type === 'bugs') return [
      { field: 'title', label: '标题', required: true },
      { field: 'reproduceSteps', label: '复现步骤' },
      { field: 'actualResult', label: '实际结果' },
      { field: 'expectedResult', label: '期望结果' },
      { field: 'severity', label: '严重级别' },
      { field: 'priority', label: '优先级' },
      { field: 'status', label: '状态' },
      { field: 'triageStatus', label: '分诊状态' },
      { field: 'environment', label: '发现环境' },
      { field: 'foundVersion', label: '发现版本' },
      { field: 'fixVersion', label: '修复版本' },
      { field: 'rootCause', label: '根因分析' }
    ];
    return [
      { field: 'testPlanId', label: '计划ID', required: true },
      { field: 'runItemId', label: '执行项ID', required: true },
      { field: 'status', label: '执行状态', required: true },
      { field: 'actualResult', label: '实际结果' }
    ];
  }
}

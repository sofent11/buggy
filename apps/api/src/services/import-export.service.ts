import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { Bug, Requirement, TestCase, TestRunStatus } from '@buggy/shared-types';
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
        status: item.status,
        actualResult: item.actualResult || ''
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
            status: (row.status || row['状态'] || 'ready') as never
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
              priority: (row.priority || row['优先级'] || 'P2') as never
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

  private headers(type: ImportRowsDto['type']): string[] {
    if (type === 'requirements') return ['标题', '描述', '优先级', '状态'];
    if (type === 'test-cases') return ['标题', '前置条件', '步骤', '预期', '预期结果', '优先级', '状态', 'requirementId'];
    if (type === 'bugs') return ['标题', '复现步骤', '实际结果', '期望结果', '严重级别', '优先级'];
    return ['计划名称', '计划ID', '执行项ID', '用例标题', '执行状态', '实际结果'];
  }

  private toExportRow(type: ImportRowsDto['type'], row: Requirement | TestCase | Bug | Record<string, string>): string[] {
    if (type === 'requirements') {
      const item = row as Requirement;
      return [item.title, item.description || '', item.priority, item.status];
    }
    if (type === 'test-cases') {
      const item = row as TestCase;
      const firstStep = item.steps[0];
      return [
        item.title,
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
      return [item.planName || '', item.testPlanId || '', item.runItemId || '', item.caseTitle || '', item.status || '', item.actualResult || ''];
    }
    const item = row as Bug;
    return [item.title, item.reproduceSteps || '', item.actualResult || '', item.expectedResult || '', item.severity, item.priority];
  }
}

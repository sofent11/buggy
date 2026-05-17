import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import axios from 'axios';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RequirementEntity } from '../database/requirement.schema.js';
import { ProjectEntity } from '../database/project.schema.js';
import { ReportService } from './report.service.js';
import { idOf } from '../shared/mongo.js';
import { normalizeProjectQualitySettings } from './project.service.js';

@Injectable()
export class LarkService {
  private readonly logger = new Logger(LarkService.name);

  constructor(
    @InjectModel(RequirementEntity.name) private readonly requirements: Model<RequirementEntity>,
    @InjectModel(ProjectEntity.name) private readonly projects: Model<ProjectEntity>,
    private readonly reports: ReportService
  ) {}

  @Cron(process.env.LARK_DAILY_CRON || '0 18 * * *', { timeZone: 'Asia/Shanghai' })
  async sendDailyProgress(): Promise<void> {
    const requirements = await this.requirements.find({ larkWebhook: { $ne: '' } });
    for (const requirement of requirements) {
      try {
        await this.sendRequirementProgress(idOf(requirement._id));
      } catch (error) {
        this.logger.warn(`发送 Lark 日报失败: ${requirement.title} ${(error as Error).message}`);
      }
    }
  }

  async sendRequirementProgress(requirementId: string): Promise<{ sent: boolean }> {
    const requirement = await this.requirements.findById(requirementId);
    if (!requirement) throw new BadRequestException('需求不存在');
    const project = await this.projects.findById(requirement.projectId).select('qualitySettings');
    const projectWebhook = normalizeProjectQualitySettings(project?.qualitySettings).integrations.larkWebhook;
    const webhook = requirement.larkWebhook || projectWebhook;
    if (!webhook) throw new BadRequestException('需求或项目未配置 Lark webhook');
    const summary = await this.reports.summary({ projectId: idOf(requirement.projectId), requirementId });
    const content = [
      `需求：${requirement.title}`,
      `执行进度：${summary.execution.total - summary.execution.untested}/${summary.execution.total}`,
      `通过率：${summary.execution.passRate}%`,
      `失败/阻塞：${summary.execution.failed}/${summary.execution.blocked}`,
      `活跃缺陷：${summary.bugs.active}`
    ].join('\n');
    await axios.post(webhook, {
      msg_type: 'text',
      content: {
        text: `Buggy 每日测试进度\n${content}`
      }
    });
    return { sent: true };
  }
}

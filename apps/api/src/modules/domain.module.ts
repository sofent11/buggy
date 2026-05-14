import { Module } from '@nestjs/common';
import { BugController } from '../controllers/bug.controller.js';
import { DictionaryController } from '../controllers/dictionary.controller.js';
import { HealthController } from '../controllers/health.controller.js';
import { ImportExportController } from '../controllers/import-export.controller.js';
import { IterationController } from '../controllers/iteration.controller.js';
import { ProjectController } from '../controllers/project.controller.js';
import { ReportController } from '../controllers/report.controller.js';
import { RequirementController } from '../controllers/requirement.controller.js';
import { TestCaseController } from '../controllers/test-case.controller.js';
import { TestPlanController } from '../controllers/test-plan.controller.js';
import { UserController } from '../controllers/user.controller.js';
import { BugService } from '../services/bug.service.js';
import { DictionaryService } from '../services/dictionary.service.js';
import { ImportExportService } from '../services/import-export.service.js';
import { IterationService } from '../services/iteration.service.js';
import { LarkService } from '../services/lark.service.js';
import { ProjectService } from '../services/project.service.js';
import { ProjectCleanupService } from '../services/project-cleanup.service.js';
import { ReportService } from '../services/report.service.js';
import { RequirementService } from '../services/requirement.service.js';
import { TestCaseService } from '../services/test-case.service.js';
import { TestPlanService } from '../services/test-plan.service.js';
import { UserService } from '../services/user.service.js';
import { AuthModule } from './auth.module.js';
import { DatabaseModule } from './database.module.js';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [
    HealthController,
    ProjectController,
    IterationController,
    RequirementController,
    TestCaseController,
    TestPlanController,
    BugController,
    ReportController,
    ImportExportController,
    DictionaryController,
    UserController
  ],
  providers: [
    ProjectService,
    IterationService,
    RequirementService,
    TestCaseService,
    TestPlanService,
    BugService,
    ReportService,
    ImportExportService,
    DictionaryService,
    LarkService,
    UserService,
    ProjectCleanupService
  ],
  exports: [ProjectService]
})
export class DomainModule {}

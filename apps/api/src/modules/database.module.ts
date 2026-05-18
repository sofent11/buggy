import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActivityEntity, ActivitySchema } from '../database/activity.schema.js';
import { AcceptanceScopeEntity, AcceptanceScopeSchema } from '../database/acceptance-scope.schema.js';
import { BugEntity, BugSchema } from '../database/bug.schema.js';
import { DictionaryEntity, DictionarySchema } from '../database/dictionary.schema.js';
import { IterationEntity, IterationSchema } from '../database/iteration.schema.js';
import { NotificationEntity, NotificationSchema } from '../database/notification.schema.js';
import { ProjectJoinRequestEntity, ProjectJoinRequestSchema } from '../database/project-join-request.schema.js';
import { ProjectEntity, ProjectSchema } from '../database/project.schema.js';
import { RequirementEntity, RequirementSchema } from '../database/requirement.schema.js';
import { SavedViewEntity, SavedViewSchema } from '../database/saved-view.schema.js';
import { TestCaseEntity, TestCaseSchema } from '../database/test-case.schema.js';
import { TestPlanEntity, TestPlanSchema } from '../database/test-plan.schema.js';
import { UserEntity, UserSchema } from '../database/user.schema.js';

@Module({
  imports: [
    MongooseModule.forRoot(process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/buggy', {
      autoIndex: process.env.MONGO_AUTO_INDEX !== 'false'
    }),
    MongooseModule.forFeature([
      { name: UserEntity.name, schema: UserSchema },
      { name: ProjectEntity.name, schema: ProjectSchema },
      { name: ProjectJoinRequestEntity.name, schema: ProjectJoinRequestSchema },
      { name: IterationEntity.name, schema: IterationSchema },
      { name: RequirementEntity.name, schema: RequirementSchema },
      { name: TestCaseEntity.name, schema: TestCaseSchema },
      { name: TestPlanEntity.name, schema: TestPlanSchema },
      { name: BugEntity.name, schema: BugSchema },
      { name: DictionaryEntity.name, schema: DictionarySchema },
      { name: ActivityEntity.name, schema: ActivitySchema },
      { name: AcceptanceScopeEntity.name, schema: AcceptanceScopeSchema },
      { name: NotificationEntity.name, schema: NotificationSchema },
      { name: SavedViewEntity.name, schema: SavedViewSchema }
    ])
  ],
  exports: [MongooseModule]
})
export class DatabaseModule {}

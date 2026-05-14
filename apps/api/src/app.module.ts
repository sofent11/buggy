import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './modules/auth.module.js';
import { DatabaseModule } from './modules/database.module.js';
import { DomainModule } from './modules/domain.module.js';

@Module({
  imports: [ScheduleModule.forRoot(), DatabaseModule, AuthModule, DomainModule]
})
export class AppModule {}

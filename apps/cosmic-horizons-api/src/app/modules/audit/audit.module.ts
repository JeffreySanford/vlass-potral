import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { ComplianceAuditorService } from './services/compliance-auditor.service';
import { AuditTrailConsumer } from './consumers/audit-trail.consumer';

@Module({
  imports: [EventsModule],
  providers: [ComplianceAuditorService, AuditTrailConsumer],
  exports: [ComplianceAuditorService, AuditTrailConsumer],
})
export class AuditModule {}

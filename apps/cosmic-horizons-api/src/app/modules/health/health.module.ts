import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { SystemHealthMonitorService } from './services/system-health-monitor.service';
import { SystemHealthConsumer } from './consumers/system-health.consumer';

@Module({
  imports: [EventsModule],
  providers: [SystemHealthMonitorService, SystemHealthConsumer],
  exports: [SystemHealthMonitorService, SystemHealthConsumer],
})
export class HealthModule {}

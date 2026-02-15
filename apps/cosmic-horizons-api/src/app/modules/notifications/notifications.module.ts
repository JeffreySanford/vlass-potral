import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { NotificationService } from './services/notification.service';
import { JobEventsConsumer } from './consumers/job-events.consumer';

@Module({
  imports: [EventsModule],
  providers: [NotificationService, JobEventsConsumer],
  exports: [NotificationService, JobEventsConsumer],
})
export class NotificationsModule {}

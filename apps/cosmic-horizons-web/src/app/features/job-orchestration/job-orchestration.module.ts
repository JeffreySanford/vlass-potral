import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatInputModule } from '@angular/material/input';
import { MatDialogModule } from '@angular/material/dialog';

import { JobOrchestrationComponent } from './job-orchestration.component';
import { JobSubmissionFormComponent } from './job-submission-form/job-submission-form.component';
import { JobQueueListComponent } from './job-queue-list/job-queue-list.component';
import { JobOrchestrationRoutingModule } from './job-orchestration-routing.module';
import { CountByStatusPipe } from './pipes/count-by-status.pipe';

@NgModule({
  declarations: [
    JobOrchestrationComponent,
    JobSubmissionFormComponent,
    JobQueueListComponent,
    CountByStatusPipe,
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatTabsModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTooltipModule,
    MatInputModule,
    MatDialogModule,
    JobOrchestrationRoutingModule,
  ],
  exports: [JobOrchestrationComponent],
})
export class JobOrchestrationModule {}

import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { JobOrchestrationComponent } from './job-orchestration.component';

const routes: Routes = [
  {
    path: '',
    component: JobOrchestrationComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class JobOrchestrationRoutingModule {}

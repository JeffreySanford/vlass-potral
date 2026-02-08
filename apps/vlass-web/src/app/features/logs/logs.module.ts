import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MaterialModule } from '../../shared/material/material.module';
import { LogsComponent } from './logs.component';

const logsRoutes: Routes = [
  {
    path: '',
    component: LogsComponent,
  },
];

@NgModule({
  declarations: [LogsComponent],
  imports: [CommonModule, MaterialModule, RouterModule.forChild(logsRoutes)],
})
export class LogsModule {}

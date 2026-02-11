import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MaterialModule } from '../../shared/material/material.module';
import { DocsComponent } from './docs.component';

const routes: Routes = [
  {
    path: '',
    component: DocsComponent,
  },
  {
    path: ':docId',
    component: DocsComponent,
  },
];

@NgModule({
  declarations: [DocsComponent],
  imports: [CommonModule, MaterialModule, RouterModule.forChild(routes)],
})
export class DocsModule {}

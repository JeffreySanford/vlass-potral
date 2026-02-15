import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { MaterialModule } from '../../shared/material/material.module';
import { LandingComponent } from './landing.component';
import { GdprLocationDialogComponent } from './gdpr-location-dialog/gdpr-location-dialog.component';
import { MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';

const landingRoutes: Routes = [
  {
    path: '',
    component: LandingComponent,
  },
];

@NgModule({
  declarations: [LandingComponent, GdprLocationDialogComponent],
  imports: [
    CommonModule,
    MaterialModule,
    RouterModule.forChild(landingRoutes),
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    FormsModule,
  ],
})
export class LandingModule {}

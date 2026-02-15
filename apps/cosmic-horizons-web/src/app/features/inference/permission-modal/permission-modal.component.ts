import { Component, inject } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-permission-modal',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  templateUrl: './permission-modal.component.html',
  styleUrls: ['./permission-modal.component.scss'],
})
export class PermissionModalComponent {
  private readonly dialogRef = inject(MatDialogRef<PermissionModalComponent>);

  onAllow(): void {
    this.dialogRef.close(true);
  }

  onDeny(): void {
    this.dialogRef.close(false);
  }
}

import { Component, OnInit, inject } from '@angular/core';
import { AppLogEntry, AppLoggerService } from '../../services/app-logger.service';

@Component({
  selector: 'app-logs',
  templateUrl: './logs.component.html',
  styleUrl: './logs.component.scss',
  standalone: false, // eslint-disable-line @angular-eslint/prefer-standalone
})
export class LogsComponent implements OnInit {
  entries: AppLogEntry[] = [];

  private readonly appLogger = inject(AppLoggerService);

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.entries = this.appLogger.snapshot().reverse();
  }

  trackByEntry(index: number, entry: AppLogEntry): string {
    return `${entry.at}-${entry.area}-${entry.event}-${index}`;
  }
}

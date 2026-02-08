import { Injectable, isDevMode } from '@angular/core';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AppLogEntry {
  at: string;
  area: string;
  event: string;
  level: LogLevel;
  details?: Record<string, boolean | number | string | null>;
}

@Injectable({
  providedIn: 'root',
})
export class AppLoggerService {
  private readonly maxEntries = 500;
  private readonly entries: AppLogEntry[] = [];

  info(area: string, event: string, details?: Record<string, boolean | number | string | null>): void {
    this.push({
      at: new Date().toISOString(),
      area,
      event,
      level: 'info',
      details,
    });
  }

  debug(area: string, event: string, details?: Record<string, boolean | number | string | null>): void {
    if (!isDevMode()) {
      return;
    }

    this.push({
      at: new Date().toISOString(),
      area,
      event,
      level: 'debug',
      details,
    });
  }

  snapshot(): AppLogEntry[] {
    return [...this.entries];
  }

  private push(entry: AppLogEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }
  }
}


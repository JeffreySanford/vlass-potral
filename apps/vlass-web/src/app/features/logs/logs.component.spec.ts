import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLoggerService } from '../../services/app-logger.service';
import { LogsComponent } from './logs.component';

describe('LogsComponent', () => {
  let fixture: ComponentFixture<LogsComponent>;
  let component: LogsComponent;
  let appLoggerService: { snapshot: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    appLoggerService = {
      snapshot: vi.fn().mockReturnValue([
        {
          at: '2026-02-08T01:00:00.000Z',
          area: 'viewer',
          event: 'aladin_initialized',
          level: 'info',
          details: { grid_enabled: false },
        },
      ]),
    };

    await TestBed.configureTestingModule({
      declarations: [LogsComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [{ provide: AppLoggerService, useValue: appLoggerService }],
    }).compileComponents();

    fixture = TestBed.createComponent(LogsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads logger entries on init', () => {
    expect(appLoggerService.snapshot).toHaveBeenCalled();
    expect(component.entries.length).toBe(1);
    expect(component.entries[0]?.event).toBe('aladin_initialized');
  });

  it('refreshes entries from logger service', () => {
    appLoggerService.snapshot.mockReturnValue([
      {
        at: '2026-02-08T01:05:00.000Z',
        area: 'viewer',
        event: 'grid_toggle_applied',
        level: 'info',
      },
    ]);

    component.refresh();

    expect(component.entries.length).toBe(1);
    expect(component.entries[0]?.event).toBe('grid_toggle_applied');
  });
});

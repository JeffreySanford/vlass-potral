import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { EphemerisApiService, EphemerisResult } from './ephemeris-api.service';
import { AppLoggerService } from '../../services/app-logger.service';
import { AuthSessionService } from '../../services/auth-session.service';

@Component({
  selector: 'app-ephemeris',
  templateUrl: './ephemeris.component.html',
  styleUrls: ['./ephemeris.component.scss'],
  standalone: false,
})
export class EphemerisComponent implements OnInit, OnDestroy {
  searchForm: FormGroup;
  loading = false;
  submitted = false;
  error = '';
  result: EphemerisResult | null = null;
  noResultsMessage = '';

  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly ephemerisApiService = inject(EphemerisApiService);
  private readonly authSessionService = inject(AuthSessionService);
  private readonly logger = inject(AppLoggerService);
  private readonly destroy$ = new Subject<void>();

  get user() {
    return this.authSessionService.getUser() || { username: '', email: '', id: '', display_name: '', role: 'user' as const, created_at: '' };
  }

  constructor() {
    this.searchForm = this.formBuilder.group({
      target: ['', [Validators.required, Validators.minLength(2)]],
      epoch: [''],
    });
  }

  ngOnInit(): void {
    this.logger.info('ephemeris', 'page_loaded');
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get f() {
    return this.searchForm.controls;
  }

  onSubmit(): void {
    this.submitted = true;
    this.error = '';
    this.result = null;
    this.noResultsMessage = '';

    this.logger.info('ephemeris', 'search_submit', {
      form_valid: this.searchForm.valid,
    });

    if (this.searchForm.invalid) {
      return;
    }

    this.loading = true;
    const target = this.searchForm.get('target')?.value as string;
    const epoch = this.searchForm.get('epoch')?.value as string | undefined;

    this.ephemerisApiService
      .search({ target, epoch })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: EphemerisResult) => {
          this.result = response;
          this.loading = false;
          this.logger.info('ephemeris', 'search_success', {
            target,
            ra: response.ra,
            dec: response.dec,
          });
        },
        error: (error: HttpErrorResponse) => {
          this.loading = false;
          this.error = this.formatErrorMessage(error);
          this.logger.error('ephemeris', 'search_failed', {
            target,
            status_code: error.status,
            error: error.error?.message || error.statusText,
          });
        },
      });
  }

  clearSearch(): void {
    this.searchForm.reset();
    this.result = null;
    this.error = '';
    this.noResultsMessage = '';
    this.submitted = false;
  }

  logout(): void {
    this.authSessionService.clearSession();
    this.logger.info('ephemeris', 'logout_success');
    this.router.navigate(['/auth/login']);
  }

  private formatErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 404) {
      return `Object "${this.searchForm.get('target')?.value}" not found. Please check the object name and try again.`;
    }
    if (error.status === 400) {
      return error.error?.message || 'Invalid search parameters. Please check your input.';
    }
    if (error.status === 429) {
      return 'Too many requests. Please wait before searching again.';
    }
    return error.error?.message || 'Search failed. Please try again.';
  }
}

import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  display_name?: string;
}

export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string | null;
  display_name: string;
  created_at: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: 'Bearer';
  user: AuthenticatedUser;
}

@Injectable({
  providedIn: 'root',
})
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = 'http://localhost:3000';

  login(request: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(
      `${this.apiBaseUrl}/api/auth/login`,
      request
    );
  }

  register(request: RegisterRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(
      `${this.apiBaseUrl}/api/auth/register`,
      request
    );
  }
}

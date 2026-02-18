import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { UserProfile } from '../models/activity.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly isAuthenticated = signal(false);
  readonly user = signal<UserProfile | null>(null);

  private accessToken = signal<string | null>(null);

  /**
   * Redirects the browser to begin the GitHub OAuth flow.
   */
  login(): void {
    window.location.href = '/api/auth/github';
  }

  /**
   * Calls the logout endpoint, resets local state, and navigates to /login.
   */
  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', {}));
    } catch {
      // Even if the request fails, clear local state
    }
    this.isAuthenticated.set(false);
    this.user.set(null);
    this.accessToken.set(null);
    this.router.navigate(['/login']);
  }

  /**
   * Calls /api/auth/user to restore session state on app load.
   * Gracefully handles expired or missing sessions.
   * If the user is authenticated and currently on /login, navigates to /dashboard.
   */
  async checkSession(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.http.get<{ user: UserProfile }>('/api/auth/user')
      );
      this.user.set(response.user);
      this.isAuthenticated.set(true);
      // If the user landed on /login (e.g. after SSR redirect), send them to the dashboard.
      if (this.router.url === '/login' || this.router.url === '/') {
        this.router.navigate(['/dashboard']);
      }
    } catch {
      this.isAuthenticated.set(false);
      this.user.set(null);
    }
  }

  /**
   * Returns the stored access token (used internally by GitHubService).
   */
  getToken(): string | null {
    return this.accessToken();
  }
}

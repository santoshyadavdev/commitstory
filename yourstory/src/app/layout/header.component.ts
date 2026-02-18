import { Component, inject } from '@angular/core';
import { AuthService } from '../core/auth/auth.service';

@Component({
  selector: 'app-header',
  standalone: true,
  template: `
    @if (authService.isAuthenticated()) {
      <header class="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <span class="text-white font-bold text-lg tracking-tight">CommitStory</span>

        <div class="flex items-center gap-4">
          @if (authService.user(); as user) {
            <img
              [src]="user.avatar_url"
              [alt]="user.login"
              class="w-8 h-8 rounded-full border border-gray-700"
            />
            <span class="text-gray-300 text-sm hidden sm:block">{{ user.name || user.login }}</span>
          }

          <button
            (click)="logout()"
            class="text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            Logout
          </button>
        </div>
      </header>
    }
  `,
})
export class HeaderComponent {
  protected readonly authService = inject(AuthService);

  logout(): void {
    this.authService.logout();
  }
}

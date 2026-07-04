import { Component, inject } from '@angular/core';
import { ThemeService } from '../core/services/theme.service';

@Component({
  selector: 'app-header',
  standalone: true,
  template: `
    <header class="bg-coderabbit-cream dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-3 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <img src="/coderabbit-icon-dark.svg" alt="CommitStory logo" class="w-7 h-7 block dark:hidden" />
        <img src="/coderabbit-icon-light.svg" alt="CommitStory logo" class="w-7 h-7 hidden dark:block" />
        <span class="text-gray-900 dark:text-white font-bold text-lg tracking-tight">CommitStory</span>
      </div>

      <!-- Theme toggle -->
      <button
        (click)="themeService.toggle()"
        class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors cursor-pointer"
        [attr.aria-label]="themeService.isDark() ? 'Switch to light mode' : 'Switch to dark mode'"
        [attr.title]="themeService.isDark() ? 'Switch to light mode' : 'Switch to dark mode'"
      >
        @if (themeService.isDark()) {
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5"/>
            <path stroke-linecap="round" d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
          </svg>
        } @else {
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
          </svg>
        }
      </button>
    </header>
  `,
})
export class HeaderComponent {
  protected readonly themeService = inject(ThemeService);
}

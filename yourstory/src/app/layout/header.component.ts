import { Component, inject } from '@angular/core';
import { ThemeService } from '../core/services/theme.service';

@Component({
  selector: 'app-header',
  standalone: true,
  template: `
    <header class="bg-cui-base-1 border-b border-cui-neutral px-6 py-3 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <img src="/coderabbit-icon-dark.svg" alt="CommitStory logo" class="w-7 h-7 block dark:hidden" />
        <img src="/coderabbit-icon-light.svg" alt="CommitStory logo" class="w-7 h-7 hidden dark:block" />
        <span class="text-cui-primary font-bold text-lg tracking-tight">CommitStory</span>
      </div>

      <div class="flex items-center gap-2">
        <!-- GitHub repo link -->
        <a
          href="https://github.com/santoshyadavdev/commitstory"
          target="_blank"
          rel="noopener noreferrer"
          class="w-8 h-8 flex items-center justify-center rounded-lg text-cui-secondary hover:text-cui-primary bg-cui-base-2 hover:bg-cui-subtle transition-colors"
          aria-label="GitHub repository"
          title="GitHub repository"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
          </svg>
        </a>

        <!-- Theme toggle -->
        <button
        (click)="themeService.toggle()"
        class="w-8 h-8 flex items-center justify-center rounded-lg text-cui-secondary hover:text-cui-primary bg-cui-base-2 hover:bg-cui-subtle transition-colors cursor-pointer"
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
      </div>
    </header>
  `,
})
export class HeaderComponent {
  protected readonly themeService = inject(ThemeService);
}

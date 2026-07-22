import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly isDark = signal<boolean>(false);

  constructor() {
    this.initTheme();
  }

  init(): void {
    // Called from APP_INITIALIZER — constructor already handles setup,
    // this is a no-op entry point so the factory can return a synchronous fn.
  }

  private initTheme(): void {
    if (!this.isBrowser) return;

    const stored = localStorage.getItem('theme');
    let dark: boolean;

    if (stored === 'dark') {
      dark = true;
    } else if (stored === 'light') {
      dark = false;
    } else {
      dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    this.isDark.set(dark);
    this.applyTheme(dark);

    // React to OS-level preference changes (only when no manual override)
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('theme')) {
        this.isDark.set(e.matches);
        this.applyTheme(e.matches);
      }
    });
  }

  toggle(): void {
    if (!this.isBrowser) return;
    const newDark = !this.isDark();
    this.isDark.set(newDark);
    this.applyTheme(newDark);
    localStorage.setItem('theme', newDark ? 'dark' : 'light');
  }

  private applyTheme(dark: boolean): void {
    if (!this.isBrowser) return;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }
}

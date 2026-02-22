import { Component, HostListener, Input, signal } from '@angular/core';
import { SharePlatform } from '../../../core/constants/share.constants';

interface PlatformOption {
  id: SharePlatform;
  label: string;
  /** Emoji fallback icon */
  icon: string;
  /** Optional inline SVG path(s) — rendered instead of emoji when present */
  svgPath?: string;
  /** viewBox for the SVG, defaults to "0 0 24 24" */
  svgViewBox?: string;
}

const PLATFORMS: PlatformOption[] = [
  { id: 'twitter',   label: 'Twitter / X', icon: '𝕏'  },
  { id: 'linkedin',  label: 'LinkedIn',     icon: '💼' },
  {
    id: 'facebook',
    label: 'Facebook',
    icon: '📘',
    svgPath: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z',
  },
  { id: 'whatsapp',  label: 'WhatsApp',     icon: '💬' },
  { id: 'instagram', label: 'Instagram',    icon: '📸' },
];

@Component({
  selector: 'app-share-dropdown',
  standalone: true,
  template: `
    <div class="relative">
      <!-- Trigger button -->
      <button
        (click)="toggle($event)"
        class="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white text-sm font-medium px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 transition-colors cursor-pointer"
        [attr.aria-expanded]="open()"
        aria-haspopup="true"
        aria-label="Share"
      >
        <span aria-hidden="true">📤</span>
        <span>Share</span>
        <svg
          class="w-3.5 h-3.5 transition-transform"
          [class.rotate-180]="open()"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"
          aria-hidden="true"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
        </svg>
      </button>

      <!-- Dropdown menu -->
      @if (open()) {
        <div
          class="fixed bottom-4 left-4 right-4 w-auto sm:absolute sm:bottom-full sm:mb-2 sm:left-auto sm:right-0 sm:w-64 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl z-50 overflow-hidden"
          role="menu"
        >
          <!-- Clipboard hint -->
          <div class="px-4 py-2.5 bg-coderabbit-orange/10 border-b border-gray-200 dark:border-gray-700 flex items-start gap-2">
            <span class="text-sm leading-none mt-0.5" aria-hidden="true">📋</span>
            <p class="text-xs text-gray-600 dark:text-gray-400 leading-snug">
              Your image will be <strong class="text-gray-900 dark:text-white">copied to clipboard</strong> — paste it into your post after opening the platform.
            </p>
          </div>

          @for (platform of platforms; track platform.id) {
            <button
              (click)="select(platform.id)"
              class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left cursor-pointer"
              role="menuitem"
            >
              @if (platform.svgPath) {
                <svg
                  [attr.viewBox]="platform.svgViewBox ?? '0 0 24 24'"
                  fill="currentColor"
                  class="w-4 h-4 shrink-0 text-[#1877F2]"
                  aria-hidden="true"
                ><path [attr.d]="platform.svgPath"/></svg>
              } @else {
                <span class="text-base leading-none w-4 text-center" aria-hidden="true">{{ platform.icon }}</span>
              }
              <span>{{ platform.label }}</span>
            </button>
          }
        </div>
      }
    </div>
  `,
})
export class ShareDropdownComponent {
  @Input({ required: true }) onShare!: (platform: SharePlatform) => void;

  readonly platforms = PLATFORMS;
  readonly open = signal(false);

  toggle(event: MouseEvent): void {
    event.stopPropagation();
    this.open.update(v => !v);
  }

  select(platform: SharePlatform): void {
    this.open.set(false);
    this.onShare(platform);
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.open.set(false);
  }
}

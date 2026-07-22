# Carrot UI Design Token Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all ad-hoc color/styling values with carrot-ui design tokens and migrate from Tailwind CSS v3 to v4.

**Architecture:** Import carrot-ui's `scales.css` and `theme.css` directly from the npm package for color scales and semantic tokens. Rewrite `styles.css` for Tailwind v4 CSS-first config. Switch dark mode from class-based to `data-theme` attribute. Replace all component color classes with semantic `cui-*` tokens.

**Tech Stack:** Angular 21, Tailwind CSS v4, `@coderabbitai/carrot-ui` (CSS tokens only), `@fontsource-variable/geist`, `hack-font`, Vite

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `package.json` | Modify | Add `@fontsource-variable/geist`; add `@tailwindcss/postcss` (devDep); `@coderabbitai/carrot-ui` stays in dependencies |
| `yourstory/tailwind.config.js` | Delete | No longer needed with TW v4 CSS-first config |
| `yourstory/vite.config.mts` | Modify | Remove `@tailwindcss/vite` (PostCSS handles Tailwind) |
| `yourstory/src/styles.css` | Rewrite | TW v4 imports, carrot-ui token imports, dark mode variant, custom animations |
| `yourstory/src/index.html` | Modify | Add `data-theme="light"` to `<html>` tag |
| `yourstory/src/app/core/services/theme.service.ts` | Modify | Switch from class toggle to `data-theme` attribute |
| `yourstory/src/app/layout/header.component.ts` | Modify | Replace color classes with cui tokens |
| `yourstory/src/app/shared/components/share-dropdown/share-dropdown.component.ts` | Modify | Replace color classes with cui tokens |
| `yourstory/src/app/pages/dashboard/dashboard.component.ts` | Modify | Replace color classes with cui tokens throughout template and share handler methods |

**Design decision — milestone-type accent colors:** The timeline milestone utility methods (`getMilestoneNodeClasses`, `getMilestoneCardClasses`, etc.) use Tailwind built-in palette colors (violet, amber, teal, emerald) as per-milestone-type accents. These are NOT replaced with carrot-ui semantic tokens because they serve as category-specific colors, not theme-level tokens. Tailwind v4 still provides these palette colors out of the box. Only the gray/neutral fallback cases and `coderabbit-orange` references are updated.

**Design decision — share handler background colors:** The `storyShareHandler`, `timelineShareHandler`, and `insightsShareHandler` methods use hardcoded hex values (`'#171717'` / `'#F6F6F1'`) for the `html-to-image` background color. These must be updated to use the carrot-ui scale values. We'll use `getComputedStyle` to read the actual `--background-color-cui-base-1` value at runtime so they stay in sync with the theme.

---

### Task 1: Install dependencies and configure Tailwind v4

**Files:**
- Modify: `package.json`
- Modify: `yourstory/vite.config.mts`
- Delete: `yourstory/tailwind.config.js`

- [ ] **Step 1: Install Tailwind v4, fonts, and Vite plugin**

```bash
npm install tailwindcss@4 @tailwindcss/postcss @fontsource-variable/geist --save
```

This upgrades `tailwindcss` from v3 to v4, adds the Vite plugin, and installs the font packages. The `autoprefixer` and `postcss` devDependencies can remain — they're harmless and may be used elsewhere.

- [ ] **Step 2: Add `@tailwindcss/vite` plugin to Vite config**

In `yourstory/vite.config.mts`, add the import and plugin:

```typescript
/// <reference types='vitest' />
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import tailwindcss from '@tailwindcss/vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../node_modules/.vite/yourstory',
  plugins: [angular(), tailwindcss(), nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  // Uncomment this if you are using workers.
  // worker: {
  //   plugins: () => [ nxViteTsPaths() ],
  // },
  test: {
    name: 'yourstory',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    setupFiles: ['src/test-setup.ts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../coverage/yourstory',
      provider: 'v8' as const,
    },
  },
}));
```

- [ ] **Step 3: Delete `tailwind.config.js`**

```bash
rm yourstory/tailwind.config.js
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: install Tailwind v4 + carrot-ui fonts, remove TW v3 config"
```

---

### Task 2: Rewrite `styles.css` for Tailwind v4 with carrot-ui tokens

**Files:**
- Rewrite: `yourstory/src/styles.css`

- [ ] **Step 1: Replace entire `styles.css` with Tailwind v4 + carrot-ui imports**

```css
@import "tailwindcss";
@import "@fontsource-variable/geist";
@import "@coderabbitai/carrot-ui/scales";
@import "@coderabbitai/carrot-ui/theme";

@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));

@theme {
  /* App-specific animations (preserved from old tailwind.config.js) */
  --animate-blob: blob 7s infinite ease-in-out;
  --animate-fade-in: fadeIn 0.8s ease-out both;
  --animate-fade-in-slow: fadeIn 0.8s ease-out 0.3s both;
  --animate-fade-in-slower: fadeIn 0.8s ease-out 0.6s both;
  --animate-glow-pulse: glowPulse 2s ease-in-out infinite;
  --animate-gradient-shift: gradientShift 6s ease infinite;
}

@keyframes blob {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(30px, -50px) scale(1.1); }
  66% { transform: translate(-20px, 20px) scale(0.9); }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes glowPulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

@keyframes gradientShift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}

/* Body base styles using carrot-ui tokens */
body {
  @apply bg-cui-base-1 font-cui-sans text-cui-base text-cui-primary;
}

/* Horizontal timeline scrollbar */
.timeline-scroll {
  scrollbar-width: thin;
  scrollbar-color: var(--border-color-cui-neutral) transparent;
}

.timeline-scroll::-webkit-scrollbar {
  height: 6px;
}

.timeline-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.timeline-scroll::-webkit-scrollbar-thumb {
  background-color: var(--border-color-cui-neutral);
  border-radius: 3px;
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

- [ ] **Step 2: Commit**

```bash
git add yourstory/src/styles.css
git commit -m "feat: rewrite styles.css for Tailwind v4 with carrot-ui tokens"
```

---

### Task 3: Update dark mode infrastructure

**Files:**
- Modify: `yourstory/src/index.html`
- Modify: `yourstory/src/app/core/services/theme.service.ts`

- [ ] **Step 1: Add `data-theme` attribute to `index.html`**

In `yourstory/src/index.html`, change the opening `<html>` tag:

```html
<html lang="en" data-theme="light">
```

- [ ] **Step 2: Update `ThemeService` to use `data-theme` attribute**

Replace the entire `applyTheme` method and remove the class-based approach:

```typescript
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
```

- [ ] **Step 3: Run tests**

```bash
npx nx test yourstory
```

Expected: build succeeds. Note: a pre-existing `window.matchMedia is not a function` jsdom failure exists (not caused by this migration). Targeted validation: verify ThemeService still toggles `data-theme` attribute correctly and no new test regressions are introduced.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: switch dark mode from class to data-theme attribute"
```

---

### Task 4: Update header component with carrot-ui tokens

**Files:**
- Modify: `yourstory/src/app/layout/header.component.ts`

- [ ] **Step 1: Replace header template color classes**

Replace the entire template in `header.component.ts`:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add yourstory/src/app/layout/header.component.ts
git commit -m "feat: update header component with carrot-ui tokens"
```

---

### Task 5: Update share-dropdown component with carrot-ui tokens

**Files:**
- Modify: `yourstory/src/app/shared/components/share-dropdown/share-dropdown.component.ts`

- [ ] **Step 1: Replace share-dropdown template color classes**

Replace the template section (lines 31–101) of the `@Component` decorator. The TypeScript logic stays the same — only the template string changes:

```typescript
  template: `
    <div class="relative">
      <!-- Trigger button -->
      <button
        (click)="toggle($event)"
        class="flex items-center gap-2 bg-cui-base-2 hover:bg-cui-subtle text-cui-primary text-sm font-medium px-4 py-2 rounded-lg border border-cui-neutral transition-colors cursor-pointer"
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
          class="fixed bottom-4 left-4 right-4 w-auto sm:absolute sm:bottom-full sm:mb-2 sm:left-auto sm:right-0 sm:w-64 rounded-xl border border-cui-neutral bg-cui-base-2 shadow-xl z-50 overflow-hidden"
          role="menu"
        >
          <!-- Clipboard hint -->
          <div class="px-4 py-2.5 bg-cui-accent-subtle border-b border-cui-neutral flex items-start gap-2">
            <span class="text-sm leading-none mt-0.5" aria-hidden="true">📋</span>
            <p class="text-xs text-cui-secondary leading-snug">
              Your image will be <strong class="text-cui-primary">copied to clipboard</strong> — paste it into your post after opening the platform.
            </p>
          </div>

          @for (platform of platforms; track platform.id) {
            <button
              (click)="select(platform.id)"
              class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-cui-secondary hover:bg-cui-subtle transition-colors text-left cursor-pointer"
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

          @if (shareUrl) {
            <div class="border-t border-cui-neutral">
              <button
                (click)="copyLink()"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-cui-secondary hover:bg-cui-subtle transition-colors text-left cursor-pointer"
                role="menuitem"
              >
                <span class="text-base leading-none w-4 text-center" aria-hidden="true">{{ linkCopied() ? '✅' : '🔗' }}</span>
                <span>{{ linkCopied() ? 'Link Copied!' : 'Copy Share Link' }}</span>
              </button>
            </div>
          }
        </div>
      }
    </div>
  `,
```

- [ ] **Step 2: Commit**

```bash
git add yourstory/src/app/shared/components/share-dropdown/share-dropdown.component.ts
git commit -m "feat: update share-dropdown with carrot-ui tokens"
```

---

### Task 6: Update dashboard component — template token replacement

**Files:**
- Modify: `yourstory/src/app/pages/dashboard/dashboard.component.ts`

This is the largest change. The template is ~830 lines with repeated patterns. Apply the following replacements systematically throughout the template (lines 23–837):

- [ ] **Step 1: Replace all common color patterns in the dashboard template**

Apply these search-and-replace operations across the template string. Each pair shows old → new:

**Page container (line 24):**
```text
Old: class="min-h-screen bg-coderabbit-cream dark:bg-coderabbit-neutral text-gray-900 dark:text-white p-6"
New: class="min-h-screen bg-cui-base-1 text-cui-primary p-6"
```

**Toast notification (line 29):**
```text
Old: class="fixed bottom-5 right-5 z-50 flex items-center gap-3 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium px-5 py-3 rounded-xl shadow-2xl border border-gray-700 dark:border-gray-300 animate-fade-in"
New: class="fixed bottom-5 right-5 z-50 flex items-center gap-3 bg-cui-inverse text-cui-inverse text-sm font-medium px-5 py-3 rounded-xl shadow-2xl border border-cui-neutral animate-fade-in"
```

**Subtitle text (lines 41–43):**
```text
Old: class="text-gray-600 dark:text-gray-400 mb-8"
New: class="text-cui-secondary mb-8"
```

**Tab group container (line 45):**
```text
Old: class="inline-flex bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-800 rounded-lg p-1 mb-8"
New: class="inline-flex bg-cui-base-2 border border-cui-neutral rounded-lg p-1 mb-8"
```

**Tab buttons — active state (lines 48–51, 57–60, 67–70):**
```text
Old: [class.bg-coderabbit-orange]="viewMode() === '...'"
     [class.text-white]="viewMode() === '...'"
     [class.text-gray-600]="viewMode() !== '...'"
     [class.dark:text-gray-300]="viewMode() !== '...'"
New: [class.bg-cui-accent]="viewMode() === '...'"
     [class.text-cui-accent-on]="viewMode() === '...'"
     [class.text-cui-secondary]="viewMode() !== '...'"
```

(Remove the `[class.dark:text-gray-300]` lines entirely — the semantic token handles it.)

**Text inputs (lines 82, 333–334, 673–674):**
```text
Old: class="flex-1 min-w-[180px] bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-coderabbit-orange placeholder-gray-400 dark:placeholder-gray-500"
New: class="flex-1 min-w-[180px] bg-cui-base-2 text-cui-primary border border-cui-neutral rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cui-focus placeholder-cui-tertiary"
```

**Select inputs (lines 96–98, 111–113):**
```text
Old: class="bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-coderabbit-orange"
New: class="bg-cui-base-2 text-cui-primary border border-cui-neutral rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cui-focus"
```

**Labels (lines 94, 109):**
```text
Old: class="text-xs text-gray-600 dark:text-gray-400"
New: class="text-xs text-cui-secondary"
```

**Primary action buttons (lines 123–126, 345–348, 685–688):**
```text
Old: class="flex items-center gap-2 bg-coderabbit-orange hover:bg-coderabbit-orange/80 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
New: class="flex items-center gap-2 bg-cui-accent hover:bg-cui-accent-strong disabled:opacity-50 disabled:cursor-not-allowed text-cui-accent-on text-sm font-medium px-4 py-2 rounded-lg transition-colors"
```

**Spinner border on primary buttons (lines 129, 351, 660, 691):**
```text
Old: class="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"
New: class="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-cui-accent-on"
```

**Error text (lines 137, 358–359, 698–699):**
```text
Old: class="mb-4 text-sm text-red-600 dark:text-red-400"
New: class="mb-4 text-sm text-cui-danger"
```

**User profile row (lines 140, 362, 702):**
```text
Old: class="mb-6 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
New: class="mb-6 flex items-center gap-2 text-sm text-cui-secondary"
```

**Profile avatar border (lines 141, 363, 703):**
```text
Old: class="w-6 h-6 rounded-full border border-gray-300 dark:border-gray-600"
New: class="w-6 h-6 rounded-full border border-cui-neutral"
```

**Profile name (lines 142, 364, 704):**
```text
Old: class="font-medium text-gray-900 dark:text-white"
New: class="font-medium text-cui-primary"
```

**Profile link (lines 144, 366, 706):**
```text
Old: class="text-coderabbit-orange hover:underline"
New: class="text-cui-accent hover:underline"
```

**Cards — white backgrounds (lines 149, 376, 716):**
```text
Old: class="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-lg mb-4"
     (or with "... border border-gray-200 dark:border-gray-800")
New: class="bg-cui-base-2 rounded-2xl p-6 shadow-lg mb-4"
     (or with "... border border-cui-neutral")
```

**Stat tiles (lines 156–193 — repeated pattern):**
```text
Old: class="bg-gray-100 dark:bg-gray-800 rounded-xl p-4 text-center"
New: class="bg-cui-neutral-subtle rounded-xl p-4 text-center"
```

**Stat tile values:**
```text
Old: class="text-3xl font-bold text-gray-900 dark:text-white"
New: class="text-3xl font-bold text-cui-primary"
```

**Stat tile labels:**
```text
Old: class="text-xs text-gray-500 dark:text-gray-400 mt-1"
New: class="text-xs text-cui-secondary mt-1"
```

**Accent-colored stat values (lines 184, 190):**
```text
Old: class="text-3xl font-bold text-coderabbit-orange"
New: class="text-3xl font-bold text-cui-accent"
```

**Accent border on stat tile (line 189):**
```text
Old: class="bg-gray-100 dark:bg-gray-800 border border-coderabbit-orange/40 rounded-xl p-4 text-center"
New: class="bg-cui-neutral-subtle border border-cui-accent/40 rounded-xl p-4 text-center"
```

**Dividers (line 197):**
```text
Old: class="border-t border-gray-200 dark:border-gray-800 pt-5"
New: class="border-t border-cui-neutral pt-5"
```

**Genre badge (line 199):**
```text
Old: class="bg-coderabbit-orange text-white text-xs font-semibold px-2.5 py-0.5 rounded-full"
New: class="bg-cui-accent text-cui-accent-on text-xs font-semibold px-2.5 py-0.5 rounded-full"
```

**Subtitle text variants (line 202):**
```text
Old: class="text-gray-500 dark:text-gray-500 text-xs"
New: class="text-cui-tertiary text-xs"
```

**Image placeholder (line 207):**
```text
Old: class="mb-4 h-52 w-full animate-pulse rounded-xl bg-gray-200 dark:bg-gray-800 border border-gray-300 dark:border-gray-700"
New: class="mb-4 h-52 w-full animate-pulse rounded-xl bg-cui-neutral-subtle border border-cui-neutral"
```

**Image border (line 213):**
```text
Old: class="mb-4 w-full h-auto object-contain rounded-xl border border-gray-200 dark:border-gray-700"
New: class="mb-4 w-full h-auto object-contain rounded-xl border border-cui-neutral"
```

**Story title (line 218):**
```text
Old: class="text-2xl font-bold text-gray-900 dark:text-white mb-3"
New: class="text-2xl font-bold text-cui-primary mb-3"
```

**Story body text (line 219):**
```text
Old: class="text-gray-700 dark:text-gray-300 text-sm leading-relaxed whitespace-pre-line"
New: class="text-cui-secondary text-sm leading-relaxed whitespace-pre-line"
```

**"Produced by CodeRabbit" (line 220):**
```text
Old: class="text-gray-500 dark:text-gray-500 text-xs mt-4"
New: class="text-cui-tertiary text-xs mt-4"
```

**Cache banner (line 227):**
```text
Old: class="mb-3 flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-50 dark:bg-amber-900/20 px-4 py-2 text-sm text-amber-700 dark:text-amber-300"
New: class="mb-3 flex items-center gap-2 rounded-lg border border-cui-warn bg-cui-warn-subtle px-4 py-2 text-sm text-cui-warn"
```

**Secondary action buttons (lines 239, 247, 655, 730):**
```text
Old: class="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 ... text-gray-900 dark:text-white text-sm font-medium px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 transition-colors"
New: class="flex items-center gap-2 bg-cui-base-2 hover:bg-cui-subtle ... text-cui-primary text-sm font-medium px-4 py-2 rounded-lg border border-cui-neutral transition-colors"
```

**Recent stories header (lines 267, 280):**
```text
Old: class="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-300"
New: class="text-lg font-semibold mb-4 text-cui-secondary"
```

**Skeleton loading cards (line 270):**
```text
Old: class="bg-white dark:bg-gray-900 rounded-xl p-5 shadow border border-gray-200 dark:border-gray-800 animate-pulse"
New: class="bg-cui-base-2 rounded-xl p-5 shadow border border-cui-neutral animate-pulse"
```

**Skeleton bars (lines 271–273):**
```text
Old: class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-3"
New: class="h-4 bg-cui-neutral-subtle rounded w-3/4 mb-3"
```

(Apply similar for the other skeleton bars.)

**Story card links (line 287):**
```text
Old: class="bg-white dark:bg-gray-900 rounded-xl p-5 shadow border border-gray-200 dark:border-gray-800 hover:border-coderabbit-orange/50 hover:shadow-md transition-all group block"
New: class="bg-cui-base-2 rounded-xl p-5 shadow border border-cui-neutral hover:border-cui-accent/50 hover:shadow-md transition-all group block"
```

**Story card genre badge (line 298):**
```text
Old: class="bg-coderabbit-orange/10 text-coderabbit-orange text-xs font-semibold px-2 py-0.5 rounded-full"
New: class="bg-cui-accent-subtle text-cui-accent text-xs font-semibold px-2 py-0.5 rounded-full"
```

**Story card username (line 299):**
```text
Old: class="text-xs text-gray-400 dark:text-gray-500"
New: class="text-xs text-cui-tertiary"
```

**Story card title (line 301):**
```text
Old: class="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-coderabbit-orange transition-colors line-clamp-2"
New: class="text-sm font-semibold text-cui-primary group-hover:text-cui-accent transition-colors line-clamp-2"
```

**Story card description (line 302):**
```text
Old: class="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2"
New: class="text-xs text-cui-secondary mt-1 line-clamp-2"
```

**Load More button (line 311):**
```text
Old: class="px-6 py-2.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-coderabbit-orange/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
New: class="px-6 py-2.5 text-sm font-medium rounded-lg border border-cui-neutral text-cui-secondary bg-cui-base-2 hover:bg-cui-subtle hover:border-cui-accent/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
```

**Error panels (lines 370, 710):**
```text
Old: class="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200"
New: class="mb-4 rounded-lg border border-cui-danger bg-cui-danger-subtle px-4 py-3 text-sm text-cui-danger"
```

**Timeline header gradient icon (line 380):**
```text
Old: class="w-10 h-10 rounded-xl bg-gradient-to-br from-coderabbit-orange to-amber-500 flex items-center justify-center shadow-md"
New: class="w-10 h-10 rounded-xl bg-cui-accent flex items-center justify-center shadow-md"
```

**Timeline header icon text (line 381):**
```text
Old: class="text-white text-lg"
New: class="text-cui-accent-on text-lg"
```

**Timeline section headers (lines 384, 385, 723, 724):**
```text
Old: class="text-xl font-bold text-gray-900 dark:text-white"
New: class="text-xl font-bold text-cui-primary"
```

```text
Old: class="text-xs text-gray-500 dark:text-gray-400"
New: class="text-xs text-cui-secondary"
```

**Filter label (line 395):**
```text
Old: class="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500"
New: class="text-xs font-semibold uppercase tracking-wider text-cui-tertiary"
```

**Filter "All" link (line 398):**
```text
Old: class="text-xs font-medium text-coderabbit-orange hover:text-coderabbit-orange/70 transition-colors"
New: class="text-xs font-medium text-cui-accent hover:text-cui-accent/70 transition-colors"
```

**Filter "None" link (line 402):**
```text
Old: class="text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
New: class="text-xs font-medium text-cui-tertiary hover:text-cui-secondary transition-colors"
```

**Timeline stats row (lines 483–503):**
```text
Old: class="relative overflow-hidden bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 text-center border border-gray-100 dark:border-gray-800"
New: class="relative overflow-hidden bg-cui-neutral-subtle rounded-xl p-4 text-center border border-cui-neutral"
```

```text
Old: class="text-2xl font-bold text-gray-900 dark:text-white mt-1"
New: class="text-2xl font-bold text-cui-primary mt-1"
```

```text
Old: class="text-xs font-medium text-gray-500 dark:text-gray-400 mt-0.5"
New: class="text-xs font-medium text-cui-secondary mt-0.5"
```

**Timeline spine line (line 510):**
```text
Old: class="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-600 to-transparent"
New: class="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-gradient-to-r from-transparent via-cui-neutral to-transparent"
```

**Timeline year badge (line 521):**
```text
Old: class="text-[10px] font-bold uppercase tracking-widest text-white bg-gray-400 dark:bg-gray-600 px-2.5 py-1 rounded-full shadow-sm whitespace-nowrap"
New: class="text-[10px] font-bold uppercase tracking-widest text-cui-inverse bg-cui-inverse px-2.5 py-1 rounded-full shadow-sm whitespace-nowrap"
```

Note: This is a special case where we want contrasting text on a contrasting background. Use the inverse tokens.

**Timeline connectors (lines 529, 533):**
```text
Old: class="absolute top-1/2 ... bg-gray-200 dark:bg-gray-700"
New: class="absolute top-1/2 ... bg-cui-neutral"
```

**Timeline spine dot (line 537):**
```text
Old: class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600 z-10"
New: class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-cui-neutral z-10"
```

**Timeline node ring (line 555):**
```text
Old: ring-4 ring-white dark:ring-gray-900
New: ring-4 ring-cui-base-1
```

**Expanded milestone ring accent (line 556):**
```text
Old: ring-coderabbit-orange/40
New: ring-cui-accent/40
```

**Timeline node label (line 562):**
```text
Old: class="text-[10px] font-semibold text-gray-600 dark:text-gray-400 mt-1.5 text-center leading-tight max-w-[90px] line-clamp-2"
New: class="text-[10px] font-semibold text-cui-secondary mt-1.5 text-center leading-tight max-w-[90px] line-clamp-2"
```

**Scroll hint (lines 573–577):**
```text
Old: class="flex items-center justify-center gap-2 mt-2 text-xs text-gray-400 dark:text-gray-500"
New: class="flex items-center justify-center gap-2 mt-2 text-xs text-cui-tertiary"
```

**Milestone detail title (line 595):**
```text
Old: class="text-base font-bold text-gray-900 dark:text-white"
New: class="text-base font-bold text-cui-primary"
```

**Milestone detail description (line 603):**
```text
Old: class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mt-2"
New: class="text-sm text-cui-secondary leading-relaxed mt-2"
```

**Milestone date text (line 605):**
```text
Old: class="text-xs text-gray-400 dark:text-gray-500 font-mono"
New: class="text-xs text-cui-tertiary font-mono"
```

**Milestone "View on GitHub" link (line 613):**
```text
Old: class="inline-flex items-center gap-1 text-xs font-medium text-coderabbit-orange hover:text-coderabbit-orange/70 transition-colors"
New: class="inline-flex items-center gap-1 text-xs font-medium text-cui-accent hover:text-cui-accent/70 transition-colors"
```

**Milestone close button (line 621):**
```text
Old: class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors text-lg leading-none p-1"
New: class="text-cui-tertiary hover:text-cui-secondary transition-colors text-lg leading-none p-1"
```

**No events text (line 631):**
```text
Old: class="text-sm text-gray-400 dark:text-gray-500"
New: class="text-sm text-cui-tertiary"
```

**"Show all events" link (line 633):**
```text
Old: class="mt-2 text-xs text-coderabbit-orange hover:text-coderabbit-orange/70 transition-colors"
New: class="mt-2 text-xs text-cui-accent hover:text-cui-accent/70 transition-colors"
```

**Empty state text (lines 639, 644, 817, 822–823):**
```text
Old: class="py-12 text-center text-gray-500 dark:text-gray-400"
     or: class="py-12 text-center text-gray-400 dark:text-gray-500"
New: class="py-12 text-center text-cui-tertiary"
```

**Font mono watermarks (lines 388, 828–829):**
```text
Old: class="text-xs text-gray-400 dark:text-gray-600 font-mono"
New: class="text-xs text-cui-tertiary font-mono"
```

**Insights repo cards (line 768):**
```text
Old: class="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/30 p-4"
New: class="rounded-xl border border-cui-neutral bg-cui-neutral-subtle p-4"
```

**Insights repo name link (line 779):**
```text
Old: class="text-sm md:text-base font-semibold text-gray-900 dark:text-white hover:text-coderabbit-orange transition-colors truncate block"
New: class="text-sm md:text-base font-semibold text-cui-primary hover:text-cui-accent transition-colors truncate block"
```

**Insights repo metadata (line 784):**
```text
Old: class="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
New: class="mt-1 flex items-center gap-2 text-xs text-cui-secondary"
```

**Insights star badge — keep amber since it's a category-specific highlight:**
```
(no change needed — amber is a category color)
```

**Insights accordion chevron (lines 792–793):**
```text
Old: class="text-gray-400 dark:text-gray-500 transition-transform"
New: class="text-cui-tertiary transition-transform"
```

**Insights yearly breakdown (line 798):**
```text
Old: class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2"
New: class="mt-3 pt-3 border-t border-cui-neutral space-y-2"
```

**Insights year cards (line 800):**
```text
Old: class="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/50 px-3 py-2"
New: class="rounded-lg border border-cui-neutral bg-cui-base-2 px-3 py-2"
```

**Insights year title (line 802):**
```text
Old: class="text-sm font-semibold text-gray-800 dark:text-gray-100"
New: class="text-sm font-semibold text-cui-primary"
```

**Insights year total (line 803):**
```text
Old: class="text-xs text-gray-500 dark:text-gray-400"
New: class="text-xs text-cui-secondary"
```

**Insights year breakdown grid (line 805):**
```text
Old: class="mt-1 grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300"
New: class="mt-1 grid grid-cols-2 gap-2 text-xs text-cui-secondary"
```

**Loading spinner border-t accent (lines 475, 747):**
```text
Old: class="animate-spin rounded-full h-10 w-10 border-4 border-gray-200 dark:border-gray-700 border-t-coderabbit-orange"
New: class="animate-spin rounded-full h-10 w-10 border-4 border-cui-neutral border-t-cui-accent"
```

**Loading text (lines 477, 749):**
```text
Old: class="text-sm text-gray-500 dark:text-gray-400"
New: class="text-sm text-cui-secondary"
```

- [ ] **Step 2: Update milestone utility method defaults**

In the `getMilestoneNodeClasses` default case (line 1303):
```text
Old: return 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300';
New: return 'bg-cui-neutral text-cui-secondary';
```

In the `getMilestoneCardClasses` default case (line 1321):
```text
Old: return 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700';
New: return 'bg-cui-neutral-subtle border-cui-neutral';
```

In the `getMilestoneAccentClasses`, replace only the `coderabbit-orange` case (line 1328):
```text
Old: return 'bg-coderabbit-orange';
New: return 'bg-cui-accent';
```

The `getMilestoneAccentClasses` default (line 1339):
```text
Old: return 'bg-gray-400';
New: return 'bg-cui-neutral';
```

In `getMilestoneBadgeClasses` default (line 1350):
```text
Old: return 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300';
New: return 'bg-cui-neutral-subtle text-cui-secondary';
```

- [ ] **Step 3: Update share handler background colors**

Replace the hardcoded hex values in the three share handlers (lines 852, 862, 872):

```typescript
  readonly storyShareHandler = async (platform: SharePlatform): Promise<void> => {
    if (!this.shareCard) return;
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--background-color-cui-base-1').trim();
    const result = await this.shareService.shareWithImage(
      this.shareCard.nativeElement, platform, 'story', this.selectedGenre(), bg,
      this.generatedStory()?.shareUrl,
    );
    this.showShareToast(result);
  };

  readonly timelineShareHandler = async (platform: SharePlatform): Promise<void> => {
    if (!this.timelineCard) return;
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--background-color-cui-base-1').trim();
    const result = await this.shareService.shareWithImage(
      this.timelineCard.nativeElement, platform, 'timeline', undefined, bg,
    );
    this.showShareToast(result);
  };

  readonly insightsShareHandler = async (platform: SharePlatform): Promise<void> => {
    if (!this.insightsShareCard) return;
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--background-color-cui-base-1').trim();
    const result = await this.shareService.shareWithImage(
      this.insightsShareCard.nativeElement, platform, 'insights', undefined, bg,
    );
    this.showShareToast(result);
  };
```

Also update `downloadAsImage` (around line 1379) and similar download methods — find any occurrences of `'#171717'` or `'#F6F6F1'`:

```typescript
  const backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--background-color-cui-base-1').trim();
```

- [ ] **Step 4: Commit**

```bash
git add yourstory/src/app/pages/dashboard/dashboard.component.ts
git commit -m "feat: replace all dashboard colors with carrot-ui semantic tokens"
```

---

### Task 7: Build and test

**Files:** None (validation only)

- [ ] **Step 1: Run the build**

```bash
npx nx build yourstory
```

Expected: BUILD SUCCESS. If there are Tailwind class resolution errors, check for typos in `cui-*` token names.

- [ ] **Step 2: Run unit tests**

```bash
npx nx test yourstory
```

Expected: All tests pass.

- [ ] **Step 3: Fix any issues found**

If build or tests fail, review error messages and fix. Common issues:
- Missing `@tailwindcss/vite` import in vite config
- CSS import path issues for carrot-ui files
- Tailwind v4 not recognizing `cui-*` classes (check that scales.css and theme.css are imported before they're referenced)

- [ ] **Step 4: Final commit (if any fixes applied)**

```bash
git add -A
git commit -m "fix: resolve build issues from carrot-ui migration"
```

# Carrot UI Design Token Integration

**Date:** 2026-07-22
**Status:** Approved

## Summary

Integrate CodeRabbit's carrot-ui design system into the CommitStory Angular app by importing its CSS design tokens (color scales, semantic tokens, typography, shadows, animations) and migrating from Tailwind CSS v3 to v4. This replaces all hardcoded color values with carrot-ui's semantic token layer, gaining automatic light/dark mode support and visual alignment with the CodeRabbit brand.

## Goals

1. Replace all ad-hoc color values with carrot-ui semantic tokens (`bg-cui-base-1`, `text-cui-primary`, etc.)
2. Migrate from Tailwind CSS v3 to v4 (CSS-first configuration)
3. Switch dark mode from `html.dark` class to `data-theme="dark"` attribute
4. Adopt Geist (sans) and Hack (mono) fonts from carrot-ui
5. Eliminate most `dark:` variant classes by using auto-adaptive semantic tokens

## Non-Goals

- Using carrot-ui's React components (incompatible with Angular)
- Redesigning the app's layout or feature set
- Adding new pages or functionality

## Approach

**Direct CSS import from the `@coderabbitai/carrot-ui` npm package.** Import `scales.css` and `theme.css` from the package's `src/` directory. This keeps tokens in sync with upstream updates and avoids vendoring.

## Architecture

### CSS Layer Stack

```
styles.css
├── @import "tailwindcss"
├── @import "@coderabbitai/carrot-ui/src/scales.css"   (12-step color scales)
├── @import "@coderabbitai/carrot-ui/src/theme.css"    (semantic tokens + keyframes)
├── @custom-variant dark (...)                          (data-theme dark mode)
├── @theme { ... }                                     (app-specific overrides)
└── App-specific utilities (scrollbar, line-clamp)
```

### Tailwind v3 → v4 Migration

| Tailwind v3 | Tailwind v4 |
|---|---|
| `tailwind.config.js` (JS module) | Removed — configuration via CSS `@theme` blocks |
| `@tailwind base/components/utilities` | `@import "tailwindcss"` |
| `darkMode: 'class'` | `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *))` |
| `theme.extend.colors` in JS | Colors defined via CSS custom properties in scales.css/theme.css |
| `theme.extend.animation` in JS | `@theme` block in styles.css for app-specific animations |

### Token Mapping

| Current Usage | Carrot UI Replacement | Notes |
|---|---|---|
| `bg-coderabbit-cream` | `bg-cui-base-1` | Main content background |
| `bg-coderabbit-neutral` (dark) | Auto via `bg-cui-base-1` | Semantic token auto-adapts |
| `text-gray-900` / `text-white` | `text-cui-primary` | High-contrast text |
| `text-gray-600` / `text-gray-400` | `text-cui-secondary` | Low-contrast text |
| `bg-coderabbit-orange` | `bg-cui-accent` | Brand accent (#FF570A) |
| `text-white` on orange buttons | `text-cui-accent-on` | Contrast text on accent bg |
| `border-gray-200` / `border-gray-800` | `border-cui-neutral` | Default borders |
| `bg-gray-100` / `bg-gray-800` | `bg-cui-base-2` | Elevated surfaces |
| `bg-gray-900 dark:bg-gray-100` (toast) | `bg-cui-inverse` | Inverse contrast |
| `text-white dark:text-gray-900` (toast) | `text-cui-inverse` | Inverse text |
| `hover:bg-gray-200 dark:hover:bg-gray-700` | `hover:bg-cui-subtle` | Semi-transparent hover overlay |
| `border-gray-300 dark:border-gray-800` | `border-cui-neutral-strong` | Stronger borders |

### Dark Mode

- **Before:** `ThemeService` toggles `html.dark` class; components use `dark:` Tailwind variants
- **After:** `ThemeService` sets `data-theme="dark"` or `data-theme="light"` on `<html>`; carrot-ui CSS variables auto-switch via `[data-theme="dark"]` selectors; most `dark:` prefixes removed

### Typography

- Install `@fontsource-variable/geist` and `hack-font` as dependencies
- Body text uses `font-cui-sans` (Geist Variable) at `text-cui-base` (14px/20px)
- Code/mono text uses `font-cui-mono` (Hack)
- Four size levels: `text-cui-sm` (12px), `text-cui-base` (14px), `text-cui-lg` (18px), `text-cui-xl` (24px)

### Custom Animations (preserved)

These app-specific animations move from `tailwind.config.js` to a `@theme` block in `styles.css`:
- `blob` — background blob movement
- `fade-in` / `fade-in-slow` / `fade-in-slower` — staggered fade-in
- `glow-pulse` — subtle pulsing glow
- `gradient-shift` — animated gradient background

### Scrollbar Styling

Timeline scrollbar colors update from `theme('colors.gray.300')` to `var(--border-color-cui-neutral)` and dark-mode variant uses `var(--border-color-cui-neutral-strong)`.

## Files Changed

| File | Change |
|---|---|
| `package.json` | Add `@fontsource-variable/geist`, `hack-font`; `@coderabbitai/carrot-ui` already installed |
| `yourstory/tailwind.config.js` | Delete |
| `yourstory/src/styles.css` | Rewrite: TW v4 imports + carrot-ui tokens + custom animations |
| `yourstory/src/app/core/services/theme.service.ts` | Switch from class toggle to `data-theme` attribute |
| `yourstory/src/app/layout/header.component.ts` | Replace color classes with cui tokens |
| `yourstory/src/app/pages/dashboard/dashboard.component.ts` | Replace all color classes with cui tokens |
| `yourstory/src/app/shared/components/share-dropdown/share-dropdown.component.ts` | Update color classes |

## Testing

- Build passes (`nx build yourstory`)
- Existing unit tests pass (`nx test yourstory`)
- Visual verification: light and dark modes render correctly with new tokens

## Vite Configuration

The Tailwind v4 Vite plugin (`@tailwindcss/vite`) must be added to `yourstory/vite.config.mts`. This replaces the PostCSS-based Tailwind processing used in v3. The `tailwindcss` and `autoprefixer` PostCSS plugins are no longer needed.

## Risks

- **Tailwind v4 compatibility with Angular**: Angular 21 + Vite should work with TW v4 since it uses the Vite plugin approach. The `@tailwindcss/vite` plugin replaces PostCSS-based processing.
- **carrot-ui upstream changes**: Color token names could change in future versions. Semantic token names (`cui-base-1`, `cui-primary`) are stable by design.

# Move Handle Input Into Tabs

## Problem

The GitHub handle input is a separate top-level search bar. Users must search first, then interact with tabs. We want each tab to own its input flow.

## Solution

Remove the top-level search bar and landing page. Show tabs immediately. Each tab has an inline handle input alongside its controls, sharing one `usernameInput` signal.

### Generate Story tab

```text
[GitHub handle input] [Genre ▾] [Language ▾] [✨ Generate Story]
```

### Timeline tab

```text
[GitHub handle input] [🔍 View Timeline]
```

### Insights tab

```text
[GitHub handle input] [🔍 View Insights]
```

## Behavior

- Tabs visible on page load — no landing page
- One shared `usernameInput` signal pre-fills across tabs
- User profile (avatar, name, link) appears below controls after search
- Entering a handle in any tab and clicking the action button triggers `onSearchUser()` then the tab-specific action
- Data resets when switching users (existing behavior preserved)
- The `@if (!currentUsername())` guard around tab content is removed — tabs always show their input row; content below only appears after data loads

## Files Changed

- `yourstory/src/app/pages/dashboard/dashboard.component.ts` — template-only changes

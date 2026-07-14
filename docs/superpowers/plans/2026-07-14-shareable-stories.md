# Shareable Stories (KV + R2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist generated stories in Cloudflare KV and images in R2, then serve shareable pages with OG meta tags at `/story/{handle}/{genre}`.

**Architecture:** The existing `handleGenerateStory` and `handleGenerateStoryImage` functions in `server.ts` are modified to write-through to KV/R2 after generation. Two new route handlers serve the public share page and image. The share page is server-rendered HTML with Open Graph tags for social previews.

**Tech Stack:** Cloudflare Workers KV, Cloudflare R2, Wrangler CLI

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `wrangler.toml` | Modify | Add KV namespace and R2 bucket bindings |
| `yourstory/src/server.ts` | Modify | Add `STORY_KV`/`STORY_IMAGES` to `Env`, modify generate handlers, add share page + image handlers, add routing |

---

### Task 1: Add KV and R2 bindings to wrangler.toml and Env interface

**Files:**
- Modify: `wrangler.toml:1-24`
- Modify: `yourstory/src/server.ts:18-29`

- [ ] **Step 1: Add KV and R2 config to wrangler.toml**

Add the following after the `[assets]` block (after line 14) in `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "STORY_KV"
id = "PLACEHOLDER_KV_ID"

[[r2_buckets]]
binding = "STORY_IMAGES"
bucket_name = "commitstory-images"
```

Note: The KV `id` is a placeholder. The actual ID will be created with `wrangler kv namespace create STORY_KV` and pasted in. For local dev, wrangler automatically creates a local namespace.

- [ ] **Step 2: Add bindings to the Env interface**

In `yourstory/src/server.ts`, add `STORY_KV` and `STORY_IMAGES` to the `Env` interface (after line 28, before the closing `}`):

```typescript
interface Env {
  SESSION_SECRET: string;
  GOOGLE_AI_API_KEY: string;
  ENABLE_STORY_IMAGE_GENERATION?: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_CALLBACK_URL: string;
  /** Personal Access Token used for server-side GitHub API requests */
  GITHUB_TOKEN?: string;
  /** Bound asset fetcher for static files from dist/yourstory/browser */
  ASSETS: Fetcher;
  /** KV namespace for persisting story text/metadata */
  STORY_KV: KVNamespace;
  /** R2 bucket for persisting generated story images */
  STORY_IMAGES: R2Bucket;
}
```

- [ ] **Step 3: Commit**

```bash
git add wrangler.toml yourstory/src/server.ts
git commit -m "feat: add KV and R2 bindings for shareable stories"
```

---

### Task 2: Persist story text to KV on generation

**Files:**
- Modify: `yourstory/src/server.ts:1095-1112` (inside `handleGenerateStory`)

- [ ] **Step 1: Add KV write after story generation**

In `handleGenerateStory`, after `parsedStory` is computed (line 1100) and before the `return json(...)` (line 1102), add a non-blocking KV write using `ctx.waitUntil`. But since `handleGenerateStory` doesn't receive `ctx`, we need to pass `env` only — use a fire-and-forget approach via `env.STORY_KV.put(...)` wrapped in a try/catch so failures don't block the response.

Replace lines 1102-1108 with:

```typescript
    // Persist story to KV for shareable URLs (fire-and-forget, don't block response)
    const storyKey = `${username}:${genre}`;
    const storyData = JSON.stringify({
      title: parsedTitle,
      story: parsedStory,
      genre,
      username,
      updatedAt: new Date().toISOString(),
    });
    env.STORY_KV.put(storyKey, storyData).catch((err) =>
      console.error('Failed to persist story to KV:', err)
    );

    return json({
      title: parsedTitle,
      story: parsedStory,
      genre,
      label: 'Career Summary',
      imageGenerationEnabled: isStoryImageGenerationEnabled(env),
    });
```

- [ ] **Step 2: Verify the build passes**

Run: `npx nx build yourstory`
Expected: Build succeeds with no type errors

- [ ] **Step 3: Commit**

```bash
git add yourstory/src/server.ts
git commit -m "feat: persist generated stories to KV"
```

---

### Task 3: Persist story images to R2 on generation

**Files:**
- Modify: `yourstory/src/server.ts:1185-1194` (inside `handleGenerateStoryImage`)

- [ ] **Step 1: Add R2 write and separate KV imageKey entry after image generation**

In `handleGenerateStoryImage`, after `imageData` is extracted, add R2 upload and write the image key as a **separate KV entry** (`${username}:${genre}:imageKey`) instead of doing a read-modify-write on the story entry. This avoids a race condition where the image upload's KV read could execute before the story generation's KV write has completed, silently losing the imageKey.

```typescript
    // Decode base64 image and persist to R2 (fire-and-forget)
    const imageKey = `images/${username.toLowerCase()}/${(genre as string).toLowerCase()}.png`;
    try {
      const binaryString = atob(imageData.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      env.STORY_IMAGES.put(imageKey, bytes.buffer, {
        httpMetadata: { contentType: imageData.mimeType || 'image/png' },
      }).catch((err) => console.error('Failed to persist image to R2:', err));

      // Store imageKey separately to avoid read-modify-write race with story generation
      const imageMetaKey = `${username}:${genre}:imageKey`;
      env.STORY_KV.put(imageMetaKey, imageKey).catch((err) =>
        console.error('Failed to write imageKey to KV:', err)
      );
    } catch (err) {
      console.error('Failed to decode/upload image to R2:', err);
    }

    return json({ imageUrl: `data:${imageData.mimeType};base64,${imageData.data}` });
```

- [ ] **Step 2: Verify the build passes**

Run: `npx nx build yourstory`
Expected: Build succeeds with no type errors

- [ ] **Step 3: Commit**

```bash
git add yourstory/src/server.ts
git commit -m "feat: persist generated images to R2 and update KV"
```

---

### Task 4: Add image serving endpoint

**Files:**
- Modify: `yourstory/src/server.ts` (add handler function before the Workers Entry Point section at line 1197, and add route in the fetch handler)

- [ ] **Step 1: Add the image handler function**

Insert before the `// ─── Workers Entry Point` comment (line 1197):

```typescript
/**
 * GET /api/stories/image/{handle}/{genre}
 * Serves a story image from R2.
 */
async function handleServeStoryImage(
  handle: string,
  genre: string,
  env: Env,
): Promise<Response> {
  const imageKey = `images/${handle.toLowerCase()}/${genre.toLowerCase()}.png`;
  const object = await env.STORY_IMAGES.get(imageKey);

  if (!object) {
    return new Response('Image not found', { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'image/png',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
```

- [ ] **Step 2: Add route for the image endpoint**

In the fetch handler routing section, add a new route **before** the `else` block (before line 1248). Add it after the `generate-image` route:

```typescript
    } else if (path.startsWith('/api/stories/image/') && method === 'GET') {
      const segments = path.split('/');
      // /api/stories/image/{handle}/{genre} → segments: ['', 'api', 'stories', 'image', handle, genre]
      const handle = segments[4];
      const genre = segments[5];
      if (handle && genre) {
        response = await handleServeStoryImage(handle, genre, env);
      } else {
        response = new Response('Not found', { status: 404 });
      }
```

- [ ] **Step 3: Verify the build passes**

Run: `npx nx build yourstory`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add yourstory/src/server.ts
git commit -m "feat: add GET /api/stories/image/:handle/:genre endpoint"
```

---

### Task 5: Add shareable story page with OG tags

**Files:**
- Modify: `yourstory/src/server.ts` (add handler function and route)

- [ ] **Step 1: Add the share page handler function**

Insert before the `// ─── Workers Entry Point` comment:

```typescript
/**
 * GET /story/{handle}/{genre}
 * Server-rendered HTML share page with Open Graph meta tags.
 */
async function handleSharePage(
  handle: string,
  genre: string,
  env: Env,
  requestUrl: string,
): Promise<Response> {
  const storyKey = `${handle}:${genre}`;
  const raw = await env.STORY_KV.get(storyKey);

  if (!raw) {
    return new Response(
      `<!DOCTYPE html><html><head><title>Story Not Found</title></head>` +
      `<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#1a1a2e;color:#fff;">` +
      `<div style="text-align:center"><h1>Story Not Found</h1><p>No story found for <strong>${handle}</strong> in the <strong>${genre}</strong> genre.</p>` +
      `<a href="/" style="color:#f97316;text-decoration:underline">Generate your story →</a></div></body></html>`,
      { status: 404, headers: { 'Content-Type': 'text/html;charset=utf-8' } },
    );
  }

  const story = JSON.parse(raw) as {
    title: string;
    story: string;
    genre: string;
    username: string;
    imageKey?: string;
    updatedAt?: string;
  };

  const origin = new URL(requestUrl).origin;
  const pageUrl = `${origin}/story/${handle}/${genre}`;
  const imageUrl = story.imageKey
    ? `${origin}/api/stories/image/${handle}/${genre}`
    : '';
  const description = story.story.slice(0, 200).replace(/\n/g, ' ') + '…';
  const escapedTitle = story.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const escapedDescription = description.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const escapedStory = story.story.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br/>');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapedTitle} — CommitStory</title>
  <meta name="description" content="${escapedDescription}" />

  <!-- Open Graph -->
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapedTitle}" />
  <meta property="og:description" content="${escapedDescription}" />
  <meta property="og:url" content="${pageUrl}" />
  ${imageUrl ? `<meta property="og:image" content="${imageUrl}" />` : ''}

  <!-- Twitter Card -->
  <meta name="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}" />
  <meta name="twitter:title" content="${escapedTitle}" />
  <meta name="twitter:description" content="${escapedDescription}" />
  ${imageUrl ? `<meta name="twitter:image" content="${imageUrl}" />` : ''}

  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #1a1a2e; color: #e0e0e0; min-height: 100vh; }
    .container { max-width: 720px; margin: 0 auto; padding: 2rem 1.5rem; }
    .badge { display: inline-block; background: #f97316; color: #fff; font-size: 0.75rem; font-weight: 600; padding: 0.25rem 0.75rem; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em; }
    h1 { font-size: 2rem; margin: 1rem 0 0.5rem; color: #fff; line-height: 1.3; }
    .meta { color: #9ca3af; font-size: 0.875rem; margin-bottom: 1.5rem; }
    .hero-img { width: 100%; border-radius: 0.75rem; margin-bottom: 1.5rem; }
    .story { font-size: 1.125rem; line-height: 1.8; color: #d1d5db; }
    .cta { display: inline-block; margin-top: 2rem; background: #f97316; color: #fff; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 600; }
    .cta:hover { background: #ea580c; }
  </style>
</head>
<body>
  <div class="container">
    <span class="badge">${story.genre}</span>
    <h1>${escapedTitle}</h1>
    <p class="meta">A story for <strong>${story.username}</strong></p>
    ${imageUrl ? `<img class="hero-img" src="${imageUrl}" alt="${escapedTitle}" />` : ''}
    <div class="story">${escapedStory}</div>
    <a class="cta" href="/">Generate your own story →</a>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html;charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
```

- [ ] **Step 2: Add route for the share page**

In the fetch handler routing section, add a new route **before** the `else` block. Add it after the image endpoint route:

```typescript
    } else if (path.startsWith('/story/') && method === 'GET') {
      const segments = path.split('/');
      // /story/{handle}/{genre} → segments: ['', 'story', handle, genre]
      const handle = segments[2];
      const genre = segments[3];
      if (handle && genre) {
        response = await handleSharePage(handle, genre, env, request.url);
      } else {
        response = new Response('Not found', { status: 404 });
      }
```

- [ ] **Step 3: Verify the build passes**

Run: `npx nx build yourstory`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add yourstory/src/server.ts
git commit -m "feat: add shareable story page with OG meta tags"
```

---

### Task 6: Add shareUrl to story generation response

**Files:**
- Modify: `yourstory/src/server.ts` (in `handleGenerateStory` return value)

- [ ] **Step 1: Add shareUrl to the JSON response**

In `handleGenerateStory`, the `return json(...)` call currently returns `{ title, story, genre, label, imageGenerationEnabled }`. Add a `shareUrl` field so the frontend can display a share link:

Update the return statement to:

```typescript
    return json({
      title: parsedTitle,
      story: parsedStory,
      genre,
      label: 'Career Summary',
      imageGenerationEnabled: isStoryImageGenerationEnabled(env),
      shareUrl: `/story/${username}/${genre}`,
    });
```

- [ ] **Step 2: Verify the build passes**

Run: `npx nx build yourstory`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add yourstory/src/server.ts
git commit -m "feat: include shareUrl in story generation response"
```

---

### Task 7: Final build verification

- [ ] **Step 1: Run full build**

Run: `npx nx build yourstory`
Expected: Build succeeds with no errors

- [ ] **Step 2: Run lint**

Run: `npx nx lint yourstory`
Expected: No lint errors

- [ ] **Step 3: Run tests**

Run: `npx nx test yourstory`
Expected: All existing tests pass

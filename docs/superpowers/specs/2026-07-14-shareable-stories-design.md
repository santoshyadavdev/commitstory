# Shareable Stories via KV + R2

## Problem

Generated stories and images are ephemeral — returned directly to the client with no persistence. Users cannot share their stories on social media because there are no permanent URLs.

## Solution

Persist stories in Cloudflare KV and images in Cloudflare R2. Serve shareable pages at `/story/{handle}/{genre}` with Open Graph meta tags for rich social previews.

## Storage

### KV Namespace: `STORY_KV`

- **Key format:** `{handle}:{genre}` (e.g. `santoshyadavdev:Comedy`)
- **Value:** JSON

```json
{
  "title": "The Comedy of santoshyadavdev",
  "story": "Full story text...",
  "genre": "Comedy",
  "username": "santoshyadavdev",
  "imageKey": "images/santoshyadavdev/comedy.png",
  "updatedAt": "2026-07-14T14:30:00Z"
}
```

### R2 Bucket: `STORY_IMAGES`

- **Key format:** `images/{handle}/{genre-lowercase}.png`
- **Value:** PNG binary decoded from the base64 data URL returned by Gemini

## API Changes

### Modified: `POST /api/stories/generate`

After generating the story, automatically save to KV:

```
KV.put(`${username}:${genre}`, JSON.stringify({ title, story, genre, username, updatedAt }))
```

Response unchanged — still returns `{ title, story, genre, label, imageGenerationEnabled }`.

### Modified: `POST /api/stories/generate-image`

After generating the image, decode base64 and save to R2:

```
R2.put(`images/${username}/${genre.toLowerCase()}.png`, imageBuffer, { httpMetadata: { contentType: 'image/png' } })
```

Also update the KV entry to add the `imageKey`.

Response unchanged — still returns `{ imageUrl: "data:..." }`.

### New: `GET /story/{handle}/{genre}`

Server-rendered HTML page with:

- Story title and full text
- Embedded image from R2
- Open Graph meta tags for social sharing:
  - `og:title` — story title
  - `og:description` — first 200 chars of story
  - `og:image` — `https://commitstory.io/api/stories/image/{handle}/{genre}`
  - `og:url` — `https://commitstory.io/story/{handle}/{genre}`
  - Twitter card tags (`twitter:card`, `twitter:title`, etc.)

Returns 404 page if story not found in KV.

### New: `GET /api/stories/image/{handle}/{genre}`

Serves the R2 image directly with `Content-Type: image/png` and cache headers. This URL is used as the `og:image` value so social platforms can fetch the image.

Returns 404 if image not found in R2.

## Wrangler Config Changes

Add to `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "STORY_KV"
id = "<created-by-wrangler>"

[[r2_buckets]]
binding = "STORY_IMAGES"
bucket_name = "commitstory-images"
```

## Env Interface Changes

Add to the `Env` interface in `server.ts`:

```typescript
STORY_KV: KVNamespace;
STORY_IMAGES: R2Bucket;
```

## Base URL

Production: `https://commitstory.io/`

## Constraints

- One story per genre per user — regenerating overwrites the previous version
- Genre is lowercased in R2 keys for URL-friendliness
- Images are stored as PNG
- Free tier limits: KV 100k reads/day + 1k writes/day, R2 10GB + 10M reads/month

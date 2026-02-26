# YourStory

YourStory is an Angular application that visualises your GitHub commit activity as a shareable visual story. It runs on two server runtimes, adapting to both traditional Node.js hosting and Cloudflare's global edge network.

## Dual-Server Architecture

Two server entry points are maintained in `src/`:

| File | Runtime | Purpose |
|---|---|---|
| `server.ts` | Node.js | Standard Express-based server used for local `ng serve` development and Node.js deployments (e.g. Docker, VPS). |
| `server.workers.ts` | Cloudflare Workers | Edge-compatible entry point that replaces Express with the Workers `fetch` handler API, enabling zero-cold-start, globally distributed deployments on Cloudflare's network. |

The Angular SSR bundle is shared between both runtimes; only the HTTP-adapter layer differs.

---

## Local Development (Cloudflare Workers)

1. Copy the secrets template and fill in your values:
   ```bash
   cp .dev.vars.example .dev.vars
   ```
2. Edit `.dev.vars` and populate every variable (see [Secret Configuration](#secret-configuration) below).
3. Start the local Workers dev server:
   ```bash
   npm run cf:dev
   ```
   The app will be available at `http://localhost:8787`.

---

## Production Deployment

1. Build and deploy to Cloudflare Workers:
   ```bash
   npm run cf:deploy
   ```
2. Set each production secret (one-time setup — see [Secret Configuration](#secret-configuration)):
   ```bash
   wrangler secret put SESSION_SECRET
   wrangler secret put GOOGLE_AI_API_KEY
   wrangler secret put GITHUB_CLIENT_ID
   wrangler secret put GITHUB_CLIENT_SECRET
   wrangler secret put GITHUB_CALLBACK_URL
   ```
3. (Optional) Disable story image generation by setting the worker variable:
   ```toml
   [vars]
   ENABLE_STORY_IMAGE_GENERATION = "false"
   ```
4. Update your **GitHub OAuth App** callback URL to point at your Cloudflare Workers domain, e.g.:
   ```
   https://your-worker.your-subdomain.workers.dev/api/auth/github/callback
   ```
   This must match the value you set for `GITHUB_CALLBACK_URL`.

---

## Secret Configuration

All secrets are stored as Cloudflare Workers secrets (encrypted at rest) and never committed to the repository.

| Secret | Purpose | How to obtain |
|---|---|---|
| `SESSION_SECRET` | Signs and encrypts session cookies. | Generate locally: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `GOOGLE_AI_API_KEY` | Authenticates requests to the Google Generative AI API for story generation. | Create a key at [Google AI Studio](https://aistudio.google.com/app/apikey). |
| `GITHUB_CLIENT_ID` | Identifies your GitHub OAuth App. | Create an OAuth App in [GitHub Developer Settings](https://github.com/settings/developers). |
| `GITHUB_CLIENT_SECRET` | Authenticates your GitHub OAuth App. | Found on the same GitHub OAuth App settings page as `GITHUB_CLIENT_ID`. |
| `GITHUB_CALLBACK_URL` | The URL GitHub redirects to after OAuth. Must match exactly what is registered in the GitHub OAuth App. | Set to your production Workers URL path `/api/auth/github/callback`. For local dev use `http://localhost:8787/api/auth/github/callback`. |

### Optional feature flag

| Variable | Purpose | Values |
|---|---|---|
| `ENABLE_STORY_IMAGE_GENERATION` | Enables/disables `POST /api/stories/generate-image`. | `true` (default), `false`, `0`, `off`, `no` |

> **Note:** The GitHub OAuth App requires a **separate callback URL** for each environment (local and production). You can register both under the same OAuth App by using the "Authorization callback URL" field — GitHub only supports one URL per app, so you may need to create separate OAuth Apps for local and production environments, or update the value between deployments.

### One-time secret setup

Run the following commands after your first `cf:deploy` to store each secret in Cloudflare:

```bash
wrangler secret put SESSION_SECRET
wrangler secret put GOOGLE_AI_API_KEY
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put GITHUB_CALLBACK_URL
```

Wrangler will prompt you to paste the value for each secret interactively. Secrets are encrypted and never visible again after being set.

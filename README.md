# CommitStory

Turn any GitHub profile into a narrative story, milestone timeline, or contribution insights — powered by AI.

🔗 **Live at [commitstory.io](https://commitstory.io)**

## What It Does

Enter a GitHub username and CommitStory generates:

- **Story** — An AI-generated narrative of a developer's open-source journey, available in multiple genres and languages.
- **Timeline** — Key milestones like first commit, first PR, and top contributions visualized chronologically.
- **Insights** — Contribution stats, top repositories, and activity breakdowns.

Stories can be shared via a unique link with Open Graph tags and a generated cover image.

## Tech Stack

- **Frontend** — [Angular](https://angular.dev/) 21 with SSR, Tailwind CSS
- **Backend** — [Cloudflare Workers](https://workers.cloudflare.com/) (server-side rendering + API routes in a single deployment)
- **AI** — [Google Gemini](https://ai.google.dev/) for story generation
- **Storage** — Cloudflare KV (story text/metadata) + R2 (generated images)
- **Monorepo** — [Nx](https://nx.dev/) workspace
- **Testing** — Vitest (unit), Playwright (E2E)

## Getting Started

### Prerequisites

- Node.js v24+
- A [Google AI API key](https://aistudio.google.com/app/apikey)
- A [Cloudflare](https://www.cloudflare.com/) account (free tier works)

### Setup

```bash
# Clone the repo
git clone https://github.com/santoshyadavdev/commitstory.git
cd commitstory

# Install dependencies
npm install

# Copy environment files
cp .dev.vars.example .dev.vars
```

Fill in `.dev.vars` with your API keys. See the file for descriptions of each variable.

### Create Cloudflare Resources

```bash
# Create KV namespace for story storage
npx wrangler kv namespace create STORY_KV

# Create R2 bucket for generated images
npx wrangler r2 bucket create commitstory-images
```

Update `wrangler.toml` with the KV namespace ID from the output above.

### Run Locally

```bash
# Build and start the Cloudflare Workers dev server
npm run cf:dev
```

The app will be available at `http://localhost:8787`.

## Project Structure

```
├── yourstory/              # Angular application (frontend + SSR)
│   ├── src/
│   │   ├── app/            # Angular components, services, routing
│   │   ├── server.ts       # Cloudflare Workers entry point (API + SSR)
│   │   └── main.ts         # Client bootstrap
│   └── project.json        # Nx project configuration
├── yourstory-e2e/          # Playwright E2E tests
├── wrangler.toml           # Cloudflare Workers configuration
├── nx.json                 # Nx workspace configuration
└── package.json
```

## Development

This is an Nx monorepo. Use `nx` to run all tasks:

```bash
# Serve with Angular dev server (no Workers APIs)
npx nx serve yourstory

# Build for Cloudflare
npx nx build yourstory --configuration=cloudflare

# Lint
npx nx run-many -t lint

# Unit tests
npx nx run-many -t test

# E2E tests
npx nx e2e yourstory-e2e

# Visualize project graph
npx nx graph
```

## Deploying

```bash
# Build and deploy to Cloudflare Workers
npm run cf:deploy
```

Secrets must be set via the Cloudflare dashboard or CLI:

```bash
wrangler secret put GOOGLE_AI_API_KEY
wrangler secret put GITHUB_TOKEN
```

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)

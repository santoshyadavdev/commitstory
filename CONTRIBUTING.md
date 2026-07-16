# Contributing to CommitStory

Thanks for your interest in contributing to CommitStory! This guide will help you get started.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v24+
- npm (comes with Node.js)
- A [Cloudflare](https://www.cloudflare.com/) account (for local Workers development)
- A [Google AI API key](https://aistudio.google.com/app/apikey) (for story generation)

### Setup

1. Fork and clone the repository:

   ```bash
   git clone https://github.com/<your-username>/commitstory.git
   cd commitstory
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy the environment files and fill in your values:

   ```bash
   cp .env.example .env
   cp .dev.vars.example .dev.vars
   ```

   See `.dev.vars.example` for descriptions of each variable.

4. Create your own Cloudflare KV namespace and R2 bucket, then update `wrangler.toml` with your resource IDs:

   ```bash
   npx wrangler kv namespace create STORY_KV
   npx wrangler r2 bucket create commitstory-images
   ```

5. Start the development server:

   ```bash
   npm run cf:dev
   ```

## Development Workflow

This is an [Nx](https://nx.dev/) monorepo. Always use `nx` to run tasks:

```bash
# Lint
npx nx run-many -t lint

# Unit tests
npx nx run-many -t test

# Build
npx nx build yourstory

# Build for Cloudflare
npx nx build yourstory --configuration=cloudflare

# E2E tests
npx nx e2e yourstory-e2e

# Visualize project graph
npx nx graph
```

## Making Changes

1. Create a branch from `main`:

   ```bash
   git checkout -b feat/your-feature
   ```

2. Make your changes. Follow the existing code style — the project uses Prettier and ESLint.

3. Run lint and tests before committing:

   ```bash
   npx nx run-many -t lint test
   ```

4. Commit with a clear message following [Conventional Commits](https://www.conventionalcommits.org/):

   ```
   feat: add new story genre option
   fix: correct timeline date parsing
   docs: update setup instructions
   ```

5. Push and open a pull request against `main`.

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR.
- Include a description of what changed and why.
- Make sure CI passes (lint + build).
- Add or update tests if your change affects behavior.

## Reporting Issues

- Search [existing issues](https://github.com/santoshyadavdev/commitstory/issues) before opening a new one.
- Include steps to reproduce, expected behavior, and actual behavior.
- Screenshots are helpful for UI issues.

## Code of Conduct

Be kind and respectful. We follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

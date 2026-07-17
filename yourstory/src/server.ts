/**
 * Cloudflare Workers server entry point.
 *
 * This file is the SSR entry used when building for Cloudflare Workers
 * (`--configuration=cloudflare`). It intentionally avoids all Node.js-specific
 * imports (Express, express-session, node:path, node:crypto, dotenv) which
 * cannot run on the Workers runtime.
 */

import { AngularAppEngine } from '@angular/ssr';
import { GoogleGenAI } from '@google/genai';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Env {
  GOOGLE_AI_API_KEY: string;
  ENABLE_STORY_IMAGE_GENERATION?: string;
  /** Personal Access Token used for server-side GitHub API requests */
  GITHUB_TOKEN?: string;
  /** Bound asset fetcher for static files from dist/yourstory/browser */
  ASSETS: Fetcher;
  /** KV namespace for persisting story text/metadata */
  STORY_KV: KVNamespace;
  /** R2 bucket for persisting generated story images */
  STORY_IMAGES: R2Bucket;
}

// ─── Tiny Helpers ─────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isStoryImageGenerationEnabled(env: Env): boolean {
  const value = env.ENABLE_STORY_IMAGE_GENERATION?.trim().toLowerCase();
  if (!value) return true;
  return !['0', 'false', 'off', 'no'].includes(value);
}

type GenAIInlineData = {
  data?: string;
  mimeType?: string;
  mime_type?: string;
};

type GenAIPart = {
  text?: string;
  inlineData?: GenAIInlineData;
  inline_data?: GenAIInlineData;
};

type GenAICandidate = {
  content?: {
    parts?: GenAIPart[];
  };
};

type GenAIResponseLike = {
  text?: string | (() => string);
  candidates?: GenAICandidate[];
  response?: GenAIResponseLike;
};

function extractTextFromGenAI(result: unknown): string {
  const response = ((result as GenAIResponseLike | undefined)?.response ?? result) as GenAIResponseLike;

  if (typeof response?.text === 'function') {
    return response.text().trim();
  }
  if (typeof response?.text === 'string') {
    return response.text.trim();
  }

  const parts = response?.candidates?.flatMap((candidate) => candidate.content?.parts ?? []) ?? [];
  const text = parts.map((part) => part.text).filter((value): value is string => typeof value === 'string').join('');
  return text.trim();
}

function extractInlineImageData(result: unknown): { data: string; mimeType: string } | null {
  const response = ((result as GenAIResponseLike | undefined)?.response ?? result) as GenAIResponseLike;
  const parts = response?.candidates?.flatMap((candidate) => candidate.content?.parts ?? []) ?? [];

  for (const part of parts) {
    const inline = part.inlineData ?? part.inline_data;
    if (inline?.data) {
      return {
        data: inline.data,
        mimeType: inline.mimeType ?? inline.mime_type ?? 'image/png',
      };
    }
  }

  return null;
}


/**
 * GET /api/github/user?username=...
 */
async function handleGetUser(request: Request, env: Env): Promise<Response> {
  const username = new URL(request.url).searchParams.get('username') ?? '';
  if (!username) return json({ error: 'username is required' }, 400);

  const token = env.GITHUB_TOKEN;
  if (!token) return json({ error: 'GITHUB_TOKEN is not configured' }, 503);

  try {
    const response = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'commitstory-app',
      },
    });

    if (response.status === 404) return json({ error: 'User not found' }, 404);
    if (!response.ok) return json({ error: 'GitHub API error' }, response.status);

    const user = (await response.json()) as {
      login: string;
      name: string | null;
      avatar_url: string;
      html_url: string;
      created_at: string;
    };

    return json({
      login: user.login,
      name: user.name,
      avatar_url: user.avatar_url,
      html_url: user.html_url,
      created_at: user.created_at,
    });
  } catch (err) {
    console.error('GitHub user fetch error:', err);
    return json({ error: 'Failed to fetch user' }, 500);
  }
}

/**
 * GET /api/github/contributions?username=...&year=2024
 */
async function handleContributions(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const login = url.searchParams.get('username') ?? '';
  if (!login) return json({ error: 'username is required' }, 400);

  const token = env.GITHUB_TOKEN;
  if (!token) return json({ error: 'GITHUB_TOKEN is not configured' }, 503);

  const year = parseInt(url.searchParams.get('year') ?? '') || new Date().getFullYear();
  const from = `${year}-01-01T00:00:00Z`;
  const to = `${year}-12-31T23:59:59Z`;

  const query = `
    query($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          totalCommitContributions
          totalIssueContributions
          totalPullRequestContributions
          totalPullRequestReviewContributions
        }
      }
    }
  `;

  try {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'commitstory-app',
      },
      body: JSON.stringify({ query, variables: { login, from, to } }),
    });

    if (!response.ok) return json({ error: 'GitHub API error' }, response.status);

    const data = (await response.json()) as {
      data?: { user?: { contributionsCollection?: {
        totalCommitContributions: number;
        totalIssueContributions: number;
        totalPullRequestContributions: number;
        totalPullRequestReviewContributions: number;
      } } };
      errors?: Array<{ message: string }>;
    };

    if (data.errors?.length) return json({ error: data.errors[0].message }, 400);

    const c = data.data?.user?.contributionsCollection;

    return json({
      year,
      commits: c?.totalCommitContributions ?? 0,
      issues: c?.totalIssueContributions ?? 0,
      pullRequests: c?.totalPullRequestContributions ?? 0,
      reviews: c?.totalPullRequestReviewContributions ?? 0,
      privateContributions: 0,
    });
  } catch (err) {
    console.error('GitHub contributions error:', err);
    return json({ error: 'Failed to fetch contributions' }, 500);
  }
}

/**
 * GET /api/github/repository-contributions?username=...&year=2024
 */
async function handleRepositoryContributions(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const login = url.searchParams.get('username') ?? '';
  if (!login) return json({ error: 'username is required' }, 400);

  const token = env.GITHUB_TOKEN;
  if (!token) return json({ error: 'GITHUB_TOKEN is not configured' }, 503);

  const year = parseInt(url.searchParams.get('year') ?? '') || new Date().getFullYear();
  const from = `${year}-01-01T00:00:00Z`;
  const to = `${year}-12-31T23:59:59Z`;

  const query = `
    query($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          commitContributionsByRepository(maxRepositories: 100) {
            contributions { totalCount }
            repository { name nameWithOwner url stargazerCount }
          }
          pullRequestContributionsByRepository(maxRepositories: 100) {
            contributions { totalCount }
            repository { name nameWithOwner url stargazerCount }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'commitstory-app',
      },
      body: JSON.stringify({ query, variables: { login, from, to } }),
    });

    if (!response.ok) return json({ error: 'GitHub API error' }, response.status);

    type RepoContribNode = {
      contributions: { totalCount: number };
      repository: { name: string; nameWithOwner: string; url: string; stargazerCount: number };
    };

    const data = (await response.json()) as {
      data?: {
        user?: {
          contributionsCollection?: {
            commitContributionsByRepository: RepoContribNode[];
            pullRequestContributionsByRepository: RepoContribNode[];
          };
        };
      };
      errors?: { message: string }[];
    };

    if (data.errors?.length) return json({ error: data.errors[0].message }, 400);

    const collection = data.data?.user?.contributionsCollection;
    const commitsByRepo = collection?.commitContributionsByRepository ?? [];
    const prsByRepo = collection?.pullRequestContributionsByRepository ?? [];

    interface RepoEntry {
      name: string;
      nameWithOwner: string;
      url: string;
      stargazerCount: number;
      commits: number;
      pullRequests: number;
      totalContributions: number;
    }

    const repoMap = new Map<string, RepoEntry>();

    for (const node of commitsByRepo) {
      const { name, nameWithOwner, url, stargazerCount } = node.repository;
      const commits = node.contributions.totalCount;
      const existing = repoMap.get(nameWithOwner);
      if (existing) {
        existing.commits += commits;
        existing.totalContributions += commits;
      } else {
        repoMap.set(nameWithOwner, { name, nameWithOwner, url, stargazerCount, commits, pullRequests: 0, totalContributions: commits });
      }
    }

    for (const node of prsByRepo) {
      const { name, nameWithOwner, url, stargazerCount } = node.repository;
      const prs = node.contributions.totalCount;
      const existing = repoMap.get(nameWithOwner);
      if (existing) {
        existing.pullRequests += prs;
        existing.totalContributions += prs;
      } else {
        repoMap.set(nameWithOwner, { name, nameWithOwner, url, stargazerCount, commits: 0, pullRequests: prs, totalContributions: prs });
      }
    }

    const topRepositories = Array.from(repoMap.values())
      .sort((a, b) => b.totalContributions - a.totalContributions);

    return json({ year, topRepositories });
  } catch (err) {
    console.error('GitHub repository-contributions error:', err);
    return json({ error: 'Failed to fetch repository contributions' }, 500);
  }
}

// ─── Shared helpers for batched GitHub endpoints ──────────────────────────────

/** Split an array into chunks of at most `size` elements. */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/** Max years per GraphQL query for contributions. */
const CONTRIBUTIONS_CHUNK_SIZE = 1;
/** Max years per GraphQL query for repo contributions (heavy – nested nodes). */
const REPO_CONTRIBUTIONS_CHUNK_SIZE = 1;
/** Max repositories to fetch per year in repo-contributions queries. */
const MAX_REPOSITORIES_PER_YEAR = 10;

/**
 * POST /api/github/contributions-batch
 * Body: { username: string, years: number[] }
 *
 * Fetches contributions for all requested years using GraphQL field aliases.
 * Years are chunked to stay within GitHub's query complexity limits.
 */
async function handleContributionsBatch(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = (await request.json()) as { username?: string; years?: number[] };
  const login = body.username ?? '';
  if (!login) return json({ error: 'username is required' }, 400);

  const token = env.GITHUB_TOKEN;
  if (!token) return json({ error: 'GITHUB_TOKEN is not configured' }, 503);

  const years = body.years ?? [new Date().getFullYear()];
  if (years.length === 0) return json({ error: 'years array is empty' }, 400);

  type ContributionsCollection = {
    totalCommitContributions: number;
    totalIssueContributions: number;
    totalPullRequestContributions: number;
    totalPullRequestReviewContributions: number;
  };

  type GraphQLResponse = {
    data?: { user?: Record<string, ContributionsCollection> };
    errors?: Array<{ message: string }>;
  };

  const contribFields = `
    totalCommitContributions
    totalIssueContributions
    totalPullRequestContributions
    totalPullRequestReviewContributions
  `;

  const chunks = chunkArray(years, CONTRIBUTIONS_CHUNK_SIZE);
  const allResults: { year: number; commits: number; issues: number; pullRequests: number; reviews: number; privateContributions: number }[] = [];

  try {
    for (const chunk of chunks) {
      const yearFragments = chunk.map(
        (y) => `y${y}: contributionsCollection(from: "${y}-01-01T00:00:00Z", to: "${y}-12-31T23:59:59Z") { ${contribFields} }`
      ).join('\n          ');

      const query = `
        query($login: String!) {
          rateLimit { cost remaining }
          user(login: $login) { ${yearFragments} }
        }
      `;

      const response = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          Authorization: `bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'commitstory-app',
        },
        body: JSON.stringify({ query, variables: { login } }),
      });

      if (!response.ok) return json({ error: 'GitHub API error' }, response.status);

      const data = (await response.json()) as GraphQLResponse;

      if (data.errors?.length) return json({ error: data.errors[0].message }, 400);

      const user = data.data?.user ?? {};
      for (const y of chunk) {
        const c = user[`y${y}`];
        allResults.push({
          year: y,
          commits: c?.totalCommitContributions ?? 0,
          issues: c?.totalIssueContributions ?? 0,
          pullRequests: c?.totalPullRequestContributions ?? 0,
          reviews: c?.totalPullRequestReviewContributions ?? 0,
          privateContributions: 0,
        });
      }
    }

    return json({ years: allResults });
  } catch (err) {
    console.error('GitHub contributions-batch error:', err);
    return json({ error: 'Failed to fetch contributions' }, 500);
  }
}

/**
 * POST /api/github/repository-contributions-batch
 * Body: { username: string, years: number[] }
 *
 * Fetches repository contributions for all requested years using GraphQL
 * field aliases. Years are chunked (3 at a time) to stay within node limits.
 */
async function handleRepositoryContributionsBatch(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = (await request.json()) as { username?: string; years?: number[] };
  const login = body.username ?? '';
  if (!login) return json({ error: 'username is required' }, 400);

  const token = env.GITHUB_TOKEN;
  if (!token) return json({ error: 'GITHUB_TOKEN is not configured' }, 503);

  const years = body.years ?? [new Date().getFullYear()];
  if (years.length === 0) return json({ error: 'years array is empty' }, 400);

  type RepoContribNode = {
    contributions: { totalCount: number };
    repository: { name: string; nameWithOwner: string; url: string; stargazerCount: number };
  };

  type YearCollection = {
    commitContributionsByRepository: RepoContribNode[];
    pullRequestContributionsByRepository: RepoContribNode[];
  };

  interface RepoEntry {
    name: string;
    nameWithOwner: string;
    url: string;
    stargazerCount: number;
    commits: number;
    pullRequests: number;
    totalContributions: number;
  }

  const repoFields = `
    commitContributionsByRepository(maxRepositories: ${MAX_REPOSITORIES_PER_YEAR}) {
      contributions { totalCount }
      repository { name nameWithOwner url stargazerCount }
    }
    pullRequestContributionsByRepository(maxRepositories: ${MAX_REPOSITORIES_PER_YEAR}) {
      contributions { totalCount }
      repository { name nameWithOwner url stargazerCount }
    }
  `;

  const chunks = chunkArray(years, REPO_CONTRIBUTIONS_CHUNK_SIZE);
  const allResults: { year: number; topRepositories: RepoEntry[] }[] = [];

  try {
    for (const chunk of chunks) {
      const yearFragments = chunk.map(
        (y) => `y${y}: contributionsCollection(from: "${y}-01-01T00:00:00Z", to: "${y}-12-31T23:59:59Z") { ${repoFields} }`
      ).join('\n          ');

      const query = `
        query($login: String!) {
          rateLimit { cost remaining }
          user(login: $login) { ${yearFragments} }
        }
      `;

      const response = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          Authorization: `bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'commitstory-app',
        },
        body: JSON.stringify({ query, variables: { login } }),
      });

      if (!response.ok) return json({ error: 'GitHub API error' }, response.status);

      const data = (await response.json()) as {
        data?: { user?: Record<string, YearCollection> };
        errors?: { message: string }[];
      };

      if (data.errors?.length) return json({ error: data.errors[0].message }, 400);

      const user = data.data?.user ?? {};

      for (const y of chunk) {
        const collection = user[`y${y}`];
        const commitsByRepo = collection?.commitContributionsByRepository ?? [];
        const prsByRepo = collection?.pullRequestContributionsByRepository ?? [];

        const repoMap = new Map<string, RepoEntry>();

        for (const node of commitsByRepo) {
          const { name, nameWithOwner, url, stargazerCount } = node.repository;
          const commits = node.contributions.totalCount;
          const existing = repoMap.get(nameWithOwner);
          if (existing) {
            existing.commits += commits;
            existing.totalContributions += commits;
          } else {
            repoMap.set(nameWithOwner, { name, nameWithOwner, url, stargazerCount, commits, pullRequests: 0, totalContributions: commits });
          }
        }

        for (const node of prsByRepo) {
          const { name, nameWithOwner, url, stargazerCount } = node.repository;
          const prs = node.contributions.totalCount;
          const existing = repoMap.get(nameWithOwner);
          if (existing) {
            existing.pullRequests += prs;
            existing.totalContributions += prs;
          } else {
            repoMap.set(nameWithOwner, { name, nameWithOwner, url, stargazerCount, commits: 0, pullRequests: prs, totalContributions: prs });
          }
        }

        const topRepositories = Array.from(repoMap.values())
          .sort((a, b) => b.totalContributions - a.totalContributions);

        allResults.push({ year: y, topRepositories });
      }
    }

    return json({ years: allResults });
  } catch (err) {
    console.error('GitHub repository-contributions-batch error:', err);
    return json({ error: 'Failed to fetch repository contributions' }, 500);
  }
}

/**
 * GET /api/github/discussions?username=...
 */
async function handleDiscussions(request: Request, env: Env): Promise<Response> {
  const login = new URL(request.url).searchParams.get('username') ?? '';
  if (!login) return json({ error: 'username is required' }, 400);

  const token = env.GITHUB_TOKEN;
  if (!token) return json({ error: 'GITHUB_TOKEN is not configured' }, 503);

  const query = `
    query($login: String!) {
      user(login: $login) {
        repositoryDiscussionComments(first: 1) { totalCount }
        repositoryDiscussions(first: 1) { totalCount }
      }
    }
  `;

  try {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'commitstory-app',
      },
      body: JSON.stringify({ query, variables: { login } }),
    });

    if (!response.ok) return json({ error: 'GitHub API error' }, response.status);

    const data = (await response.json()) as {
      data?: {
        user?: {
          repositoryDiscussionComments?: { totalCount: number };
          repositoryDiscussions?: { totalCount: number };
        };
      };
      errors?: { message: string }[];
    };

    if (data.errors?.length) return json({ error: data.errors[0].message }, 400);

    const user = data.data?.user;
    return json({
      lifetimeDiscussions: user?.repositoryDiscussions?.totalCount ?? 0,
      lifetimeDiscussionComments: user?.repositoryDiscussionComments?.totalCount ?? 0,
    });
  } catch (err) {
    console.error('GitHub discussions error:', err);
    return json({ error: 'Failed to fetch discussions' }, 500);
  }
}

/**
 * POST /api/github/milestones
 */
async function handleMilestones(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as { username?: string; accountCreatedAt?: string | null };
  const login = body.username ?? '';
  if (!login) return json({ error: 'username is required' }, 400);

  const token = env.GITHUB_TOKEN;
  if (!token) return json({ error: 'GITHUB_TOKEN is not configured' }, 503);

  const accessToken = token;
  const accountCreatedAt = body.accountCreatedAt ?? null;

  type GraphQLError = { message: string };
  type MilestoneEvent = {
    type: 'account_created' | 'first_pr' | 'first_issue' | 'first_discussion' | 'pr_count' | 'commit_count';
    title: string;
    description: string;
    date: string | null;
    count?: number;
    url?: string;
  };

  const buildMilestoneThresholds = (total: number): number[] => {
    const base = [100, 500, 1000, 2000];
    const out = base.filter((value) => value <= total);
    let next = 4000;
    while (next <= total) {
      out.push(next);
      next *= 2;
    }
    return out;
  };

  const requestGraphQL = async <T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<{ data?: T; errors?: GraphQLError[] }> => {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'commitstory-app',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      let errorMessage = 'GitHub API error';
      try {
        const body = (await response.json()) as { message?: string };
        if (typeof body.message === 'string' && body.message.trim()) {
          errorMessage = body.message;
        }
      } catch {
        // Ignore parse failure and keep generic message.
      }
      throw new Error(`${response.status}:${errorMessage}`);
    }

    return (await response.json()) as { data?: T; errors?: GraphQLError[] };
  };

  try {
    const firstPrSearch = `is:pr author:${login} sort:created-asc`;
    const firstIssueSearch = `is:issue author:${login} sort:created-asc`;

    const summaryQuery = `
      query($login: String!, $firstPrQuery: String!, $firstIssueQuery: String!) {
        user(login: $login) {
          repositoryDiscussions(first: 1, orderBy: { field: CREATED_AT, direction: ASC }) {
            totalCount
            nodes { title url createdAt }
          }
        }
        firstPr: search(query: $firstPrQuery, type: ISSUE, first: 1) {
          issueCount
          nodes { ... on PullRequest { title url createdAt } }
        }
        firstIssue: search(query: $firstIssueQuery, type: ISSUE, first: 1) {
          issueCount
          nodes { ... on Issue { title url createdAt } }
        }
      }
    `;

    const summaryResult = await requestGraphQL<{
      user?: {
        repositoryDiscussions?: {
          totalCount: number;
          nodes: Array<{ title: string; url: string; createdAt: string }>;
        };
      };
      firstPr?: {
        issueCount: number;
        nodes: Array<{ title: string; url: string; createdAt: string }>;
      };
      firstIssue?: {
        issueCount: number;
        nodes: Array<{ title: string; url: string; createdAt: string }>;
      };
    }>(summaryQuery, {
      login,
      firstPrQuery: firstPrSearch,
      firstIssueQuery: firstIssueSearch,
    });

    if (summaryResult.errors?.length) {
      return json({ error: summaryResult.errors[0].message }, 400);
    }

    const totalPullRequests = summaryResult.data?.firstPr?.issueCount ?? 0;
    const totalIssues = summaryResult.data?.firstIssue?.issueCount ?? 0;
    const totalDiscussions = summaryResult.data?.user?.repositoryDiscussions?.totalCount ?? 0;

    const firstPrNode = summaryResult.data?.firstPr?.nodes?.[0];
    const firstIssueNode = summaryResult.data?.firstIssue?.nodes?.[0];
    const firstDiscussionNode = summaryResult.data?.user?.repositoryDiscussions?.nodes?.[0];

    const events: MilestoneEvent[] = [
      {
        type: 'account_created',
        title: 'GitHub Account Created',
        description: `${login} joined GitHub and started their developer timeline.`,
        date: accountCreatedAt,
      },
      {
        type: 'first_pr',
        title: 'First Pull Request',
        description: firstPrNode?.title || 'First pull request milestone not reached yet.',
        date: firstPrNode?.createdAt ?? null,
        url: firstPrNode?.url,
      },
      {
        type: 'first_issue',
        title: 'First Issue',
        description: firstIssueNode?.title || 'First issue milestone not reached yet.',
        date: firstIssueNode?.createdAt ?? null,
        url: firstIssueNode?.url,
      },
      {
        type: 'first_discussion',
        title: 'First Discussion',
        description: firstDiscussionNode?.title || 'First discussion milestone not reached yet.',
        date: firstDiscussionNode?.createdAt ?? null,
        url: firstDiscussionNode?.url,
      },
    ];

    const prMilestones = buildMilestoneThresholds(totalPullRequests);
    if (prMilestones.length) {
      type PrMilestonePageData = {
        search?: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: Array<{ title: string; url: string; createdAt: string }>;
        };
      };

      const milestoneQuery = `
        query($searchQuery: String!, $after: String) {
          search(query: $searchQuery, type: ISSUE, first: 100, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes { ... on PullRequest { title url createdAt } }
          }
        }
      `;

      let nextCursor: string | null = null;
      let hasNextPage = true;
      let seen = 0;
      let milestoneIndex = 0;

      while (hasNextPage && milestoneIndex < prMilestones.length) {
        const page: { data?: PrMilestonePageData; errors?: GraphQLError[] } =
          await requestGraphQL<PrMilestonePageData>(milestoneQuery, {
            searchQuery: firstPrSearch,
            after: nextCursor,
          });

        if (page.errors?.length) {
          return json({ error: page.errors[0].message }, 400);
        }

        const nodes = page.data?.search?.nodes ?? [];
        for (const pr of nodes) {
          seen += 1;
          while (milestoneIndex < prMilestones.length && prMilestones[milestoneIndex] === seen) {
            const milestone = prMilestones[milestoneIndex];
            events.push({
              type: 'pr_count',
              title: `${milestone.toLocaleString()} Pull Requests`,
              description: `Reached ${milestone.toLocaleString()} pull requests.`,
              date: pr.createdAt ?? null,
              count: milestone,
              url: pr.url,
            });
            milestoneIndex += 1;
          }
          if (milestoneIndex >= prMilestones.length) break;
        }

        hasNextPage = page.data?.search?.pageInfo?.hasNextPage ?? false;
        nextCursor = page.data?.search?.pageInfo?.endCursor ?? null;
      }
    }

    const accountCreatedYear = accountCreatedAt
      ? new Date(accountCreatedAt).getFullYear()
      : new Date().getFullYear();
    const currentYear = new Date().getFullYear();

    const commitQuery = `
      query($login: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $login) {
          contributionsCollection(from: $from, to: $to) {
            totalCommitContributions
          }
        }
      }
    `;

    const commitsByYear: Array<{ year: number; commits: number }> = [];
    for (let year = accountCreatedYear; year <= currentYear; year++) {
      const commitResult = await requestGraphQL<{
        user?: {
          contributionsCollection?: {
            totalCommitContributions: number;
          };
        };
      }>(commitQuery, {
        login,
        from: `${year}-01-01T00:00:00Z`,
        to: `${year}-12-31T23:59:59Z`,
      });

      if (commitResult.errors?.length) {
        return json({ error: commitResult.errors[0].message }, 400);
      }

      commitsByYear.push({
        year,
        commits: commitResult.data?.user?.contributionsCollection?.totalCommitContributions ?? 0,
      });
    }

    const totalCommits = commitsByYear.reduce((sum, item) => sum + item.commits, 0);
    const commitMilestones = buildMilestoneThresholds(totalCommits);

    let runningCommits = 0;
    let commitMilestoneIndex = 0;
    for (const yearData of commitsByYear) {
      runningCommits += yearData.commits;
      while (
        commitMilestoneIndex < commitMilestones.length &&
        runningCommits >= commitMilestones[commitMilestoneIndex]
      ) {
        const milestone = commitMilestones[commitMilestoneIndex];
        events.push({
          type: 'commit_count',
          title: `${milestone.toLocaleString()} Commits`,
          description: `Reached in ${yearData.year}.`,
          date: `${yearData.year}-01-01T00:00:00.000Z`,
          count: milestone,
        });
        commitMilestoneIndex += 1;
      }
    }

    events.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    return json({
      username: login,
      totalPullRequests,
      totalCommits,
      totalIssues,
      totalDiscussions,
      events,
    });
  } catch (err) {
    console.error('GitHub milestones error:', err);
    return json({ error: 'Failed to fetch milestones' }, 500);
  }
}

/**
 * POST /api/stories/generate
 */
async function handleGenerateStory(
  request: Request,
  env: Env,
): Promise<Response> {
  const { genre, language, activity, createdAt, topRepositories, username, forceRegenerate } = (await request.json()) as {
    genre?: unknown;
    language?: unknown;
    activity?: unknown;
    createdAt?: string;
    username?: string;
    forceRegenerate?: boolean;
    topRepositories?: Array<{
      name: string;
      nameWithOwner: string;
      url: string;
      stargazerCount: number;
      commits: number;
      pullRequests: number;
      totalContributions: number;
    }>;
  };

  if (typeof genre !== 'string' || !genre.trim()) {
    return json({ error: 'genre must be a non-empty string' }, 400);
  }
  if (typeof username !== 'string' || !username.trim()) {
    return json({ error: 'username must be a non-empty string' }, 400);
  }
  const selectedLanguage = typeof language === 'string' && language.trim() ? language : 'English';
  const allowedLanguages = ['English', 'Hindi', 'Mandarin Chinese', 'Japanese', 'Spanish', 'French', 'German'];
  if (!allowedLanguages.includes(selectedLanguage)) {
    return json({ error: "language must be one of: English, Hindi, Mandarin Chinese, Japanese, Spanish, French, German" }, 400);
  }
  if (!activity || typeof activity !== 'object') {
    return json({ error: 'activity must be a contribution data object' }, 400);
  }

  // Check KV cache for existing story (skip GitHub API + Gemini calls)
  if (!forceRegenerate && isValidStoryParam(username) && isValidStoryParam(genre as string)) {
    try {
      const storyKey = buildStoryKey(username, genre as string);
      const cached = await env.STORY_KV.get(storyKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed.title === 'string' && typeof parsed.story === 'string') {
          const imageKey = parsed.imageKey ?? (await env.STORY_KV.get(`${storyKey}:imageKey`)) ?? undefined;
          const origin = new URL(request.url).origin;
          return json({
            title: parsed.title,
            story: parsed.story,
            genre: parsed.genre ?? genre,
            label: 'Career Summary',
            imageGenerationEnabled: isStoryImageGenerationEnabled(env),
            shareUrl: `${origin}/story/${encodeURIComponent(username)}/${encodeURIComponent(genre as string)}`,
            cached: true,
            ...(imageKey ? { imageUrl: `${origin}/api/stories/image/${encodeURIComponent(username)}/${encodeURIComponent(genre as string)}` } : {}),
          });
        }
      }
    } catch {
      // Cache miss or parse error — fall through to generate
    }
  }

  const apiKey = env.GOOGLE_AI_API_KEY;
  if (!apiKey) return json({ error: 'AI story generation is not configured' }, 503);

  try {
    const genAI = new GoogleGenAI({ apiKey });

    const memberSince = createdAt;
    let accountAgeText = '';
    if (memberSince) {
      const creationYear = new Date(memberSince).getFullYear();
      const currentYear = new Date().getFullYear();
      const yearsOnGitHub = currentYear - creationYear;
      accountAgeText =
        yearsOnGitHub > 0
          ? `a developer who has been on their coding journey for ${yearsOnGitHub} year${yearsOnGitHub !== 1 ? 's' : ''} since ${creationYear}`
          : `a developer who joined GitHub in ${creationYear}`;
    } else {
      accountAgeText = 'a passionate developer';
    }

    const act = activity as {
      commits?: number;
      pullRequests?: number;
      issues?: number;
      reviews?: number;
      lifetimeDiscussions?: number;
      lifetimeDiscussionComments?: number;
      privateContributions?: number;
    };

    const systemInstruction = [
      `You are a creative writer who transforms GitHub contribution data into engaging ${genre}-style movie narratives.`,
      `The protagonist is ${accountAgeText} named ${username}.`,
      `Generate both a compelling title and a vivid story in the ${genre} genre about their GitHub career and coding journey.`,
      `Their journey began in ${memberSince ? new Date(memberSince).getFullYear() : 'the past'} — weave this origin into the narrative.`,
      `Mention when they started their coding adventure to give the story a sense of time and growth.`,
      `Keep the narrative under approximately 500 words (a ~3-minute read).`,
      `Treat contribution metrics as narrative achievements: commits become acts of creation,`,
      `pull requests become collaborative quests, issues become challenges overcome,`,
      `code reviews become mentorship moments, and discussions become community-building events.`,
      `When repository data is provided, weave contributions to popular open-source projects into the narrative —`,
      `treat them as legendary quests or epic collaborations with the wider developer community.`,
      `Naturally mention 2-3 notable repositories without forcing all of them into the story.`,
      `Write everything in ${selectedLanguage}.`,
      `Return output in this exact plain-text structure: TITLE: [title]\\nSTORY: [story content].`,
      `Do not include markdown formatting, extra headings, or bullet points outside this structure.`,
    ].join(' ');

    const userPrompt = [
      `Generate a ${genre} movie-style story for ${username}'s GitHub career totals.`,
      `Language: ${selectedLanguage}.`,
      `${accountAgeText.charAt(0).toUpperCase() + accountAgeText.slice(1)}, they joined GitHub in ${memberSince ? new Date(memberSince).getFullYear() : 'the past'}.`,
      `Here are their career contribution stats:`,
      `- Member since: ${memberSince ? new Date(memberSince).getFullYear() : 'unknown'}`,
      `- Commits: ${act.commits ?? 0}`,
      `- Pull Requests: ${act.pullRequests ?? 0}`,
      `- Issues: ${act.issues ?? 0}`,
      `- Code Reviews: ${act.reviews ?? 0}`,
      `- Lifetime Discussions: ${act.lifetimeDiscussions ?? 0}`,
      `- Lifetime Discussion Comments: ${act.lifetimeDiscussionComments ?? 0}`,
      `- Private Contributions: ${act.privateContributions ?? 0}`,
      `Weave these metrics into a cohesive, entertaining narrative in the ${genre} style.`,
      `Output both title and story in ${selectedLanguage}.`,
      `Respond exactly in this format:`,
      `TITLE: [title]`,
      `STORY: [story content]`,
      ...(topRepositories?.length
        ? [
            `\nTop repositories contributed to:`,
            ...topRepositories.slice(0, 10).map(
              (r) =>
                `- ${r.nameWithOwner} (⭐ ${r.stargazerCount.toLocaleString()}, ${r.totalContributions} contribution${r.totalContributions !== 1 ? 's' : ''})`,
            ),
            `Naturally mention 2-3 of these notable projects to enrich the story.`,
          ]
        : []),
    ].join('\n');

    const result = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userPrompt,
      config: {
        systemInstruction,
        maxOutputTokens: 4096,
        temperature: 0.7,
      },
    });

    const rawResponse = extractTextFromGenAI(result);
    if (!rawResponse) {
      return json({ error: 'Failed to generate story' }, 500);
    }
    const titleAndStoryMatch = rawResponse.match(/TITLE:\s*([\s\S]*?)\nSTORY:\s*([\s\S]*)/i);

    const fallbackTitleByLanguage: Record<string, string> = {
      English: 'A Developer Journey',
      Hindi: 'कोडिंग यात्रा की कहानी',
      'Mandarin Chinese': '开发者之旅',
      Japanese: '開発者の旅',
      Spanish: 'Un Viaje de Desarrollador',
      French: 'Un Voyage de Développeur',
      German: 'Eine Entwicklerreise',
    };
    const fallbackTitle = fallbackTitleByLanguage[selectedLanguage] ?? 'A Developer Journey';
    const parsedTitle = titleAndStoryMatch?.[1]?.trim() || fallbackTitle;
    const parsedStory = titleAndStoryMatch?.[2]?.trim() || rawResponse;

    // Persist story to KV for shareable URLs (awaited so /story link works immediately)
    let shareUrl: string | undefined;
    if (isValidStoryParam(username) && isValidStoryParam(genre as string)) {
      const storyKey = buildStoryKey(username, genre as string);
      const storyData = JSON.stringify({
        title: parsedTitle,
        story: parsedStory,
        genre,
        username,
        updatedAt: new Date().toISOString(),
      });
      try {
        await env.STORY_KV.put(storyKey, storyData);
        const origin = new URL(request.url).origin;
        shareUrl = `${origin}/story/${encodeURIComponent(username)}/${encodeURIComponent(genre as string)}`;
        // Update the recent stories index
        await updateRecentStoriesIndex(env, {
          handle: username,
          username,
          genre: genre as string,
          title: parsedTitle,
          story: parsedStory,
          updatedAt: new Date().toISOString(),
          hasImage: false,
        });
      } catch (err) {
        console.error('Failed to persist story to KV:', err);
      }
    }

    return json({
      title: parsedTitle,
      story: parsedStory,
      genre,
      label: 'Career Summary',
      imageGenerationEnabled: isStoryImageGenerationEnabled(env),
      ...(shareUrl ? { shareUrl } : {}),
    });
  } catch (err) {
    console.error('Story generation error:', err);
    return json({ error: 'Failed to generate story' }, 500);
  }
}

/**
 * GET /api/stories/recent
 * Returns the most recent stories from KV (up to `limit`, default 5).
 */
async function handleRecentStories(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const requestedLimit = Number.parseInt(url.searchParams.get('limit') ?? '10', 10);
  const limit = Number.isNaN(requestedLimit) ? 10 : Math.min(Math.max(requestedLimit, 1), 50);
  const requestedOffset = Number.parseInt(url.searchParams.get('offset') ?? '0', 10);
  const offset = Number.isNaN(requestedOffset) ? 0 : Math.max(requestedOffset, 0);

  try {
    // Read the pre-built recent stories index
    const indexRaw = await env.STORY_KV.get(RECENT_STORIES_INDEX_KEY);
    const origin = url.origin;

    // Start with indexed entries if available
    const indexedStories: Array<{
      username: string;
      genre: string;
      title: string;
      story: string;
      updatedAt?: string;
      shareUrl: string;
      imageUrl?: string;
    }> = [];
    // Track indexed story keys to avoid duplicates when merging with legacy scan
    const indexedKeys = new Set<string>();

    if (indexRaw) {
      const index: RecentStoryEntry[] = JSON.parse(indexRaw);
      for (const entry of index.slice(0, limit)) {
        indexedStories.push({
          username: entry.username,
          genre: entry.genre,
          title: entry.title,
          story: entry.story,
          updatedAt: entry.updatedAt,
          shareUrl: `${origin}/story/${encodeURIComponent(entry.handle)}/${encodeURIComponent(entry.genre)}`,
          ...(entry.hasImage ? { imageUrl: `${origin}/api/stories/image/${encodeURIComponent(entry.handle)}/${encodeURIComponent(entry.genre)}` } : {}),
        });
        indexedKeys.add(`${entry.handle}:${entry.genre}`);
      }

      // If the index already has enough entries, return early
      if (indexedStories.length >= offset + limit) {
        const page = indexedStories.slice(offset, offset + limit);
        return json({ stories: page, hasMore: indexedStories.length > offset + limit });
      }
    }

    // Legacy fallback: scan KV keys to fill remaining slots (pre-deployment stories)
    const listed = await env.STORY_KV.list();
    const storyKeys = listed.keys.filter(
      (k) => !k.name.endsWith(':imageKey') && k.name !== RECENT_STORIES_INDEX_KEY,
    );

    const legacyStories: Array<{
      username: string;
      genre: string;
      title: string;
      story: string;
      updatedAt?: string;
      shareUrl: string;
      imageUrl?: string;
    }> = [];

    for (const key of storyKeys) {
      if (indexedKeys.has(key.name)) continue;
      try {
        const raw = await env.STORY_KV.get(key.name);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.title !== 'string' || typeof parsed.story !== 'string') continue;
        const parts = key.name.split(':');
        const handle = parts[0] || '';
        const genre = parts.slice(1).join(':') || '';
        if (!handle || !genre) continue;

        const imageKey = parsed.imageKey ?? (await env.STORY_KV.get(`${key.name}:imageKey`)) ?? undefined;
        legacyStories.push({
          username: parsed.username || handle,
          genre: parsed.genre || genre,
          title: parsed.title,
          story: parsed.story,
          updatedAt: parsed.updatedAt,
          shareUrl: `${origin}/story/${encodeURIComponent(handle)}/${encodeURIComponent(genre)}`,
          ...(imageKey ? { imageUrl: `${origin}/api/stories/image/${encodeURIComponent(handle)}/${encodeURIComponent(genre)}` } : {}),
        });
      } catch {
        // Skip entries that fail to parse
      }
    }

    legacyStories.sort((a, b) => {
      const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return dateB - dateA;
    });

    // Merge: indexed entries first (already sorted), then legacy entries
    const allStories = [...indexedStories, ...legacyStories];
    const page = allStories.slice(offset, offset + limit);
    return json({ stories: page, hasMore: allStories.length > offset + limit });
  } catch (err) {
    console.error('Recent stories error:', err);
    return json({ error: 'Failed to fetch recent stories' }, 500);
  }
}

/**
 * POST /api/stories/generate-image
 */
async function handleGenerateStoryImage(
  request: Request,
  env: Env,
): Promise<Response> {
  const { genre, storyTitle, username, stats } = (await request.json()) as {
    genre?: unknown;
    storyTitle?: unknown;
    username?: unknown;
    stats?: Record<string, unknown>;
  };

  if (typeof genre !== 'string' || !genre.trim()) {
    return json({ error: 'genre must be a non-empty string' }, 400);
  }
  if (typeof storyTitle !== 'string' || !storyTitle.trim()) {
    return json({ error: 'storyTitle must be a non-empty string' }, 400);
  }
  if (typeof username !== 'string' || !username.trim()) {
    return json({ error: 'username must be a non-empty string' }, 400);
  }

  if (!isStoryImageGenerationEnabled(env)) {
    return json({ error: 'Story image generation is disabled' }, 503);
  }

  const apiKey = env.GOOGLE_AI_API_KEY;
  if (!apiKey) return json({ error: 'AI story generation is not configured' }, 503);

  try {
    const genAI = new GoogleGenAI({ apiKey });
    const statsText = Object.entries(stats ?? {})
      .filter(([, value]) => typeof value === 'number')
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');

    const genreStyleGuide: Record<string, string> = {
      Drama: 'cinematic dramatic lighting, moody atmosphere, rich contrast',
      Biography: 'editorial documentary style, grounded and reflective mood, textured details',
      Comedy: 'playful composition, bright warm palette, lighthearted visual rhythm',
      Adventure: 'dynamic composition, vibrant colors, sense of motion and discovery',
      Thriller: 'high contrast, suspenseful shadows, mysterious abstract symbolism',
      'Sci-Fi': 'futuristic abstract forms, neon accents, atmospheric glow',
      Documentary: 'clean realistic textures, balanced tones, storytelling through objects',
      Sports: 'energetic composition, bold colors, momentum and impact cues',
    };

    const prompt = [
      'Create a thematic cinematic header illustration for a developer story card.',
      `Story title: ${storyTitle}.`,
      `Genre: ${genre}.`,
      `Creator username: ${username}.`,
      statsText ? `Contribution metrics: ${statsText}.` : '',
      `Art direction: ${genreStyleGuide[genre] ?? 'cinematic abstract digital illustration with strong visual storytelling'}.`,
      'Use abstract and symbolic elements (code, constellations of commits, pull-request pathways, issue markers).',
      'Do not generate human faces, portraits, or specific real people.',
      'No text, logos, watermarks, or UI overlays inside the image.',
      'Target composition: widescreen story hero image, 16:9 framing, high quality details.',
    ].filter(Boolean).join(' ');

    const result = await genAI.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: prompt,
      config: {
        responseModalities: ['IMAGE'],
      },
    });

    const imageData = extractInlineImageData(result);
    if (!imageData) {
      throw new Error('No image data returned by model');
    }

    // Decode base64 image and persist to R2
    if (isValidStoryParam(username) && isValidStoryParam(genre as string)) {
      const imageKey = `images/${username.toLowerCase()}/${(genre as string).toLowerCase()}.png`;
      try {
        const binaryString = atob(imageData.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        // Await R2 upload before publishing imageKey to KV
        await env.STORY_IMAGES.put(imageKey, bytes.buffer, {
          httpMetadata: { contentType: imageData.mimeType || 'image/png' },
        });

        // Store imageKey separately to avoid read-modify-write race with story generation
        const imageMetaKey = `${buildStoryKey(username, genre as string)}:imageKey`;
        await env.STORY_KV.put(imageMetaKey, imageKey);

        // Mark hasImage in the recent stories index
        try {
          const idxRaw = await env.STORY_KV.get(RECENT_STORIES_INDEX_KEY);
          if (idxRaw) {
            const idx: RecentStoryEntry[] = JSON.parse(idxRaw);
            const match = idx.find(
              (e) => e.handle === username && e.genre === (genre as string),
            );
            if (match && !match.hasImage) {
              match.hasImage = true;
              await env.STORY_KV.put(RECENT_STORIES_INDEX_KEY, JSON.stringify(idx));
            }
          }
        } catch {
          // Non-critical: index update for image flag
        }
      } catch (uploadErr) {
        console.error('Failed to decode/upload image to R2:', uploadErr);
      }
    }

    return json({ imageUrl: `data:${imageData.mimeType};base64,${imageData.data}` });
  } catch (err) {
    console.error('Story image generation error:', err);
    return json({ error: 'Failed to generate story image' }, 500);
  }
}

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

/**
 * GET /story/{handle}/{genre}
 * Server-rendered HTML share page with Open Graph meta tags.
 */
/** Validates that a handle/genre contain only safe characters (no slashes, colons, or control chars). */
function isValidStoryParam(value: string): boolean {
  return /^[a-zA-Z0-9_\-.]+$/.test(value);
}

/** KV key that holds the recent stories index (max 50 entries). */
const RECENT_STORIES_INDEX_KEY = '__recent_stories_index__';
const RECENT_STORIES_MAX_ENTRIES = 50;

interface RecentStoryEntry {
  handle: string;
  username: string;
  genre: string;
  title: string;
  story: string;
  updatedAt: string;
  hasImage: boolean;
}

/**
 * Update the recent stories index when a story is created or updated.
 * Keeps the index sorted by updatedAt desc, capped at RECENT_STORIES_MAX_ENTRIES.
 */
async function updateRecentStoriesIndex(
  env: Env,
  entry: RecentStoryEntry,
): Promise<void> {
  try {
    const raw = await env.STORY_KV.get(RECENT_STORIES_INDEX_KEY);
    let index: RecentStoryEntry[] = raw ? JSON.parse(raw) : [];
    // Remove existing entry for same handle+genre
    index = index.filter(
      (e) => !(e.handle === entry.handle && e.genre === entry.genre),
    );
    // Prepend new entry and cap
    index.unshift(entry);
    if (index.length > RECENT_STORIES_MAX_ENTRIES) {
      index = index.slice(0, RECENT_STORIES_MAX_ENTRIES);
    }
    await env.STORY_KV.put(RECENT_STORIES_INDEX_KEY, JSON.stringify(index));
  } catch (err) {
    console.error('Failed to update recent stories index:', err);
  }
}

/** Builds a collision-safe KV key from handle and genre. */
function buildStoryKey(handle: string, genre: string): string {
  return `${handle}:${genre}`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function handleSharePage(
  handle: string,
  genre: string,
  env: Env,
  requestUrl: string,
): Promise<Response> {
  const storyKey = buildStoryKey(handle, genre);
  const raw = await env.STORY_KV.get(storyKey);

  const safeHandle = escapeHtml(handle);
  const safeGenre = escapeHtml(genre);

  if (!raw) {
    return new Response(
      `<!DOCTYPE html><html><head><title>Story Not Found</title></head>` +
      `<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#1a1a2e;color:#fff;">` +
      `<div style="text-align:center"><h1>Story Not Found</h1><p>No story found for <strong>${safeHandle}</strong> in the <strong>${safeGenre}</strong> genre.</p>` +
      `<a href="/" style="color:#f97316;text-decoration:underline">Generate your story →</a></div></body></html>`,
      { status: 404, headers: { 'Content-Type': 'text/html;charset=utf-8' } },
    );
  }

  let story: {
    title: string;
    story: string;
    genre: string;
    username: string;
    imageKey?: string;
    updatedAt?: string;
  };
  try {
    story = JSON.parse(raw);
    if (
      !story ||
      typeof story.story !== 'string' ||
      typeof story.title !== 'string' ||
      typeof story.genre !== 'string' ||
      typeof story.username !== 'string' ||
      (story.imageKey !== undefined && typeof story.imageKey !== 'string')
    ) {
      throw new Error('malformed story payload');
    }
  } catch {
    return new Response(
      `<!DOCTYPE html><html><head><title>Error</title></head>` +
      `<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#1a1a2e;color:#fff;">` +
      `<div style="text-align:center"><h1>Something went wrong</h1><p>Could not load the story. Please try generating it again.</p>` +
      `<a href="/" style="color:#f97316;text-decoration:underline">Generate your story →</a></div></body></html>`,
      { status: 500, headers: { 'Content-Type': 'text/html;charset=utf-8' } },
    );
  }

  // Check separate imageKey entry (avoids race with story generation)
  const imageMetaKey = `${buildStoryKey(handle, genre)}:imageKey`;
  const storedImageKey = story.imageKey || await env.STORY_KV.get(imageMetaKey);

  const origin = new URL(requestUrl).origin;
  const pageUrl = `${origin}/story/${encodeURIComponent(handle)}/${encodeURIComponent(genre)}`;
  const imageUrl = storedImageKey
    ? `${origin}/api/stories/image/${encodeURIComponent(handle)}/${encodeURIComponent(genre)}`
    : '';
  const description = story.story.slice(0, 200).replace(/\n/g, ' ') + '…';
  const escapedTitle = escapeHtml(story.title);
  const escapedDescription = escapeHtml(description);
  const escapedGenre = escapeHtml(story.genre);
  const escapedUsername = escapeHtml(story.username);
  const escapedStory = escapeHtml(story.story).replace(/\n/g, '<br/>');

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
    <span class="badge">${escapedGenre}</span>
    <h1>${escapedTitle}</h1>
    <p class="meta">A story for <strong>${escapedUsername}</strong></p>
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

// ─── Workers Entry Point ──────────────────────────────────────────────────────

const angularApp = new AngularAppEngine();

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname: path } = url;
    const method = request.method;

    let response: Response;

    // ── API Routing ────────────────────────────────────────────────────────────
    if (path === '/api/github/user' && method === 'GET') {
      response = await handleGetUser(request, env);
    } else if (path === '/api/github/contributions' && method === 'GET') {
      response = await handleContributions(request, env);
    } else if (path === '/api/github/repository-contributions' && method === 'GET') {
      response = await handleRepositoryContributions(request, env);
    } else if (path === '/api/github/contributions-batch' && method === 'POST') {
      response = await handleContributionsBatch(request, env);
    } else if (path === '/api/github/repository-contributions-batch' && method === 'POST') {
      response = await handleRepositoryContributionsBatch(request, env);
    } else if (path === '/api/github/discussions' && method === 'GET') {
      response = await handleDiscussions(request, env);
    } else if (path === '/api/github/milestones' && method === 'POST') {
      response = await handleMilestones(request, env);
    } else if (path === '/api/stories/recent' && method === 'GET') {
      response = await handleRecentStories(request, env);
    } else if (path === '/api/stories/generate' && method === 'POST') {
      response = await handleGenerateStory(request, env);
    } else if (path === '/api/stories/generate-image' && method === 'POST') {
      response = await handleGenerateStoryImage(request, env);
    } else if (path.startsWith('/api/stories/image/') && method === 'GET') {
      const segments = path.split('/');
      // /api/stories/image/{handle}/{genre} → segments: ['', 'api', 'stories', 'image', handle, genre]
      const handle = decodeURIComponent(segments[4] || '');
      const storyGenre = decodeURIComponent(segments[5] || '');
      if (handle && storyGenre && segments.length === 6 && isValidStoryParam(handle) && isValidStoryParam(storyGenre)) {
        response = await handleServeStoryImage(handle, storyGenre, env);
      } else {
        response = new Response('Not found', { status: 404 });
      }
    } else if (path.startsWith('/story/') && method === 'GET') {
      const segments = path.split('/');
      // /story/{handle}/{genre} → segments: ['', 'story', handle, genre]
      const handle = decodeURIComponent(segments[2] || '');
      const storyGenre = decodeURIComponent(segments[3] || '');
      if (handle && storyGenre && segments.length === 4 && isValidStoryParam(handle) && isValidStoryParam(storyGenre)) {
        response = await handleSharePage(handle, storyGenre, env, request.url);
      } else {
        response = new Response('Not found', { status: 404 });
      }
    } else {
      // Try Angular SSR
      const angularResponse = await angularApp.handle(request, { env, ctx });
      if (angularResponse) {
        response = angularResponse;
      } else {
        // Fall back to static asset
        response = await env.ASSETS.fetch(request);
      }
    }

    return response;
  },
} satisfies ExportedHandler<Env>;

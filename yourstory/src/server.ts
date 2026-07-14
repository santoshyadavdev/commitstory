/**
 * Cloudflare Workers server entry point.
 *
 * This file is the SSR entry used when building for Cloudflare Workers
 * (`--configuration=cloudflare`). It intentionally avoids all Node.js-specific
 * imports (Express, express-session, node:path, node:crypto, dotenv) which
 * cannot run on the Workers runtime.
 *
 * Sessions are stored in a signed HttpOnly cookie (HMAC-SHA-256 via Web Crypto)
 * instead of express-session, so no server-side session store is required.
 */

import { AngularAppEngine } from '@angular/ssr';
import { GoogleGenAI } from '@google/genai';

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface SessionUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
  html_url: string;
  created_at: string;
}

interface SessionData {
  accessToken?: string;
  user?: SessionUser;
  oauthState?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COOKIE_NAME = 'cstory_sess';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

// ─── Signed Cookie Session Helpers ───────────────────────────────────────────

function b64urlEncode(input: string): string {
  return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64urlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4;
  return atob(pad ? padded + '='.repeat(4 - pad) : padded);
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function encodeSession(data: SessionData, secret: string): Promise<string> {
  const payload = b64urlEncode(unescape(encodeURIComponent(JSON.stringify(data))));
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const sigB64 = b64urlEncode(String.fromCharCode(...new Uint8Array(sig)));
  return `${payload}.${sigB64}`;
}

async function decodeSession(value: string, secret: string): Promise<SessionData | null> {
  const dot = value.lastIndexOf('.');
  if (dot === -1) return null;
  const payload = value.slice(0, dot);
  const sigB64 = value.slice(dot + 1);
  let sigBytes: Uint8Array<ArrayBuffer>;
  try {
    sigBytes = Uint8Array.from(b64urlDecode(sigB64), (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
  } catch {
    return null;
  }
  const key = await importHmacKey(secret);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    sigBytes,
    new TextEncoder().encode(payload),
  );
  if (!valid) return null;
  try {
    return JSON.parse(decodeURIComponent(escape(b64urlDecode(payload)))) as SessionData;
  } catch {
    return null;
  }
}

async function getSession(request: Request, secret: string): Promise<SessionData> {
  const cookieHeader = request.headers.get('cookie') ?? '';
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const name = part.slice(0, eqIdx).trim();
    const value = part.slice(eqIdx + 1).trim();
    if (name === COOKIE_NAME) {
      return (await decodeSession(value, secret)) ?? {};
    }
  }
  return {};
}

async function applySession(
  response: Response,
  session: SessionData | null,
  secret: string,
  secure: boolean,
): Promise<Response> {
  const headers = new Headers(response.headers);
  if (session === null) {
    // Clear the cookie
    headers.append(
      'Set-Cookie',
      `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`,
    );
  } else {
    const value = await encodeSession(session, secret);
    headers.append(
      'Set-Cookie',
      `${COOKIE_NAME}=${value}; Max-Age=${SESSION_MAX_AGE}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`,
    );
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// ─── Tiny Helpers ─────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function redirect(url: string, status = 302): Response {
  return new Response(null, { status, headers: { Location: url } });
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

// ─── Route Handlers ───────────────────────────────────────────────────────────

/**
 * GET /api/auth/github
 * Initiates the GitHub OAuth flow.
 */
async function handleGitHubAuth(
  env: Env,
  session: SessionData,
): Promise<{ response: Response; session: SessionData }> {
  const state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: env.GITHUB_CALLBACK_URL,
    scope: 'read:user read:org',
    state,
  });

  return {
    response: redirect(`https://github.com/login/oauth/authorize?${params}`),
    session: { ...session, oauthState: state },
  };
}

/**
 * GET /api/auth/github/callback
 * Handles the OAuth callback from GitHub.
 */
async function handleGitHubCallback(
  request: Request,
  env: Env,
  session: SessionData,
): Promise<{ response: Response; session: SessionData }> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const newSession: SessionData = { ...session };
  delete newSession.oauthState;

  if (!state || state !== session.oauthState) {
    return { response: json({ error: 'Invalid state parameter' }, 403), session: newSession };
  }
  if (!code) {
    return { response: json({ error: 'No authorization code provided' }, 400), session: newSession };
  }

  // Exchange code for access token
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: env.GITHUB_CALLBACK_URL,
    }),
  });

  const tokenData = (await tokenResponse.json()) as { access_token?: string; error?: string };
  if (!tokenData.access_token) {
    return {
      response: json({ error: tokenData.error ?? 'Failed to get access token' }, 400),
      session: newSession,
    };
  }

  // Fetch user profile
  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'commitstory-app',
    },
  });

  if (!userResponse.ok) {
    return { response: redirect('/login?error=profile_fetch_failed'), session: newSession };
  }

  const userData = (await userResponse.json()) as {
    id: number;
    login: string;
    name: string | null;
    email: string | null;
    avatar_url: string;
    html_url: string;
    created_at: string;
  };

  newSession.accessToken = tokenData.access_token;
  newSession.user = {
    id: userData.id,
    login: userData.login,
    name: userData.name,
    email: userData.email,
    avatar_url: userData.avatar_url,
    html_url: userData.html_url,
    created_at: userData.created_at,
  };

  return { response: redirect('/dashboard'), session: newSession };
}

/**
 * POST /api/auth/logout
 * Clears the session cookie.
 */
function handleLogout(): Response {
  return json({ success: true });
}

/**
 * GET /api/auth/user
 * Returns the currently authenticated user, or 401 if not authenticated.
 */
function handleAuthUser(session: SessionData): Response {
  if (!session.user) return json({ error: 'Not authenticated' }, 401);
  return json({ user: session.user });
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

  const queryWithPrivate = `
    query($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          totalCommitContributions
          totalIssueContributions
          totalPullRequestContributions
          totalPullRequestReviewContributions
          restrictedContributionsCount
        }
      }
    }
  `;

  const queryWithoutPrivate = `
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

  const requestGraphQL = (query: string) =>
    fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'commitstory-app',
      },
      body: JSON.stringify({ query, variables: { login, from, to } }),
    });

  try {
    type ContributionsCollection = {
      totalCommitContributions: number;
      totalIssueContributions: number;
      totalPullRequestContributions: number;
      totalPullRequestReviewContributions: number;
      restrictedContributionsCount?: number;
    };

    type GraphQLResponse = {
      data?: { user?: { contributionsCollection?: ContributionsCollection } };
      errors?: Array<{ message: string; extensions?: { saml_failure?: boolean } }>;
    };

    const response = await requestGraphQL(queryWithPrivate);
    if (!response.ok) return json({ error: 'GitHub API error' }, response.status);

    const data = (await response.json()) as GraphQLResponse;

    let c = data.data?.user?.contributionsCollection;
    let privateBlocked = false;

    if (data.errors?.length) {
      const hasSamlError = data.errors.some((e) => {
        const msg = e.message?.toLowerCase() ?? '';
        return e.extensions?.saml_failure === true || msg.includes('saml') || msg.includes('organization');
      });

      if (!hasSamlError) return json({ error: data.errors[0].message }, 400);

      // Retry without restrictedContributionsCount for SAML-enforced orgs
      privateBlocked = true;
      const fallback = await requestGraphQL(queryWithoutPrivate);
      if (!fallback.ok) return json({ error: 'GitHub API error' }, fallback.status);
      const fallbackData = (await fallback.json()) as GraphQLResponse;
      if (fallbackData.errors?.length) return json({ error: fallbackData.errors[0].message }, 400);
      c = fallbackData.data?.user?.contributionsCollection ?? c;
    }

    return json({
      year,
      commits: c?.totalCommitContributions ?? 0,
      issues: c?.totalIssueContributions ?? 0,
      pullRequests: c?.totalPullRequestContributions ?? 0,
      reviews: c?.totalPullRequestReviewContributions ?? 0,
      privateContributions: privateBlocked ? 0 : (c?.restrictedContributionsCount ?? 0),
      ...(privateBlocked ? { privateContributionsBlocked: true } : {}),
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
    const { pathname: path, protocol, hostname } = url;
    const method = request.method;
    // Force insecure cookies on localhost to prevent browser from blocking them
    const isSecure = protocol === 'https:' && !hostname.includes('localhost') && !hostname.includes('127.0.0.1');

    // Validate required secrets at runtime (fail-fast)
    if (!env.SESSION_SECRET) {
      return new Response('SERVER_ERROR: SESSION_SECRET is not configured', { status: 500 });
    }

    const session = await getSession(request, env.SESSION_SECRET);

    let response: Response;
    let newSession: SessionData | undefined;
    let clearSession = false;

    // ── API Routing ────────────────────────────────────────────────────────────
    if (path === '/api/auth/github' && method === 'GET') {
      const result = await handleGitHubAuth(env, session);
      response = result.response;
      newSession = result.session;
    } else if (path === '/api/auth/github/callback' && method === 'GET') {
      const result = await handleGitHubCallback(request, env, session);
      response = result.response;
      newSession = result.session;
    } else if (path === '/api/auth/logout' && method === 'POST') {
      response = handleLogout();
      clearSession = true;
    } else if (path === '/api/auth/user' && method === 'GET') {
      response = handleAuthUser(session);
    } else if (path === '/api/github/user' && method === 'GET') {
      response = await handleGetUser(request, env);
    } else if (path === '/api/github/contributions' && method === 'GET') {
      response = await handleContributions(request, env);
    } else if (path === '/api/github/repository-contributions' && method === 'GET') {
      response = await handleRepositoryContributions(request, env);
    } else if (path === '/api/github/discussions' && method === 'GET') {
      response = await handleDiscussions(request, env);
    } else if (path === '/api/github/milestones' && method === 'POST') {
      response = await handleMilestones(request, env);
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

    // Apply session cookie changes
    if (clearSession) {
      response = await applySession(response, null, env.SESSION_SECRET, isSecure);
    } else if (newSession !== undefined) {
      response = await applySession(response, newSession, env.SESSION_SECRET, isSecure);
    }

    return response;
  },
} satisfies ExportedHandler<Env>;

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
import { GoogleGenerativeAI } from '@google/generative-ai';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Env {
  SESSION_SECRET: string;
  GOOGLE_AI_API_KEY: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_CALLBACK_URL: string;
  /** Bound asset fetcher for static files from dist/yourstory/browser */
  ASSETS: Fetcher;
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
    scope: 'read:user',
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
 * GET /api/github/contributions?year=2024
 */
async function handleContributions(request: Request, session: SessionData): Promise<Response> {
  if (!session.accessToken || !session.user) {
    return json({ error: 'Not authenticated' }, 401);
  }

  const year = parseInt(new URL(request.url).searchParams.get('year') ?? '') || new Date().getFullYear();
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
          restrictedContributionsCount
        }
      }
    }
  `;

  try {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'commitstory-app',
      },
      body: JSON.stringify({ query, variables: { login: session.user.login, from, to } }),
    });

    if (!response.ok) return json({ error: 'GitHub API error' }, response.status);

    const data = (await response.json()) as {
      data?: {
        user?: {
          contributionsCollection?: {
            totalCommitContributions: number;
            totalIssueContributions: number;
            totalPullRequestContributions: number;
            totalPullRequestReviewContributions: number;
            restrictedContributionsCount: number;
          };
        };
      };
      errors?: { message: string }[];
    };

    if (data.errors?.length) return json({ error: data.errors[0].message }, 400);

    const c = data.data?.user?.contributionsCollection;
    return json({
      year,
      commits: c?.totalCommitContributions ?? 0,
      issues: c?.totalIssueContributions ?? 0,
      pullRequests: c?.totalPullRequestContributions ?? 0,
      reviews: c?.totalPullRequestReviewContributions ?? 0,
      privateContributions: c?.restrictedContributionsCount ?? 0,
    });
  } catch (err) {
    console.error('GitHub contributions error:', err);
    return json({ error: 'Failed to fetch contributions' }, 500);
  }
}

/**
 * GET /api/github/repository-contributions?year=2024
 */
async function handleRepositoryContributions(
  request: Request,
  session: SessionData,
): Promise<Response> {
  if (!session.accessToken || !session.user) {
    return json({ error: 'Not authenticated' }, 401);
  }

  const year = parseInt(new URL(request.url).searchParams.get('year') ?? '') || new Date().getFullYear();
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
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'commitstory-app',
      },
      body: JSON.stringify({ query, variables: { login: session.user.login, from, to } }),
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
      .filter((r) => r.stargazerCount > 100)
      .sort((a, b) => b.totalContributions - a.totalContributions)
      .slice(0, 10);

    return json({ year, topRepositories });
  } catch (err) {
    console.error('GitHub repository-contributions error:', err);
    return json({ error: 'Failed to fetch repository contributions' }, 500);
  }
}

/**
 * GET /api/github/discussions
 */
async function handleDiscussions(request: Request, session: SessionData): Promise<Response> {
  if (!session.accessToken || !session.user) {
    return json({ error: 'Not authenticated' }, 401);
  }

  const login = session.user.login;
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
        Authorization: `Bearer ${session.accessToken}`,
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
 * POST /api/stories/generate
 */
async function handleGenerateStory(
  request: Request,
  env: Env,
  session: SessionData,
): Promise<Response> {
  if (!session.accessToken || !session.user) {
    return json({ error: 'Not authenticated' }, 401);
  }

  const { genre, language, activity, createdAt, topRepositories } = (await request.json()) as {
    genre?: unknown;
    language?: unknown;
    activity?: unknown;
    createdAt?: string;
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
  const selectedLanguage = typeof language === 'string' && language.trim() ? language : 'English';
  const allowedLanguages = ['English', 'Hindi', 'Mandarin Chinese', 'Japanese', 'Spanish', 'French', 'German'];
  if (!allowedLanguages.includes(selectedLanguage)) {
    return json({ error: "language must be one of: English, Hindi, Mandarin Chinese, Japanese, Spanish, French, German" }, 400);
  }
  if (!activity || typeof activity !== 'object') {
    return json({ error: 'activity must be a contribution data object' }, 400);
  }

  const apiKey = env.GOOGLE_AI_API_KEY;
  if (!apiKey) return json({ error: 'AI story generation is not configured' }, 503);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const username = session.user.login;

    const memberSince = createdAt ?? session.user.created_at;
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

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-lite',
      systemInstruction,
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { maxOutputTokens: 700, temperature: 0.7 },
    });

    const rawResponse = result.response.text().trim();
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

    return json({ title: parsedTitle, story: parsedStory, genre, label: 'Career Summary' });
  } catch (err) {
    console.error('Story generation error:', err);
    return json({ error: 'Failed to generate story' }, 500);
  }
}

// ─── Workers Entry Point ──────────────────────────────────────────────────────

const angularApp = new AngularAppEngine();

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname: path, protocol } = url;
    const method = request.method;
    const isSecure = protocol === 'https:';

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
    } else if (path === '/api/github/contributions' && method === 'GET') {
      response = await handleContributions(request, session);
    } else if (path === '/api/github/repository-contributions' && method === 'GET') {
      response = await handleRepositoryContributions(request, session);
    } else if (path === '/api/github/discussions' && method === 'GET') {
      response = await handleDiscussions(request, session);
    } else if (path === '/api/stories/generate' && method === 'POST') {
      response = await handleGenerateStory(request, env, session);
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

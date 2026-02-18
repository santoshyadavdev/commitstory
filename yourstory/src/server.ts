import 'dotenv/config';
import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import { GoogleGenerativeAI } from '@google/generative-ai';
import express from 'express';
import session from 'express-session';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

// Trust the first proxy hop so secure cookies work behind a reverse proxy.
app.set('trust proxy', 1);

// Fail fast in production when SESSION_SECRET is not configured.
if (process.env['NODE_ENV'] === 'production' && !process.env['SESSION_SECRET']) {
  throw new Error(
    'SESSION_SECRET environment variable must be set in production.'
  );
}

// Fail fast in production when GOOGLE_AI_API_KEY is not configured.
if (process.env['NODE_ENV'] === 'production' && !process.env['GOOGLE_AI_API_KEY']) {
  throw new Error(
    'GOOGLE_AI_API_KEY environment variable must be set in production.'
  );
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * Session middleware
 */
app.use(
  session({
    secret: process.env['SESSION_SECRET'] as string,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: 'lax',
    },
  })
);

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  })
);

// ─── Auth Endpoints ───────────────────────────────────────────────────────────

/**
 * GET /api/auth/github
 * Initiates the GitHub OAuth flow.
 */
app.get('/api/auth/github', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: process.env['GITHUB_CLIENT_ID'] ?? '',
    redirect_uri: process.env['GITHUB_CALLBACK_URL'] ?? '',
    scope: 'read:user repo read:discussion',
    state,
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

/**
 * GET /api/auth/github/callback
 * Handles the OAuth callback from GitHub.
 */
app.get('/api/auth/github/callback', async (req, res) => {
  const { code, state } = req.query as { code?: string; state?: string };

  // Validate state to prevent CSRF attacks
  if (!state || state !== req.session.oauthState) {
    res.status(403).json({ error: 'Invalid state parameter' });
    return;
  }
  delete req.session.oauthState;

  if (!code) {
    res.status(400).json({ error: 'No authorization code provided' });
    return;
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: process.env['GITHUB_CLIENT_ID'],
          client_secret: process.env['GITHUB_CLIENT_SECRET'],
          code,
          redirect_uri: process.env['GITHUB_CALLBACK_URL'],
        }),
      }
    );

    const tokenData = (await tokenResponse.json()) as {
      access_token?: string;
      error?: string;
    };

    if (!tokenData.access_token) {
      res
        .status(400)
        .json({ error: tokenData.error ?? 'Failed to get access token' });
      return;
    }

    // Fetch user profile
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!userResponse.ok) {
      console.error(
        'GitHub profile fetch failed:',
        userResponse.status,
        userResponse.statusText
      );
      res.redirect('/login?error=profile_fetch_failed');
      return;
    }

    const userData = (await userResponse.json()) as {
      id: number;
      login: string;
      name: string | null;
      email: string | null;
      avatar_url: string;
      html_url: string;
    };

    req.session.accessToken = tokenData.access_token;
    req.session.user = {
      id: userData.id,
      login: userData.login,
      name: userData.name,
      email: userData.email,
      avatar_url: userData.avatar_url,
      html_url: userData.html_url,
    };

    res.redirect('/dashboard');
  } catch (err) {
    console.error('OAuth callback error:', err);
    res
      .status(500)
      .json({ error: 'Internal server error during authentication' });
  }
});

/**
 * POST /api/auth/logout
 * Destroys the session and clears the cookie.
 */
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: 'Failed to destroy session' });
      return;
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

/**
 * GET /api/auth/user
 * Returns the currently authenticated user, or 401 if not authenticated.
 */
app.get('/api/auth/user', (req, res) => {
  if (!req.session.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  res.json({ user: req.session.user });
});

// ─── GitHub Data Proxy Endpoints ──────────────────────────────────────────────

/**
 * GET /api/github/contributions?year=2024
 * Proxies a GraphQL request to GitHub to fetch contribution data for a given year.
 */
app.get('/api/github/contributions', async (req, res) => {
  if (!req.session.accessToken || !req.session.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const year =
    parseInt(req.query['year'] as string) || new Date().getFullYear();
  const login = req.session.user.login;

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
        Authorization: `Bearer ${req.session.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables: { login, from, to } }),
    });

    if (!response.ok) {
      res.status(response.status).json({ error: 'GitHub API error' });
      return;
    }

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

    if (data.errors?.length) {
      res.status(400).json({ error: data.errors[0].message });
      return;
    }

    const collection = data.data?.user?.contributionsCollection;
    res.json({
      year,
      commits: collection?.totalCommitContributions ?? 0,
      issues: collection?.totalIssueContributions ?? 0,
      pullRequests: collection?.totalPullRequestContributions ?? 0,
      reviews: collection?.totalPullRequestReviewContributions ?? 0,
      privateContributions: collection?.restrictedContributionsCount ?? 0,
    });
  } catch (err) {
    console.error('GitHub contributions error:', err);
    res.status(500).json({ error: 'Failed to fetch contributions' });
  }
});

/**
 * GET /api/github/discussions?year=2024
 * Fetches the authenticated user's discussion contributions for a given year.
 */
app.get('/api/github/discussions', async (req, res) => {
  if (!req.session.accessToken || !req.session.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const login = req.session.user.login;

  // Note: GitHub's GraphQL API does not expose date-scoped counts for
  // repositoryDiscussions or repositoryDiscussionComments, so these are
  // lifetime totals for the authenticated user.
  const query = `
    query($login: String!) {
      user(login: $login) {
        repositoryDiscussionComments(first: 1) {
          totalCount
        }
        repositoryDiscussions(first: 1) {
          totalCount
        }
      }
    }
  `;

  try {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${req.session.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables: { login } }),
    });

    if (!response.ok) {
      res.status(response.status).json({ error: 'GitHub API error' });
      return;
    }

    const data = (await response.json()) as {
      data?: {
        user?: {
          repositoryDiscussionComments?: { totalCount: number };
          repositoryDiscussions?: { totalCount: number };
        };
      };
      errors?: { message: string }[];
    };

    if (data.errors?.length) {
      res.status(400).json({ error: data.errors[0].message });
      return;
    }

    const user = data.data?.user;
    res.json({
      lifetimeDiscussions: user?.repositoryDiscussions?.totalCount ?? 0,
      lifetimeDiscussionComments: user?.repositoryDiscussionComments?.totalCount ?? 0,
    });
  } catch (err) {
    console.error('GitHub discussions error:', err);
    res.status(500).json({ error: 'Failed to fetch discussions' });
  }
});

// ─── Story Generation Endpoint ───────────────────────────────────────────────

/**
 * POST /api/stories/generate
 * Accepts GitHub contribution data and generates a movie-style narrative
 * using Google's Gemini 1.5 Flash-8B model.
 */
app.post('/api/stories/generate', async (req, res) => {
  if (!req.session.accessToken || !req.session.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const { year, genre, activity } = req.body as {
    year?: unknown;
    genre?: unknown;
    activity?: unknown;
  };

  if (typeof year !== 'number') {
    res.status(400).json({ error: 'year must be a number' });
    return;
  }
  if (typeof genre !== 'string' || !genre.trim()) {
    res.status(400).json({ error: 'genre must be a non-empty string' });
    return;
  }
  if (!activity || typeof activity !== 'object') {
    res.status(400).json({ error: 'activity must be a contribution data object' });
    return;
  }

  const apiKey = process.env['GOOGLE_AI_API_KEY'];
  if (!apiKey) {
    res.status(503).json({ error: 'AI story generation is not configured' });
    return;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);

    const username = req.session.user.login;
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
      `The protagonist is a developer named ${username}.`,
      `Write a vivid, compelling story in the ${genre} genre about their coding journey in ${year}.`,
      `Keep the narrative under approximately 500 words (a ~3-minute read).`,
      `Treat contribution metrics as narrative achievements: commits become acts of creation,`,
      `pull requests become collaborative quests, issues become challenges overcome,`,
      `code reviews become mentorship moments, and discussions become community-building events.`,
      `Do not include any markdown formatting, headers, or bullet points — write flowing prose only.`,
    ].join(' ');

    const userPrompt = [
      `Generate a ${genre} movie-style story for ${username}'s GitHub contributions in ${year}.`,
      `Here are their contribution stats:`,
      `- Commits: ${act.commits ?? 0}`,
      `- Pull Requests: ${act.pullRequests ?? 0}`,
      `- Issues: ${act.issues ?? 0}`,
      `- Code Reviews: ${act.reviews ?? 0}`,
      `- Lifetime Discussions: ${act.lifetimeDiscussions ?? 0}`,
      `- Lifetime Discussion Comments: ${act.lifetimeDiscussionComments ?? 0}`,
      `- Private Contributions: ${act.privateContributions ?? 0}`,
      `Weave these metrics into a cohesive, entertaining narrative in the ${genre} style.`,
    ].join('\n');

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-lite',
      systemInstruction,
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        maxOutputTokens: 700,
        temperature: 0.7,
      },
    });

    const story = result.response.text();

    res.json({ story, year, genre });
  } catch (err) {
    console.error('Story generation error:', err);
    res.status(500).json({ error: 'Failed to generate story' });
  }
});

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use('/**', (req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next()
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);

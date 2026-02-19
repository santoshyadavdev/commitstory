export interface UserProfile {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
  html_url: string;
  created_at?: string;
}

export interface ActivitySummary {
  commits: number;
  issues: number;
  pullRequests: number;
  reviews: number;
  /** Lifetime total — GitHub's API does not expose year-scoped discussion counts. */
  lifetimeDiscussions: number;
  /** Lifetime total — GitHub's API does not expose year-scoped discussion comment counts. */
  lifetimeDiscussionComments: number;
  privateContributions: number;
}

export interface YearlyActivity extends ActivitySummary {
  year: number;
}

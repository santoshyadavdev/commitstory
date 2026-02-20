export interface UserProfile {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
  html_url: string;
  created_at?: string;
}

export interface RepositoryContribution {
  name: string;
  nameWithOwner: string;
  url: string;
  stargazerCount: number;
  commits: number;
  pullRequests: number;
  totalContributions: number;
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
  /** Top popular repositories contributed to, merged across all fetched years. */
  topRepositories?: RepositoryContribution[];
}

export interface YearlyActivity extends ActivitySummary {
  year: number;
}

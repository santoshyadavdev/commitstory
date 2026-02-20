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
  privateContributions: number;
  /** Top popular repositories contributed to, merged across all fetched years. */
  topRepositories?: RepositoryContribution[];
}

export interface YearlyActivity extends ActivitySummary {
  year: number;
}

export enum MilestoneType {
  account_created = 'account_created',
  first_pr = 'first_pr',
  first_issue = 'first_issue',
  first_discussion = 'first_discussion',
  pr_count = 'pr_count',
  commit_count = 'commit_count',
}

export interface MilestoneEvent {
  type: MilestoneType;
  title: string;
  description: string;
  date: string | null;
  count?: number;
  url?: string;
}

export interface TimelineData {
  username: string;
  totalPullRequests: number;
  totalCommits: number;
  totalIssues: number;
  totalDiscussions: number;
  events: MilestoneEvent[];
}

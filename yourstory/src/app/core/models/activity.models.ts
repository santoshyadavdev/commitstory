export interface UserProfile {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
  html_url: string;
}

export interface ActivitySummary {
  commits: number;
  issues: number;
  pullRequests: number;
  reviews: number;
  discussions: number;
  discussionComments: number;
}

export interface YearlyActivity extends ActivitySummary {
  year: number;
}

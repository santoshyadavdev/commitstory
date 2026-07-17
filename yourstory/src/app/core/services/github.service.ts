import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { catchError, forkJoin, map, Observable, of } from 'rxjs';
import {
  ActivitySummary,
  RepositoryContribution,
  RepositoryInsight,
  RepositoryInsightsResponse,
  TimelineData,
  YearlyActivity,
  YearlyRepoContribution,
} from '../models/activity.models';

export interface GitHubUserProfile {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
  created_at: string;
}

interface ContributionsResponse {
  year: number;
  commits: number;
  issues: number;
  pullRequests: number;
  reviews: number;
  privateContributions: number;
}

interface ContributionsBatchResponse {
  years: ContributionsResponse[];
}

interface DiscussionsResponse {
  lifetimeDiscussions: number;
  lifetimeDiscussionComments: number;
}

interface RepositoryContributionsResponse {
  year: number;
  topRepositories: RepositoryContribution[];
}

interface RepositoryContributionsBatchResponse {
  years: RepositoryContributionsResponse[];
}

/** Maximum number of years to fetch to stay within GitHub API limits. */
const MAX_YEARS = 7;

@Injectable({ providedIn: 'root' })
export class GitHubService {
  private readonly http = inject(HttpClient);

  /**
   * Fetches public profile info for a GitHub user.
   */
  getUser(username: string): Observable<GitHubUserProfile> {
    const params = new HttpParams().set('username', username);
    return this.http.get<GitHubUserProfile>('/api/github/user', { params });
  }

  /**
   * Fetches commit/issue/PR contributions for a given username and year.
   */
  getContributions(username: string, year: number): Observable<ContributionsResponse> {
    const params = new HttpParams().set('username', username).set('year', String(year));
    return this.http.get<ContributionsResponse>('/api/github/contributions', { params });
  }

  /**
   * Fetches lifetime discussion totals for a GitHub user.
   */
  getDiscussions(username: string): Observable<DiscussionsResponse> {
    const params = new HttpParams().set('username', username);
    return this.http.get<DiscussionsResponse>('/api/github/discussions', { params });
  }

  /**
   * Fetches popular repository contributions for a given username and year.
   */
  getRepositoryContributions(username: string, year: number): Observable<RepositoryContributionsResponse> {
    const params = new HttpParams().set('username', username).set('year', String(year));
    return this.http.get<RepositoryContributionsResponse>(
      '/api/github/repository-contributions',
      { params }
    );
  }

  /**
   * Fetches contributions for multiple years in a single API call using GraphQL aliases.
   */
  getContributionsBatch(username: string, years: number[]): Observable<ContributionsBatchResponse> {
    return this.http.post<ContributionsBatchResponse>('/api/github/contributions-batch', {
      username,
      years,
    });
  }

  /**
   * Fetches repository contributions for multiple years in a single API call.
   */
  getRepositoryContributionsBatch(username: string, years: number[]): Observable<RepositoryContributionsBatchResponse> {
    return this.http.post<RepositoryContributionsBatchResponse>('/api/github/repository-contributions-batch', {
      username,
      years,
    });
  }

  /**
   * Fetches timeline milestone data for a given username.
   */
  getMilestones(username: string, accountCreatedAt?: string | null): Observable<TimelineData> {
    return this.http.post<TimelineData>('/api/github/milestones', { username, accountCreatedAt: accountCreatedAt ?? null }).pipe(
      catchError(() =>
        of({
          username: '',
          totalPullRequests: 0,
          totalCommits: 0,
          totalIssues: 0,
          totalDiscussions: 0,
          events: [],
        })
      )
    );
  }

  /**
   * Combines year-scoped contributions with lifetime discussion totals for a username.
   */
  getYearlyActivity(username: string, year: number): Observable<YearlyActivity> {
    return forkJoin([
      this.getContributions(username, year),
      this.getDiscussions(username),
    ]).pipe(
      map(([contributions, discussions]) => ({
        year,
        commits: contributions.commits,
        issues: contributions.issues,
        pullRequests: contributions.pullRequests,
        reviews: contributions.reviews,
        privateContributions: contributions.privateContributions,
        lifetimeDiscussions: discussions.lifetimeDiscussions,
        lifetimeDiscussionComments: discussions.lifetimeDiscussionComments,
      }))
    );
  }

  /**
   * Fetches contributions from the user's account creation year to the current year,
   * then aggregates the numeric fields by summing them.
   * Uses a single batched GraphQL call instead of per-year requests.
   * Discussion counts are included once — they are already lifetime totals.
   *
   * @param username - GitHub username to fetch data for.
   * @param createdAt - ISO 8601 date string of the GitHub account creation date.
   *                    Falls back to the last 4 years when not provided.
   */
  getAggregatedActivity(username: string, createdAt?: string): Observable<ActivitySummary> {
    const currentYear = new Date().getFullYear();

    let startYear: number;
    if (createdAt) {
      startYear = Math.max(new Date(createdAt).getFullYear(), currentYear - MAX_YEARS + 1);
    } else {
      startYear = currentYear - 3;
    }

    const years: number[] = [];
    for (let y = startYear; y <= currentYear; y++) {
      years.push(y);
    }

    return forkJoin({
      contributionsBatch: this.getContributionsBatch(username, years),
      discussions: this.getDiscussions(username),
      repoContributionsBatch: this.getRepositoryContributionsBatch(username, years),
    }).pipe(
      map(({ contributionsBatch, discussions, repoContributionsBatch }) => {
        const contributions = contributionsBatch.years;
        const repoContributions = repoContributionsBatch.years;

        // Merge repository contributions across years, deduplicating by nameWithOwner
        const repoMap = new Map<string, RepositoryContribution>();
        for (const yearData of repoContributions) {
          for (const repo of yearData.topRepositories) {
            const existing = repoMap.get(repo.nameWithOwner);
            if (existing) {
              existing.commits += repo.commits;
              existing.pullRequests += repo.pullRequests;
              existing.totalContributions += repo.totalContributions;
            } else {
              repoMap.set(repo.nameWithOwner, { ...repo });
            }
          }
        }
        const topRepositories = Array.from(repoMap.values())
          .sort((a, b) => b.totalContributions - a.totalContributions);

        return {
          commits: contributions.reduce((sum, c) => sum + c.commits, 0),
          issues: contributions.reduce((sum, c) => sum + c.issues, 0),
          pullRequests: contributions.reduce((sum, c) => sum + c.pullRequests, 0),
          reviews: contributions.reduce((sum, c) => sum + c.reviews, 0),
          privateContributions: contributions.reduce((sum, c) => sum + c.privateContributions, 0),
          lifetimeDiscussions: discussions.lifetimeDiscussions,
          lifetimeDiscussionComments: discussions.lifetimeDiscussionComments,
          topRepositories,
        };
      })
    );
  }

  /**
   * Fetches repository contribution insights from account creation year to current year
   * and merges per-repository activity across years.
   * Uses a single batched GraphQL call instead of per-year requests.
   *
   * @param username - GitHub username to fetch data for.
   * @param createdAt - ISO 8601 date string of the GitHub account creation date.
   */
  getRepositoryInsights(username: string, createdAt?: string): Observable<RepositoryInsightsResponse> {
    const currentYear = new Date().getFullYear();
    const TOP_REPOSITORIES_LIMIT = 10;

    let startYear: number;
    if (createdAt) {
      startYear = Math.max(new Date(createdAt).getFullYear(), currentYear - MAX_YEARS + 1);
    } else {
      startYear = currentYear - 3;
    }

    const years: number[] = [];
    for (let y = startYear; y <= currentYear; y++) {
      years.push(y);
    }

    return this.getRepositoryContributionsBatch(username, years).pipe(
      map((batchResponse) => {
        const repoMap = new Map<string, RepositoryInsight>();

        for (const yearData of batchResponse.years) {
          const year = yearData.year;
          for (const repo of yearData.topRepositories) {
            const yearlyContribution: YearlyRepoContribution = {
              year,
              commits: repo.commits,
              pullRequests: repo.pullRequests,
              totalContributions: repo.totalContributions,
            };

            const existing = repoMap.get(repo.nameWithOwner);
            if (existing) {
              existing.totalContributions += repo.totalContributions;
              existing.yearlyBreakdown.push(yearlyContribution);
            } else {
              repoMap.set(repo.nameWithOwner, {
                name: repo.name,
                nameWithOwner: repo.nameWithOwner,
                url: repo.url,
                stargazerCount: repo.stargazerCount,
                totalContributions: repo.totalContributions,
                yearlyBreakdown: [yearlyContribution],
              });
            }
          }
        }

        const repositories = Array.from(repoMap.values())
          .map((repo) => ({
            ...repo,
            yearlyBreakdown: repo.yearlyBreakdown.sort((a, b) => b.year - a.year),
          }))
          .sort((a, b) => b.totalContributions - a.totalContributions)
          .slice(0, TOP_REPOSITORIES_LIMIT);

        return { entries: repositories };
      })
    );
  }
}

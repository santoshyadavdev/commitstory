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

interface DiscussionsResponse {
  lifetimeDiscussions: number;
  lifetimeDiscussionComments: number;
}

interface RepositoryContributionsResponse {
  year: number;
  topRepositories: RepositoryContribution[];
}

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
   * capped at a maximum of 10 years, then aggregates the numeric fields by summing them.
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
      startYear = new Date(createdAt).getFullYear();
    } else {
      // Fallback: last 4 years (original behaviour)
      startYear = currentYear - 3;
    }

    const years: number[] = [];
    for (let y = startYear; y <= currentYear; y++) {
      years.push(y);
    }

    return forkJoin({
      contributions: forkJoin(years.map((year) => this.getContributions(username, year))),
      discussions: this.getDiscussions(username),
      repoContributions: forkJoin(years.map((year) => this.getRepositoryContributions(username, year))),
    }).pipe(
      map(({ contributions, discussions, repoContributions }) => {
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
   * Fetches repository contribution insights from account creation year to current year,
   * capped at a maximum of 10 years, and merges per-repository activity across years.
   *
   * @param username - GitHub username to fetch data for.
   * @param createdAt - ISO 8601 date string of the GitHub account creation date.
   */
  getRepositoryInsights(username: string, createdAt?: string): Observable<RepositoryInsightsResponse> {
    const currentYear = new Date().getFullYear();
    const TOP_REPOSITORIES_LIMIT = 10;

    let startYear: number;
    if (createdAt) {
      startYear = new Date(createdAt).getFullYear();
    } else {
      startYear = currentYear - 3;
    }

    const years: number[] = [];
    for (let y = startYear; y <= currentYear; y++) {
      years.push(y);
    }

    return forkJoin(years.map((year) => this.getRepositoryContributions(username, year))).pipe(
      map((yearlyResults) => {
        const repoMap = new Map<string, RepositoryInsight>();

        for (const yearData of yearlyResults) {
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

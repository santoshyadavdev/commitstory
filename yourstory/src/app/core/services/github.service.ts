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
   * Fetches commit/issue/PR contributions for a given year.
   */
  getContributions(year: number): Observable<ContributionsResponse> {
    const params = new HttpParams().set('year', String(year));
    return this.http.get<ContributionsResponse>('/api/github/contributions', { params });
  }

  /**
   * Fetches lifetime discussion totals for the authenticated user.
   * GitHub's API does not expose year-scoped discussion counts.
   */
  getDiscussions(): Observable<DiscussionsResponse> {
    return this.http.get<DiscussionsResponse>('/api/github/discussions');
  }

  /**
   * Fetches popular repository contributions for a given year.
   */
  getRepositoryContributions(year: number): Observable<RepositoryContributionsResponse> {
    const params = new HttpParams().set('year', String(year));
    return this.http.get<RepositoryContributionsResponse>(
      '/api/github/repository-contributions',
      { params }
    );
  }

  /**
   * Fetches timeline milestone data used by the dashboard timeline view.
   */
  getMilestones(): Observable<TimelineData> {
    return this.http.post<TimelineData>('/api/github/milestones', {}).pipe(
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
   * Combines year-scoped contributions with lifetime discussion totals.
   */
  getYearlyActivity(year: number): Observable<YearlyActivity> {
    return forkJoin([
      this.getContributions(year),
      this.getDiscussions(),
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
   * @param createdAt - ISO 8601 date string of the GitHub account creation date.
   *                    Falls back to the last 4 years when not provided.
   */
  getAggregatedActivity(createdAt?: string): Observable<ActivitySummary> {
    const currentYear = new Date().getFullYear();
    const MAX_YEARS = 10;

    let startYear: number;
    if (createdAt) {
      const creationYear = new Date(createdAt).getFullYear();
      // Clamp to at most MAX_YEARS in the past
      startYear = Math.max(creationYear, currentYear - MAX_YEARS + 1);
    } else {
      // Fallback: last 4 years (original behaviour)
      startYear = currentYear - 3;
    }

    const years: number[] = [];
    for (let y = startYear; y <= currentYear; y++) {
      years.push(y);
    }

    return forkJoin({
      contributions: forkJoin(years.map((year) => this.getContributions(year))),
      discussions: this.getDiscussions(),
      repoContributions: forkJoin(years.map((year) => this.getRepositoryContributions(year))),
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
          .sort((a, b) => b.totalContributions - a.totalContributions)
          .slice(0, 10);

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
   */
  getRepositoryInsights(createdAt?: string): Observable<RepositoryInsightsResponse> {
    const currentYear = new Date().getFullYear();
    const MAX_YEARS = 10;
    const TOP_REPOSITORIES_LIMIT = 10;

    let startYear: number;
    if (createdAt) {
      const creationYear = new Date(createdAt).getFullYear();
      startYear = Math.max(creationYear, currentYear - MAX_YEARS + 1);
    } else {
      startYear = currentYear - 3;
    }

    const years: number[] = [];
    for (let y = startYear; y <= currentYear; y++) {
      years.push(y);
    }

    return forkJoin(years.map((year) => this.getRepositoryContributions(year))).pipe(
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

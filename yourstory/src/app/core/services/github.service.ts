import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { forkJoin, map, Observable } from 'rxjs';
import { YearlyActivity } from '../models/activity.models';

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
}

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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
  year: number;
  discussions: number;
  discussionComments: number;
}

@Injectable({ providedIn: 'root' })
export class GitHubService {
  private readonly http = inject(HttpClient);

  /**
   * Fetches commit/issue/PR contributions for a given year.
   */
  getContributions(year: number): Observable<ContributionsResponse> {
    return this.http.get<ContributionsResponse>(
      `/api/github/contributions?year=${year}`
    );
  }

  /**
   * Fetches discussion activity for a given year.
   */
  getDiscussions(year: number): Observable<DiscussionsResponse> {
    return this.http.get<DiscussionsResponse>(
      `/api/github/discussions?year=${year}`
    );
  }

  /**
   * Combines contributions and discussions into a unified YearlyActivity object.
   */
  getYearlyActivity(year: number): Observable<YearlyActivity> {
    return forkJoin([
      this.getContributions(year),
      this.getDiscussions(year),
    ]).pipe(
      map(([contributions, discussions]) => ({
        year,
        commits: contributions.commits,
        issues: contributions.issues,
        pullRequests: contributions.pullRequests,
        reviews: contributions.reviews,
        privateContributions: contributions.privateContributions,
        discussions: discussions.discussions,
        discussionComments: discussions.discussionComments,
      }))
    );
  }
}

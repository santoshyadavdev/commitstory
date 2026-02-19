import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ActivitySummary } from '../models/activity.models';

export interface StoryRequest {
  genre: string;
  activity: ActivitySummary;
  year?: number;
  createdAt?: string;
}

export interface StoryResponse {
  story: string;
  genre: string;
  year?: number;
}

export const GENRES = [
  'Drama',
  'Biography',
  'Comedy',
  'Adventure',
  'Thriller',
  'Sci-Fi',
  'Documentary',
  'Sports',
] as const;

@Injectable({ providedIn: 'root' })
export class StoryService {
  private readonly http = inject(HttpClient);

  /**
   * Sends aggregated career contribution data to the server and returns a generated narrative.
   */
  generateStory(
    genre: string,
    activity: ActivitySummary,
    createdAt?: string
  ): Observable<StoryResponse> {
    const body: StoryRequest = { genre, activity, createdAt };
    return this.http.post<StoryResponse>('/api/stories/generate', body);
  }
}
